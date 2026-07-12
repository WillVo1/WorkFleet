FROM python:3.12-slim

# ── System packages: X11 stack + GUI apps + build deps ──────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        # X11 / display
        xvfb x11-utils x11-xserver-utils xauth \
        scrot xterm xdotool wmctrl openbox \
        libx11-6 libxext6 libxtst6 libxrender1 libxi6 \
        # Python build deps (for pynput/evdev C extension)
        gcc build-essential linux-libc-dev python3-dev \
        python3-tk \
        # System utils
        procps ca-certificates wget \
        # Tryton GTK client
        tryton-client \
        # Pitivi video editor + GES
        pitivi python3-ges-1.0 gir1.2-ges-1.0 libges-1.0-0 \
        # GStreamer plugins (for Pitivi video decoding)
        gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
        gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly \
        gstreamer1.0-libav \
        # FFmpeg (for generating test clips)
        ffmpeg \
        # LibreOffice (word processor, spreadsheet, presentation — no login)
        libreoffice libreoffice-gtk3 \
        # Slack (messaging — needs login)
        && wget -q -O /tmp/slack.deb "https://downloads.slack-edge.com/desktop-releases/linux/x64/4.41.105/slack-desktop-4.41.105-amd64.deb" \
        && apt-get install -y /tmp/slack.deb || true \
        && rm -f /tmp/slack.deb \
    && rm -rf /var/lib/apt/lists/*

# ── Python venv for hai bridge ───────────────────────────────────────
RUN python3 -m venv /opt/agent/venv
RUN /opt/agent/venv/bin/pip install --no-cache-dir \
        "hai-agents[cli,desktop]" \
        pyautogui pynput pyscreeze pillow

# ── Patch 1: pyscreeze — force X11 + scrot, disable gnome-screenshot ─
RUN PYS=/opt/agent/venv/lib/python3.12/site-packages/pyscreeze/__init__.py && \
    sed -i 's/^GNOMESCREENSHOT_EXISTS = .*/GNOMESCREENSHOT_EXISTS = False/' "$PYS" && \
    sed -i 's/^        GNOMESCREENSHOT_EXISTS = .*/        GNOMESCREENSHOT_EXISTS = False/' "$PYS" && \
    sed -i 's/^    RUNNING_X11 = .*/    RUNNING_X11 = True/' "$PYS" && \
    sed -i 's/^        RUNNING_X11 = .*/        RUNNING_X11 = True/' "$PYS" && \
    sed -i 's/^    else:/    else:  # patched: always X11/' "$PYS" && \
    echo "[build] pyscreeze patched: RUNNING_X11=True, GNOMESCREENSHOT_EXISTS=False"

# ── Patch 2: hai_drivers — replace pynput keyboard with pyautogui ────
RUN DRV=/opt/agent/venv/lib/python3.12/site-packages/hai_drivers/desktop/local/driver.py && \
    sed -i 's/self\._keyboard\.type(char)/pyautogui.write(char)/' "$DRV" && \
    sed -i 's/self\._keyboard\.type(text)/pyautogui.write(text)/' "$DRV" && \
    sed -i 's/self\._keyboard\.press(key_parsed)/pyautogui.keyDown(str(key_parsed))/' "$DRV" && \
    sed -i 's/self\._keyboard\.release(key_parsed)/pyautogui.keyUp(str(key_parsed))/' "$DRV" && \
    echo "[build] driver.py patched: pynput -> pyautogui for keyboard"

# ── Copy helper scripts ──────────────────────────────────────────────
COPY entrypoint.sh /opt/agent/entrypoint.sh
COPY setup_pitivi.py /opt/agent/setup_pitivi.py
COPY tryton.conf /opt/agent/tryton-profile.conf
RUN chmod +x /opt/agent/entrypoint.sh

# Create a non-root user for Electron apps (Slack) that refuse to run as root
RUN useradd -m -s /bin/bash agent
RUN mkdir -p /opt/agent && chown agent:agent /opt/agent
USER agent
ENV HOME=/home/agent

WORKDIR /opt/agent
ENV DISPLAY=:99
ENV XDG_SESSION_TYPE=x11

ENTRYPOINT ["/opt/agent/entrypoint.sh"]
