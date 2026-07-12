# WorkFleet

A parallel computer-use agent fleet control plane. Submit plain-language tasks through a web UI — they're dispatched to remote GCP VMs running desktop apps, driven by H Company's `hai` computer-use agent. Watch live screenshots and agent reasoning stream back in real time.

## What It Does

1. **You type a task** in the webapp (or pick a preset) — e.g. *"Create a sales order for Acme Corp"*
2. **The dispatcher** finds an idle worker VM, creates an H Company agent session targeting that VM's desktop
3. **The agent** drives the desktop (mouse, keyboard, screenshots) — Tryton ERP, LibreOffice, Thunderbird, Slack, Pitivi, or any Linux GUI app
4. **Live feed** streams back: screenshots, agent thinking, tool actions, metrics — all visible in the UI and on the H Company platform

## Architecture

```
Your Mac (browser)              GCP VMs                     H Company Cloud
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│  React/Vite  │      │  Worker VM 1         │      │  Holo3 Agent (cloud) │
│  frontend    │◄────►│  Xvfb + openbox +   │◄────►│  agp.hcompany.ai     │
│  :5173       │ WS   │  apps (Tryton, etc) │      │                      │
│              │      │  hai bridge         │      │  Session runs here   │
│  FastAPI     │      └─────────────────────┘      │  Commands → VM       │
│  backend     │      ┌─────────────────────┐      │  Screenshots ← VM    │
│  :8787       │      │  Worker VM 2         │      │                      │
│  SQLite DB   │      │  Xvfb + Pitivi       │◄────►│                      │
│  dispatcher  │      │  hai bridge         │      └──────────────────────┘
│  pool        │      └─────────────────────┘
│  watcher     │
└──────────────┘
```

- **Frontend** (React + Vite + Tailwind): task submission, live feed with screenshots, worker status, voice-to-text via Gradium
- **Backend** (FastAPI + SQLite): FIFO dispatcher, worker pool (reads bridge session IDs via `gcloud ssh`), event watcher (long-polls H Company AGP for session changes), screenshot proxy, verification
- **Worker VMs**: headless Linux desktops (Xvfb + openbox), each running one or more GUI apps + the `hai local desktop` bridge
- **H Company Cloud**: the Holo3 agent brain runs in the cloud — only the bridge (hands/eyes) lives on the VM

## Key Design Decisions

- **No `hai-agent-runtime` binary needed** — the pip SDK's pure-Python `PyautoguiDesktopBridge` works headless on Linux (see `linux-runtime-proof/FINDINGS.md`)
- **One bridge = one desktop = one session** — N VMs = N parallel agent sessions, removing the "one session at a time" bottleneck
- **Inline agents** — each session passes an `Agent` with the target VM's `session_id` inline, so the registered `local-desktop` agent never needs updating per task
- **404-tolerant polling** — fresh sessions can transiently 404 on the AGP; the watcher retries through it
- **Screenshot proxy** — browser `<img>` tags can't send the bearer token, so the backend proxies screenshot URLs from `agp.hcompany.ai`

## Quick Start

### Prerequisites
- GCP account with `gcloud` CLI authed
- H Company API key (`HAI_API_KEY`)
- One or more worker VMs with the `hai local desktop` bridge running (see `linux-runtime-proof/`)

### Backend

```bash
cd web/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # fill in HAI_API_KEY, GCP_ZONE, etc.
.venv/bin/uvicorn app.main:app --port 8787
```

### Frontend

```bash
cd web/frontend
npm install
npx vite --port 5173
```

Open http://localhost:5173

### Worker VMs

Declare them in `web/backend/workers.json`:

```json
{
  "workers": [
    { "name": "agent-vm-1", "ip": "10.150.0.7" },
    { "name": "agent-vm-2", "ip": "10.150.0.9" }
  ]
}
```

Each VM must have:
- `Xvfb` running on a display (e.g. `:99`)
- `openbox` window manager (for keyboard focus)
- `scrot` for screenshots
- The `hai local desktop` bridge, writing its session ID to `/opt/agent/session_id`
- See `linux-runtime-proof/` for the full setup script and patches

