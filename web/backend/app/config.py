"""Application settings, sourced from environment / .env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent.parent
load_dotenv(BACKEND_DIR / ".env")  # backend-local overrides win
load_dotenv(REPO_ROOT / ".env")  # repo-root .env holds GRADIUM_KEY (does not override)


class Settings:
    """Runtime configuration. Immutable after import."""

    hai_api_key: str = os.environ.get("HAI_API_KEY", "")
    hai_base_url: str | None = os.environ.get("HAI_BASE_URL") or None  # SDK default = EU

    # Gradium speech-to-text (voice input on the New Task composer)
    gradium_key: str = os.environ.get("GRADIUM_KEY", "")
    gradium_stt_url: str = os.environ.get(
        "GRADIUM_STT_URL", "https://api.gradium.ai/api/post/speech/asr"
    )

    db_path: Path = Path(os.environ.get("FLEET_DB", BACKEND_DIR / "fleet.db"))
    workers_file: Path = Path(os.environ.get("WORKERS_FILE", BACKEND_DIR / "workers.json"))

    gcp_zone: str = os.environ.get("GCP_ZONE", "us-east4-a")
    trytond_vm: str = os.environ.get("TRYTOND_VM", "trytond-server")

    # Per-run budget (user decision 2026-07-11: max steps, default time)
    max_steps: int = int(os.environ.get("MAX_STEPS", "200"))

    # Demo mode: rewind each worker's desktop to a pristine baseline BEFORE every
    # task, so re-running a demo starts from a clean slate (e.g. no Slack window
    # left open from the last run). Task-agnostic: it restores the desktop, it
    # does not undo whatever the task wrote to external services. Default OFF so
    # it can never touch a real environment. See reset.py.
    demo_mode: bool = os.environ.get("DEMO_MODE", "").lower() in ("1", "true", "yes", "on")
    # Remote user whose $HOME is the desktop session (baseline is a tar of this dir).
    demo_user: str = os.environ.get("DEMO_USER", "agent")
    # Where the pristine-home tarball lives on each VM (written by capture-baseline).
    demo_baseline_path: str = os.environ.get(
        "DEMO_BASELINE_PATH", "/opt/agent/home-baseline.tgz"
    )
    # GUI processes the reset kills; the Xvfb/openbox/SDK-bridge stack is left alone
    # so the bridge session_id survives (see linux-runtime-proof/FINDINGS.md).
    demo_kill_processes: tuple[str, ...] = tuple(
        p for p in os.environ.get(
            "DEMO_KILL_PROCESSES", "slack,chrome,chromium,firefox,xterm,soffice"
        ).split(",") if p.strip()
    )

    # Long-poll tuning for the event watcher
    changes_wait_seconds: int = 15
    watcher_retry_seconds: float = 3.0

    allowed_screenshot_hosts = ("agp.eu.hcompany.ai", "agp.hcompany.ai")

    # NemoClaw sandbox: in passive mode (default) it logs and stamps manifests
    # but never blocks. Set NEMOCLAW_ACTIVE=true to enforce sanitization + audit.
    nemoclaw_active: bool = os.environ.get("NEMOCLAW_ACTIVE", "").lower() in ("1", "true", "yes", "on")


settings = Settings()

if not settings.hai_api_key:
    raise RuntimeError("HAI_API_KEY is not set — copy .env.example to .env and fill it in")
