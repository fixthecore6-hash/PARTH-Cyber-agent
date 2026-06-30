#!/usr/bin/env bash
# =============================================================
#  PARTH — Start Script (Linux)
#  created_by:pushkar | helped_by:claude | parth-host-defender
#  PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
#  Run: bash scripts/start.sh
# =============================================================

set -e
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PARTH_DIR/.env"
CERT_DIR="$PARTH_DIR/certs"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  PARTH — Host Defender${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Cleanup on Ctrl+C ─────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down PARTH...${NC}"
    [ -n "${BACKEND_PID:-}"  ] && kill "$BACKEND_PID"  2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# ── [0] Dependency checks ─────────────────────────────────────
echo "[0/6] Checking dependencies..."

command -v python3 >/dev/null 2>&1 \
    || { echo -e "${RED}[ERR]${NC} python3 not found. Run setup first: bash scripts/setup.sh"; exit 1; }
echo -e "${GREEN}[OK]${NC}  python3: $(python3 --version 2>&1 | awk '{print $2}')"

command -v node >/dev/null 2>&1 \
    || { echo -e "${RED}[ERR]${NC} node not found. Run setup first: bash scripts/setup.sh"; exit 1; }
echo -e "${GREEN}[OK]${NC}  node: $(node --version)"

command -v ollama >/dev/null 2>&1 \
    || { echo -e "${RED}[ERR]${NC} ollama not found. Run setup first: bash scripts/setup.sh"; exit 1; }
echo -e "${GREEN}[OK]${NC}  ollama installed"

# Check certs — generate if missing (user may have skipped setup)
if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
    echo -e "${YELLOW}[!]${NC}  TLS certs missing — generating self-signed certs now..."
    mkdir -p "$CERT_DIR"
    LAN_IP2="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}')"
    [ -z "$LAN_IP2" ] && LAN_IP2="127.0.0.1"
    openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
        -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
        -subj "/CN=PARTH-Dashboard" \
        -addext "subjectAltName=IP:127.0.0.1,IP:$LAN_IP2,DNS:localhost" 2>/dev/null
    echo -e "${GREEN}[OK]${NC}  TLS certs generated"
fi
echo -e "${GREEN}[OK]${NC}  TLS certs present"

# ── [1] Load / create .env ────────────────────────────────────
echo ""
echo "[1/6] Configuring environment..."

# Fix Windows line endings in .env if someone edited on Windows
[ -f "$ENV_FILE" ] && sed -i 's/\r//' "$ENV_FILE"

# Create .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "PARTH_MODEL=mistral" > "$ENV_FILE"
    echo "PARTH_ALLOW_EXECUTE=false" >> "$ENV_FILE"
fi

# Read model — always respect what's in .env
PARTH_MODEL="$(grep '^PARTH_MODEL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '\r' | xargs)"
[ -z "$PARTH_MODEL" ] && PARTH_MODEL="mistral"

read -rp "  LAN mode? (y/n) [y]: " _lan
_lan="${_lan:-y}"

if [[ "$_lan" =~ ^[Yy]$ ]]; then
    LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}')"
    [ -z "$LAN_IP" ] && LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
    PARTH_HOST="0.0.0.0"
    IS_LOCAL=false
    echo -e "${GREEN}[OK]${NC}  LAN mode — IP: $LAN_IP"
else
    LAN_IP="127.0.0.1"
    PARTH_HOST="127.0.0.1"
    IS_LOCAL=true
    echo -e "${GREEN}[OK]${NC}  Localhost only"
fi

FRONTEND_PORT=5173
BACKEND_PORT=8000

echo -e "${GREEN}[OK]${NC}  Model: $PARTH_MODEL"
echo -e "${GREEN}[OK]${NC}  Frontend: https://$LAN_IP:$FRONTEND_PORT"
echo -e "${GREEN}[OK]${NC}  Backend:  https://$LAN_IP:$BACKEND_PORT"

# ── [2] Python venv + deps ────────────────────────────────────
echo ""
echo "[2/6] Setting up backend..."
cd "$PARTH_DIR/backend"

# BUG 10 FIX: load .env BEFORE activating venv so PATH isn't overwritten
set -a; source "$ENV_FILE"; set +a

if [ ! -f ".venv/bin/activate" ]; then
    echo "  Creating venv (first run)..."
    python3 -m venv .venv
fi
source .venv/bin/activate

# Always sync deps — picks up any new packages (mss, etc.) on existing installs
echo "  Syncing Python dependencies..."
pip install -q -r requirements.txt
echo -e "${GREEN}[OK]${NC}  Backend venv ready"

# ── [3] Ollama ────────────────────────────────────────────────
echo ""
echo "[3/6] Setting up Ollama..."

if ! pgrep -x ollama >/dev/null 2>&1; then
    echo "  Starting Ollama daemon..."
    ollama serve >/tmp/parth_ollama.log 2>&1 &
    sleep 3
fi
echo -e "${GREEN}[OK]${NC}  Ollama running"

