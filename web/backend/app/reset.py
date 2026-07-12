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
import shlex

from .config import settings

logger = logging.getLogger(__name__)

# Bound the gcloud ssh call so one unreachable/booting VM can't hang the single
# dispatch loop (reset is best-effort — a timeout is just a failed reset).
SSH_TIMEOUT_S = 90


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

# 2. Restore $HOME to the baseline. Do it SAFELY: verify the tarball, extract to
#    a staging dir FIRST, and only swap once extraction fully succeeds — so a
#    corrupt/truncated baseline or a mid-extract failure (e.g. disk full) can
#    never leave $HOME half-wiped. RESET_OK is printed ONLY on real success.
if [ ! -f "$BASELINE" ]; then
  echo "RESET_FAIL: baseline $BASELINE not found (run capture-baseline first)" >&2
  exit 3
fi
if ! tar tzf "$BASELINE" >/dev/null 2>&1; then      # integrity check before touching $HOME
  echo "RESET_FAIL: baseline $BASELINE is unreadable/corrupt" >&2
  exit 4
fi
STAGE="$HOME_DIR/.reset-stage.$$"
rm -rf "$STAGE"
if ! mkdir -p "$STAGE"; then
  echo "RESET_FAIL: cannot create staging dir in $HOME_DIR" >&2
  exit 5
fi
if ! tar xzf "$BASELINE" -C "$STAGE"; then
  rm -rf "$STAGE"
  echo "RESET_FAIL: baseline extract failed" >&2
  exit 6
fi
# extraction fully succeeded — swap: wipe $HOME (except the stage), copy the
# staged tree (incl. dotfiles) back in, then drop the stage.
find "$HOME_DIR" -mindepth 1 -maxdepth 1 ! -name ".reset-stage.$$" -exec rm -rf {} + 2>/dev/null || true
cp -a "$STAGE"/. "$HOME_DIR"/
rc=$?
rm -rf "$STAGE"
if [ "$rc" -ne 0 ]; then
  echo "RESET_FAIL: restore copy failed" >&2
  exit 7
fi
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


def _remote_command() -> str:
    """The `--command` string: run the piped script AS the desktop user, with the
    reset inputs injected as env vars.

    Everything is shlex-quoted (no "safe by construction" assumptions), so a
    stray quote in DEMO_USER / path / process names can't break out of the shell.
    We privilege-step with `sudo -u <user>` — matching verify.py's convention —
    so find/tar run as the home's owner (not the raw gcloud ssh login user),
    which fixes silent permission-denied and wrong-ownership restores. Env vars
    are passed on sudo's own argv (env VAR=..), since a plain `VAR=.. sudo` would
    be stripped by sudo before the target shell sees it.
    """
    user = settings.demo_user
    home = getattr(settings, "demo_home_dir", f"/home/{user}")
    kill = " ".join(settings.demo_kill_processes)
    envs = [
        f"HOME_DIR={shlex.quote(home)}",
        f"BASELINE={shlex.quote(settings.demo_baseline_path)}",
        f"KILL_PROCS={shlex.quote(kill)}",
    ]
    return (
        f"sudo -n -u {shlex.quote(user)} env {' '.join(envs)} "
        f"bash -s"
    )


async def _ssh(vm: str, script: str) -> tuple[int, str, str]:
    """Run a bash script on a VM over gcloud ssh. Returns (rc, stdout, stderr).

    Bounded by SSH_TIMEOUT_S so a hung VM can't stall the dispatch loop; on
    timeout the process is killed and reported as a (nonzero) failure.
    """
    proc = await asyncio.create_subprocess_exec(
        "gcloud", "compute", "ssh", vm, f"--zone={settings.gcp_zone}",
        f"--command={_remote_command()}",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(
            proc.communicate(script.encode()), timeout=SSH_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        proc.kill()
        return 124, "", f"gcloud ssh timed out after {SSH_TIMEOUT_S}s"
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