After a VM boots, hit **POST /api/workers/refresh** (or the refresh button in the UI) to read its bridge session ID.

## Worker Pool

The pool (`pool.py`) reads each VM's bridge `session_id` over `gcloud compute ssh`. A worker is:
- **idle** — bridge registered, ready for tasks
- **busy** — running a task
- **offline** — no bridge session ID found

## Dispatcher

The dispatcher (`dispatcher.py`) is a FIFO queue:
1. User submits a task → `POST /api/task`
2. Dispatcher picks the next idle worker
3. Creates an H Company session (inline `Agent` with the worker's `session_id`)
4. Watcher long-polls `get_session_changes` → streams events to the UI via WebSocket
5. On completion, runs task-specific verification (`verify.py`) if configured
6. Worker is released back to idle

## Task Presets

Pre-built tasks in `prompts.py` with app-specific context:
- `create_sale` — Create & quote a sale (Office Chair x4) in Tryton
- `create_customer` — Create a customer with email contact in Tryton
- `create_product` — Create a salable product in Tryton
- `attach_document` — Attach a contract file to a sale in Tryton

Or type a free-text task — the dispatcher enriches it with the base preamble and answer guidance.

## Demo Mode

Set `DEMO_MODE=1` to enable:
- Desktop reset before every task (rewinds to a pristine baseline tarball)
- Reset/capture buttons in the UI sidebar
- Per-worker reset via `POST /api/workers/{name}/reset`

## Voice Input

The New Task dialog has a microphone button (Gradium speech-to-text). Set `GRADIUM_KEY` in the repo root `.env`.

## Project Structure

```
WorkFleet/
├── web/
│   ├── backend/           # FastAPI control plane
│   │   ├── app/
│   │   │   ├── main.py        # Routes + WebSocket
│   │   │   ├── dispatcher.py # FIFO queue → idle worker → hai session
│   │   │   ├── pool.py       # Worker pool (gcloud ssh session_id discovery)
│   │   │   ├── hai.py        # hai-agents SDK wrapper (create_session, stream)
│   │   │   ├── prompts.py    # Base preamble + app context + presets
│   │   │   ├── feed.py       # Event → FeedEvent transformer
│   │   │   ├── verify.py     # Post-task DB verification
│   │   │   ├── reset.py       # Demo mode desktop reset
│   │   │   ├── stt.py        # Gradium speech-to-text
│   │   │   ├── ws.py         # WebSocket manager
│   │   │   ├── config.py     # Settings from env/.env
│   │   │   ├── db.py         # SQLite persistence
│   │   │   └── models.py     # Pydantic models (Task, Worker, FeedEvent)
│   │   ├── workers.json      # Worker VM declarations
│   │   └── requirements.txt
│   ├── frontend/          # React/Vite/Tailwind
│   │   └── src/
│   │       ├── App.tsx       # Main layout
│   │       ├── components/   # Sidebar, NewTask, SessionView, Feed, etc.
│   │       ├── hooks/        # useFleet (WS state), useTypewriter
│   │       └── lib/         # api client, formatting, mic recorder
│   └── README.md           # Detailed webapp docs
├── linux-runtime-proof/    # Proof that hai runs headless on Linux
│   ├── Dockerfile          # X11 stack + hai bridge + patches
│   ├── FINDINGS.md          # M0/M1 findings + fixes
│   └── scripts/             # Test scripts (e2e, driver, auth, kbd)
├── DESIGN.md               # Full architecture design doc
└── README.md               # This file
```

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Backend**: Python 3.12, FastAPI, uvicorn, SQLite (aiosqlite)
- **Agent**: H Company `hai-agents` SDK + Holo3 model (cloud)
- **Bridge**: `hai local desktop` (pyautogui + pyscreeze + Xvfb on Linux)
- **Voice**: Gradium speech-to-text API
- **VMs**: GCP Compute Engine (e2-standard-2, Ubuntu 24.04)