# Pull model only if not already present
if ! ollama list 2>/dev/null | grep -q "^$PARTH_MODEL"; then
    echo "  Pulling model '$PARTH_MODEL' (first time, may take minutes)..."
    ollama pull "$PARTH_MODEL" \
        || echo -e "${YELLOW}[WARN]${NC} Pull failed — AI needs: ollama pull $PARTH_MODEL"
fi
echo -e "${GREEN}[OK]${NC}  Model '$PARTH_MODEL' ready"

# ── [4] Firewall ──────────────────────────────────────────────
echo ""
echo "[4/6] Firewall..."
if [[ "$_lan" =~ ^[Yy]$ ]]; then
    if command -v ufw >/dev/null 2>&1; then
        sudo ufw allow "$FRONTEND_PORT/tcp" >/dev/null 2>&1 \
            && echo -e "${GREEN}[OK]${NC}  Port $FRONTEND_PORT open" \
            || echo -e "${YELLOW}[!]${NC}  Port $FRONTEND_PORT — check manually"
        sudo ufw allow "$BACKEND_PORT/tcp" >/dev/null 2>&1 \
            && echo -e "${GREEN}[OK]${NC}  Port $BACKEND_PORT open" \
            || echo -e "${YELLOW}[!]${NC}  Port $BACKEND_PORT — check manually"
    elif command -v iptables >/dev/null 2>&1; then
        sudo iptables -I INPUT -p tcp --dport "$FRONTEND_PORT" -j ACCEPT 2>/dev/null \
            && echo -e "${GREEN}[OK]${NC}  iptables: $FRONTEND_PORT" || true
        sudo iptables -I INPUT -p tcp --dport "$BACKEND_PORT"  -j ACCEPT 2>/dev/null \
            && echo -e "${GREEN}[OK]${NC}  iptables: $BACKEND_PORT"  || true
    else
        echo -e "${YELLOW}[!]${NC}  No ufw/iptables — open ports manually if needed"
    fi
else
    echo -e "${GREEN}[OK]${NC}  Localhost only — skipping firewall"
fi

# ── [5] Start backend (HTTPS via uvicorn SSL) ─────────────────
echo ""
echo "[5/6] Starting backend (HTTPS)..."
cd "$PARTH_DIR/backend"
source .venv/bin/activate

# Export model explicitly so backend process inherits it
export PARTH_HOST PARTH_PORT PARTH_MODEL

PARTH_HOST="$PARTH_HOST" \
PARTH_PORT="$BACKEND_PORT" \
PARTH_MODEL="$PARTH_MODEL" \
python main.py \
    --ssl-keyfile  "$CERT_DIR/key.pem" \
    --ssl-certfile "$CERT_DIR/cert.pem" &
BACKEND_PID=$!

sleep 2
kill -0 "$BACKEND_PID" 2>/dev/null \
    || { echo -e "${RED}[ERR]${NC} Backend crashed — check output above"; exit 1; }
echo -e "${GREEN}[OK]${NC}  Backend PID $BACKEND_PID (HTTPS)"

# ── [6] Start frontend (Vite HTTPS) ──────────────────────────
echo ""
echo "[6/6] Starting frontend (HTTPS)..."
cd "$PARTH_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "  Installing npm packages (first run)..."
    npm install --silent
fi

# Write runtime vite config with HTTPS using our certs
cat > vite.runtime.config.js << VITE
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: $FRONTEND_PORT,
    https: {
      key:  fs.readFileSync('$CERT_DIR/key.pem'),
      cert: fs.readFileSync('$CERT_DIR/cert.pem'),
    },
    proxy: {
      '/api': {
        target:  'https://127.0.0.1:$BACKEND_PORT',
        secure:  false,
        changeOrigin: true,
      },
      '/ws': {
        target:  'wss://127.0.0.1:$BACKEND_PORT',
        ws:      true,
        secure:  false,
        changeOrigin: true,
      }
    }
  }
})
VITE

# Write client-side server config
mkdir -p public
cat > public/parth-config.js << CFG
window.__PARTH_AUTO_SERVER__ = {
  name: "PARTH Server",
  ip: "$LAN_IP",
  port: $FRONTEND_PORT,
  backendPort: $BACKEND_PORT,
  local: $IS_LOCAL,
  https: true
};
CFG

npm run dev -- --config vite.runtime.config.js --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
sleep 3

kill -0 "$FRONTEND_PID" 2>/dev/null \
    || { echo -e "${RED}[ERR]${NC} Frontend crashed — check output above"; exit 1; }
echo -e "${GREEN}[OK]${NC}  Frontend PID $FRONTEND_PID (HTTPS)"

# ── Ready ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  PARTH is running! (HTTPS)${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Local  :  https://localhost:$FRONTEND_PORT"
[[ "$_lan" =~ ^[Yy]$ ]] && echo "  LAN    :  https://$LAN_IP:$FRONTEND_PORT"
echo "  API    :  https://localhost:$BACKEND_PORT"
echo "  Model  :  $PARTH_MODEL"
echo ""
echo -e "${YELLOW}  Browser will warn: self-signed certificate${NC}"
echo -e "${YELLOW}  Click 'Advanced' → 'Proceed to localhost' — this is safe.${NC}"
echo "  Voice / microphone now works (requires HTTPS — done!)."
echo ""
echo "  Ctrl+C to stop"
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
