#!/bin/bash
set -e

# Entrypoint for WorkFleet worker container.
# Starts: Xvfb -> openbox -> app (Tryton or Pitivi) -> hai bridge
# Writes the bridge session_id to /opt/agent/session_id for the pool to pick up.

export DISPLAY=:${DISPLAY_NUM:-99}
export XDG_SESSION_TYPE=x11

APP="${APP:-tryton}"
TRYTON_SERVER="${TRYTON_SERVER:-localhost:8000}"
HAI_API_KEY="${HAI_API_KEY:?HAI_API_KEY is required}"
HAI_API_BASE_URL="${HAI_API_BASE_URL:-https://agp.hcompany.ai}"
SESSION_ID="${SESSION_ID:-}"

mkdir -p /opt/agent

# ── 1. Xvfb ──────────────────────────────────────────────────────────
echo "[entrypoint] starting Xvfb on :${DISPLAY_NUM:-99} (${SCREEN_SIZE:-1280x800x24})"
Xvfb :${DISPLAY_NUM:-99} -screen 0 "${SCREEN_SIZE:-1280x800x24}" -nolisten tcp &
sleep 1

# ── 2. Window manager (needed for keyboard focus) ───────────────────
echo "[entrypoint] starting openbox"
openbox &
sleep 0.5

# ── 3. Application ──────────────────────────────────────────────────
case "$APP" in
  tryton)
    echo "[entrypoint] starting Tryton desktop client (server: $TRYTON_SERVER)"
    mkdir -p ~/.config/tryton
    cp /opt/agent/tryton-profile.conf ~/.config/tryton/tryton.conf
    tryton &
    sleep 5
    ;;
  pitivi)
    echo "[entrypoint] starting Pitivi video editor"
    if [ -f /tmp/sample.mp4 ]; then
      echo "[entrypoint] sample video found, creating project with clip"
      DISPLAY=:${DISPLAY_NUM:-99} python3 /opt/agent/setup_pitivi.py /tmp/sample.mp4 2>/dev/null || true
      DISPLAY=:${DISPLAY_NUM:-99} pitivi /tmp/test-project.xges &
    else
      DISPLAY=:${DISPLAY_NUM:-99} pitivi &
    fi
    sleep 8
    ;;
  libreoffice|libreoffice-writer)
    echo "[entrypoint] starting LibreOffice Writer"
    libreoffice --writer &
    sleep 5
    ;;
  libreoffice-calc)
    echo "[entrypoint] starting LibreOffice Calc"
    libreoffice --calc &
    sleep 5
    ;;
  libreoffice-impress)
    echo "[entrypoint] starting LibreOffice Impress"
    libreoffice --impress &
    sleep 5
    ;;
  slack)
    echo "[entrypoint] starting Slack (with --no-sandbox for Docker)"
    slack --no-sandbox --disable-gpu &
    sleep 10
    ;;
  none)
    echo "[entrypoint] no app to start (APP=none)"
    ;;
  *)
    echo "[entrypoint] unknown APP=$APP, starting xterm"
    xterm &
    sleep 2
    ;;
esac

# ── 4. hai bridge ────────────────────────────────────────────────────
echo "[entrypoint] starting hai local desktop bridge"
if [ -z "$SESSION_ID" ]; then
  SESSION_ID=$(/usr/bin/python3 -c "import uuid; print(uuid.uuid4())")
fi

echo "$SESSION_ID" > /opt/agent/session_id
echo "[entrypoint] session_id=$SESSION_ID"

exec /opt/agent/venv/bin/hai local desktop --session-id "$SESSION_ID"
