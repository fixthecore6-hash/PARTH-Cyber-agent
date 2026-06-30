#!/usr/bin/env bash
# =============================================================
#  PARTH — systemd Service Installer (Linux)
#  created_by:pushkar | helped_by:claude | parth-host-defender
#  PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
#  Run with sudo: sudo bash scripts/install_service.sh
# =============================================================
set -e
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="$(logname 2>/dev/null || echo "${SUDO_USER:-$USER}")"
CERT_DIR="$PARTH_DIR/certs"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# Read model from .env
PARTH_MODEL="mistral"
if [ -f "$PARTH_DIR/.env" ]; then
    _m="$(grep '^PARTH_MODEL=' "$PARTH_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '\r' | xargs)"
    [ -n "$_m" ] && PARTH_MODEL="$_m"
fi

echo -e "${CYAN}Installing PARTH as systemd service (user: $SERVICE_USER, model: $PARTH_MODEL)${NC}"

# ── Background start script (loaded by systemd) ───────────────
cat > "$PARTH_DIR/scripts/start_bg.sh" << BGEOF
#!/usr/bin/env bash
# PARTH background launcher — used by systemd
# created_by:pushkar | helped_by:claude
PARTH_DIR="$PARTH_DIR"
CERT_DIR="$CERT_DIR"
ENV_FILE="\$PARTH_DIR/.env"

# BUG 10 FIX: load .env before activating venv
[ -f "\$ENV_FILE" ] && set -a && source "\$ENV_FILE" && set +a

cd "\$PARTH_DIR/backend"
source .venv/bin/activate

if [ -f "\$CERT_DIR/cert.pem" ] && [ -f "\$CERT_DIR/key.pem" ]; then
    python main.py --ssl-certfile "\$CERT_DIR/cert.pem" --ssl-keyfile "\$CERT_DIR/key.pem" &
else
    python main.py &
fi
BACKEND_PID=\$!
echo \$BACKEND_PID > /tmp/parth_backend.pid

cd "\$PARTH_DIR/frontend"
if [ -f "vite.runtime.config.js" ]; then
    npm run dev -- --config vite.runtime.config.js --port 5173 &
else
    npm run dev -- --host 0.0.0.0 --port 5173 &
fi
FRONTEND_PID=\$!
echo \$FRONTEND_PID > /tmp/parth_frontend.pid

# BUG 11 FIX: wait with error propagation — if either process dies, exit non-zero
wait \$BACKEND_PID && wait \$FRONTEND_PID
BGEOF
chmod +x "$PARTH_DIR/scripts/start_bg.sh"

# ── systemd service unit ──────────────────────────────────────
cat > /etc/systemd/system/parth.service << UNIT
[Unit]
Description=PARTH Host Defender Cybersecurity AI
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PARTH_DIR
EnvironmentFile=-$PARTH_DIR/.env
Environment="PARTH_MODEL=$PARTH_MODEL"
# BUG 11 FIX: ExecStart is the foreground process (start_bg.sh with wait)
# systemd tracks this PID; if either subprocess dies, wait returns non-zero
# and Restart=on-failure triggers correctly
ExecStart=/bin/bash $PARTH_DIR/scripts/start_bg.sh
ExecStop=/bin/bash -c 'kill $(cat /tmp/parth_backend.pid /tmp/parth_frontend.pid 2>/dev/null) 2>/dev/null || true'
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
echo -e "${GREEN}[✓]${NC} systemd service installed"
echo ""
echo -e "  Enable + start now:  ${YELLOW}sudo systemctl enable --now parth${NC}"
echo -e "  View logs:           ${YELLOW}journalctl -u parth -f${NC}"
echo -e "  Stop:                ${YELLOW}sudo systemctl stop parth${NC}"
echo ""
