"""Task-agnostic desktop reset for demo mode.

Re-running a demo should start from a clean slate: if the last run left Slack
open and scrolled somewhere, the next agent shouldn't see that. Rather than a
per-task "undo" (which can't generalise — you can't undo a Slack read), we
rewind the whole *desktop* to a captured baseline:

  1. close the GUI apps the task may have opened (explicit allow-list — never
     the Xvfb / window-manager / SDK-bridge processes), then
  2. restore the session user's $HOME from a pristine tarball.

Crucially this happens IN PLACE. The pure-Python SDK bridge keeps running and
its cloud `session_id` — which the whole control plane targets per-run
(pool.py, hai.py) — stays valid. Recreating the container/VM would mint a NEW
session_id and force a re-register on every task; see
linux-runtime-proof/FINDINGS.md for why the bridge must be left untouched.

The baseline is a bare desktop (nothing pre-launched), so there is no relaunch
step — reset just tears the desktop back down to empty. Capture it once per VM
with capture_baseline() while the desktop is in the state you want every demo
to start from.

Runs over `gcloud compute ssh` because the VMs are VPC-firewalled, exactly like
verify.py. The remote logic lives in the RESET_SCRIPT / CAPTURE_SCRIPT strings
so it can be exercised standalone (the Docker+Xvfb harness runs the very same
bytes).
"""

from __future__ import annotations

import asyncio
import logging

from .config import settings

logger = logging.getLogger(__name__)


# --- remote scripts (also run verbatim by the test harness) -------------------
# Inputs come in as env vars so the same text works over ssh and in Docker.
#   HOME_DIR   – the desktop session user's home to rewind
#   BASELINE   – path to the pristine-home tarball (lives OUTSIDE home)
#   KILL_PROCS – space-separated GUI process names to terminate

RESET_SCRIPT = r"""
set -u
: "${HOME_DIR:?}"; : "${BASELINE:?}"; KILL_PROCS="${KILL_PROCS:-}"

# 1. Close GUI apps the task may have opened. Explicit allow-list only: we never
#    touch Xvfb, the window manager, or the python SDK bridge, so the bridge's
#    cloud session_id survives this reset.
for p in $KILL_PROCS; do
  pkill -x "$p" 2>/dev/null || true          # exact-name match, TERM
done
sleep 1
for p in $KILL_PROCS; do
  pkill -9 -x "$p" 2>/dev/null || true       # KILL any stragglers
done

# 2. Restore $HOME to the baseline. Wipe current contents (incl. dotfiles),
#    then extract the tarball. The tarball is outside $HOME so it is never
#    deleted here.
if [ ! -f "$BASELINE" ]; then
  echo "RESET_FAIL: baseline $BASELINE not found (run capture-baseline first)" >&2
  exit 3
fi
find "$HOME_DIR" -mindepth 1 -delete 2>/dev/null || true
tar xzf "$BASELINE" -C "$HOME_DIR"
echo "RESET_OK"
"""

CAPTURE_SCRIPT = r"""
set -u
: "${HOME_DIR:?}"; : "${BASELINE:?}"
mkdir -p "$(dirname "$BASELINE")"
# Snapshot the current home (the state every demo should start from) as the
# baseline. Exclude the tarball itself in case a prior one sits under $HOME.
tar czf "$BASELINE" -C "$HOME_DIR" --exclude "$(basename "$BASELINE")" . \
  && echo "CAPTURE_OK $(du -h "$BASELINE" | cut -f1)"
"""


def _env_prefix() -> str:
    """`VAR=... VAR=...` prefix injecting the reset inputs into the remote shell."""
    home = f"/home/{settings.demo_user}"
    kill = " ".join(settings.demo_kill_processes)
    # single-quote values; none contain quotes by construction
    return (
        f"HOME_DIR='{home}' "
        f"BASELINE='{settings.demo_baseline_path}' "
        f"KILL_PROCS='{kill}'"
    )


async def _ssh(vm: str, script: str) -> tuple[int, str, str]:
    """Run a bash script on a VM over gcloud ssh. Returns (rc, stdout, stderr)."""
    remote = f"{_env_prefix()} bash -s"
    proc = await asyncio.create_subprocess_exec(
        "gcloud", "compute", "ssh", vm, f"--zone={settings.gcp_zone}",
        f"--command={remote}",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate(script.encode())
    return proc.returncode or 0, out.decode().strip(), err.decode().strip()


async def reset_worker(vm: str) -> tuple[bool, str]:
    """Rewind a worker's desktop to the pristine baseline. (ok, human_summary)."""
    try:
        rc, out, err = await _ssh(vm, RESET_SCRIPT)
    except Exception as exc:  # noqa: BLE001 — surface any launch/ssh failure
        return False, f"reset errored: {exc}"
    if rc == 0 and "RESET_OK" in out:
        return True, "desktop reset to baseline"
    return False, f"reset failed (rc={rc}): {(err or out)[:200]}"


async def capture_baseline(vm: str) -> tuple[bool, str]:
    """Capture the worker's current $HOME as the baseline. (ok, human_summary)."""
    try:
        rc, out, err = await _ssh(vm, CAPTURE_SCRIPT)
    except Exception as exc:  # noqa: BLE001
        return False, f"capture errored: {exc}"
    if rc == 0 and out.startswith("CAPTURE_OK"):
        return True, f"baseline captured ({out.split(maxsplit=1)[-1]})"
    return False, f"capture failed (rc={rc}): {(err or out)[:200]}"
