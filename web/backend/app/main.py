"""Fleet control plane: FastAPI app wiring routes, WS, and lifecycle."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .db import db
from .dispatcher import dispatcher
from .models import TaskCreate
from .pool import pool
from .prompts import PRESETS
from .reset import capture_baseline, reset_worker
from .stt import TranscriptionError, transcribe
from .ws import manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    orphaned = await db.reconcile_orphans()
    if orphaned:
        logging.getLogger(__name__).info("reconciled %d orphaned task(s)", orphaned)
    pool.load()
    await pool.refresh()
    dispatcher.start()
    yield
    await db.close()


app = FastAPI(title="Tryton Fleet Control Plane", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/presets")
async def presets():
    return [{"key": k, "label": v["label"]} for k, v in PRESETS.items()]


@app.get("/api/config")
async def config():
    """Client-visible runtime config (gates demo-only UI affordances)."""
    return {"demo_mode": settings.demo_mode}


@app.get("/api/workers")
async def workers():
    return [w.model_dump() for w in pool.workers]


@app.post("/api/workers/refresh")
async def workers_refresh():
    return [w.model_dump() for w in await pool.refresh()]


def _require_demo() -> None:
    if not settings.demo_mode:
        raise HTTPException(403, "demo mode is off (set DEMO_MODE=1)")


def _require_known_worker(name: str) -> None:
    if name not in {w.name for w in pool.workers}:
        raise HTTPException(404, f"unknown worker '{name}'")


@app.post("/api/workers/{name}/reset")
async def worker_reset(name: str):
    """Manually rewind a worker's desktop to the pristine baseline (demo only)."""
    _require_demo()
    _require_known_worker(name)
    ok, summary = await reset_worker(name)
    if not ok:
        raise HTTPException(502, summary)
    return {"reset": True, "summary": summary}


@app.post("/api/workers/{name}/baseline")
async def worker_baseline(name: str):
    """Capture a worker's current $HOME as the demo baseline (demo only)."""
    _require_demo()
    _require_known_worker(name)
    ok, summary = await capture_baseline(name)
    if not ok:
        raise HTTPException(502, summary)
    return {"captured": True, "summary": summary}


@app.post("/api/task", status_code=201)
async def create_task(body: TaskCreate):
    task = await dispatcher.submit(body.text, body.preset)
    return task.model_dump()


@app.get("/api/tasks")
async def list_tasks():
    return [t.model_dump() for t in await db.list_tasks()]


@app.post("/api/tasks/clear-completed")
async def clear_completed():
    return {"cleared": await db.clear_completed()}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    task = await db.get_task(task_id)
    if not task:
        raise HTTPException(404)
    events = await db.list_events(task_id)
    return {"task": task.model_dump(), "events": [e.model_dump() for e in events]}


@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    ok = await dispatcher.stop(task_id)
    if not ok:
        raise HTTPException(409, "task not running")
    return {"stopped": True}


@app.get("/api/screenshot")
async def screenshot(url: str):
    """Proxy session screenshots: browser <img> tags can't send the bearer token."""
    host = httpx.URL(url).host
    if host not in settings.allowed_screenshot_hosts:
        raise HTTPException(400, "host not allowed")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            url, headers={"Authorization": f"Bearer {settings.hai_api_key}"},
            follow_redirects=True, timeout=20,
        )
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/png"),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.post("/api/transcribe")
async def transcribe_audio(request: Request):
    """Transcribe mic audio: browser POSTs raw audio bytes, we proxy to Gradium.

    Body is the recorded audio; Content-Type tells Gradium the codec
    (audio/wav, audio/ogg, ...). Returns {"text": "<transcript>"}.
    """
    audio = await request.body()
    if not audio:
        raise HTTPException(400, "empty audio body")
    content_type = request.headers.get("content-type", "audio/wav")
    try:
        text = await transcribe(audio, content_type)
    except TranscriptionError as exc:
        raise HTTPException(502, str(exc))
    return {"text": text}


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # client pings; we only broadcast
    except WebSocketDisconnect:
        manager.disconnect(ws)
