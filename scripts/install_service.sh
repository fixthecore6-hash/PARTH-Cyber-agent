#!/usr/bin/env bash
# PARTH systemd service installer
set -e
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER="$(logname 2>/dev/null || echo $SUDO_USER || echo $USER)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Load model from .env if available
PARTH_MODEL="mistral"
if [ -f "$PARTH_DIR/.env" ]; then
    _m=$(grep "^PARTH_MODEL=" "$PARTH_DIR/.env" | cut -d= -f2)
    [ -n "$_m" ] && PARTH_MODEL="$_m"
fi

cat > /etc/systemd/system/parth.service << EOF
[Unit]
Description=PARTH Cybersecurity AI
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=forking
User=$USER
WorkingDirectory=$PARTH_DIR/backend
Environment="PARTH_MODEL=$PARTH_MODEL"
EnvironmentFile=-$PARTH_DIR/.env
ExecStartPre=/bin/bash -c 'cd $PARTH_DIR/backend && source .venv/bin/activate'
ExecStart=/bin/bash $PARTH_DIR/scripts/start_bg.sh
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Minimal background start script
cat > "$PARTH_DIR/scripts/start_bg.sh" << 'BGEOF'
#!/usr/bin/env bash
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PARTH_DIR/backend"
source .venv/bin/activate
python main.py &
cd "$PARTH_DIR/frontend"
npm run dev -- --host 0.0.0.0 &
wait
BGEOF
chmod +x "$PARTH_DIR/scripts/start_bg.sh"

systemctl daemon-reload
echo -e "${GREEN}[✓]${NC} systemd service installed"
echo -e "${YELLOW}Run:${NC} sudo systemctl enable --now parth"
