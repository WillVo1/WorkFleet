"""SQLite persistence for tasks and feed events (aiosqlite)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from .config import settings
from .models import FeedEvent, Task, TaskStatus

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    prompt TEXT NOT NULL,
    preset TEXT,
    status TEXT NOT NULL,
    worker TEXT,
    hai_session_id TEXT,
    answer TEXT,
    outcome TEXT,
    verification TEXT,
    steps INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    last_screenshot_url TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
    task_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (task_id, seq)
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self) -> None:
        self._conn: Optional[aiosqlite.Connection] = None

    async def connect(self) -> None:
        self._conn = await aiosqlite.connect(settings.db_path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.executescript(_SCHEMA)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()

    @property
    def conn(self) -> aiosqlite.Connection:
        assert self._conn is not None, "Database not connected"
        return self._conn

    # -- tasks ---------------------------------------------------------------

    async def insert_task(self, task: Task) -> None:
        await self.conn.execute(
            """INSERT INTO tasks (id, text, prompt, preset, status, worker, hai_session_id,
               answer, outcome, verification, steps, cost_usd, last_screenshot_url,
               created_at, finished_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                task.id, task.text, task.prompt, task.preset, task.status.value,
                task.worker, task.hai_session_id, task.answer, task.outcome,
                task.verification, task.steps, task.cost_usd, task.last_screenshot_url,
                task.created_at, task.finished_at,
            ),
        )
        await self.conn.commit()

    async def update_task(self, task_id: str, **fields) -> None:
        if not fields:
            return
        if isinstance(fields.get("status"), TaskStatus):
            fields["status"] = fields["status"].value
        cols = ", ".join(f"{k} = ?" for k in fields)
        await self.conn.execute(
            f"UPDATE tasks SET {cols} WHERE id = ?", (*fields.values(), task_id)
        )
        await self.conn.commit()

    async def get_task(self, task_id: str) -> Optional[Task]:
        cur = await self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = await cur.fetchone()
        return _row_to_task(row) if row else None

    async def list_tasks(self) -> list[Task]:
        cur = await self.conn.execute("SELECT * FROM tasks ORDER BY created_at DESC")
        return [_row_to_task(r) for r in await cur.fetchall()]

    async def reconcile_orphans(self) -> int:
        """On startup, fail any task left non-terminal by a previous process —
        its watcher died with that process, so it would otherwise show 'running'
        forever."""
        live = (
            TaskStatus.QUEUED_LOCAL.value, TaskStatus.QUEUED_REMOTE.value,
            TaskStatus.RUNNING.value, TaskStatus.VERIFYING.value,
        )
        placeholders = ",".join("?" for _ in live)
        cur = await self.conn.execute(
            f"UPDATE tasks SET status = ?, verification = ?, finished_at = ? "
            f"WHERE status IN ({placeholders})",
            (TaskStatus.FAILED.value, "interrupted by server restart", utcnow(), *live),
        )
        await self.conn.commit()
        return cur.rowcount

    async def clear_completed(self) -> int:
        terminal = (
            TaskStatus.SUCCEEDED.value, TaskStatus.DONE_UNVERIFIED.value,
            TaskStatus.FAILED.value, TaskStatus.CANCELLED.value,
        )
        placeholders = ",".join("?" for _ in terminal)
        cur = await self.conn.execute(
            f"DELETE FROM tasks WHERE status IN ({placeholders})", terminal
        )
        await self.conn.execute(
            "DELETE FROM events WHERE task_id NOT IN (SELECT id FROM tasks)"
        )
        await self.conn.commit()
        return cur.rowcount

    async def delete_task(self, task_id: str) -> str | None:
        """Delete one finished task and its events.

        Returns None if no such task, "active" if it's still running (refused),
        or "deleted" on success.
        """
        terminal = {
            TaskStatus.SUCCEEDED.value, TaskStatus.DONE_UNVERIFIED.value,
            TaskStatus.FAILED.value, TaskStatus.CANCELLED.value,
        }
        task = await self.get_task(task_id)
        if not task:
            return None
        if task.status.value not in terminal:
            return "active"
        await self.conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await self.conn.execute("DELETE FROM events WHERE task_id = ?", (task_id,))
        await self.conn.commit()
        return "deleted"

    # -- events --------------------------------------------------------------

    async def append_event(self, ev: FeedEvent) -> None:
        await self.conn.execute(
            "INSERT OR REPLACE INTO events (task_id, seq, kind, payload) VALUES (?,?,?,?)",
            (ev.task_id, ev.seq, ev.kind, ev.model_dump_json()),
        )
        await self.conn.commit()

    async def list_events(self, task_id: str, after_seq: int = -1) -> list[FeedEvent]:
        cur = await self.conn.execute(
            "SELECT payload FROM events WHERE task_id = ? AND seq > ? ORDER BY seq",
            (task_id, after_seq),
        )
        return [FeedEvent(**json.loads(r["payload"])) for r in await cur.fetchall()]


def _row_to_task(row: aiosqlite.Row) -> Task:
    d = dict(row)
    d["status"] = TaskStatus(d["status"])
    return Task(**d)


db = Database()
