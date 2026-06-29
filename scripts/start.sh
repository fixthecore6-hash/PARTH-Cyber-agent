#!/usr/bin/env bash
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$PARTH_DIR/.env"

echo -e "${CYAN}"
echo "PARTH Startup"
echo "─────────────────────"
echo -e "${NC}"

# Cleanup trap
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down PARTH...${NC}"
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# ──────────────────────────────────────────────────────────────────────
# Step 0: Check dependencies
# ──────────────────────────────────────────────────────────────────────

echo "[0/6] Checking dependencies..."

if ! command -v python3 >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} python3 not found"
  echo "  Install: sudo apt install python3 python3-venv python3-pip"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} python3: $(python3 --version 2>&1 | awk '{print $2}')"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} node not found"
  echo "  Install: sudo apt install nodejs npm"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} node: $(node --version)"

if ! command -v ollama >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} ollama not found"
  echo "  Install: curl -fsSL https://ollama.com/install.sh | sh"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} ollama installed"

# ──────────────────────────────────────────────────────────────────────
# Step 1: Setup .env
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "[1/6] Configuring environment..."

# Fix Windows line endings if present
if [ -f "$ENV_FILE" ]; then
  sed -i 's/\r//' "$ENV_FILE"
fi

# Load or create .env
if [ ! -f "$ENV_FILE" ]; then
  echo "PARTH_MODEL=mistral" > "$ENV_FILE"
fi

# Parse existing model or ask
PARTH_MODEL=$(grep "^PARTH_MODEL=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '\r' || echo "mistral")

if [ -z "$PARTH_MODEL" ]; then
  read -rp "Model to use [mistral]: " PARTH_MODEL
  PARTH_MODEL="${PARTH_MODEL:-mistral}"
fi

# Ask for LAN mode
read -rp "Enable LAN mode? (y/n) [y]: " LAN_MODE
LAN_MODE="${LAN_MODE:-y}"

if [ "$LAN_MODE" = "y" ] || [ "$LAN_MODE" = "Y" ]; then
  LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
  [ -z "$LAN_IP" ] && LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"
  
  PARTH_HOST="0.0.0.0"
  FRONTEND_PORT=5173
  BACKEND_PORT=8000
  IS_LOCAL=false
  
  echo -e "${GREEN}[OK]${NC} LAN mode enabled"
  echo -e "${GREEN}[OK]${NC} LAN IP: $LAN_IP"
else
  PARTH_HOST="127.0.0.1"
  LAN_IP="127.0.0.1"
  FRONTEND_PORT=5173
  BACKEND_PORT=8000
  IS_LOCAL=true
  
  echo -e "${GREEN}[OK]${NC} Localhost mode only"
fi

echo -e "${GREEN}[OK]${NC} Model: $PARTH_MODEL"
echo -e "${GREEN}[OK]${NC} Frontend: http://$LAN_IP:$FRONTEND_PORT"
echo -e "${GREEN}[OK]${NC} Backend: http://$LAN_IP:$BACKEND_PORT"

# ──────────────────────────────────────────────────────────────────────
# Step 2: Setup backend venv
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "[2/6] Setting up backend..."

cd "$PARTH_DIR/backend"

if [ ! -f ".venv/bin/activate" ]; then
  echo "  Creating Python venv (first-time setup)..."
  python3 -m venv .venv
  source .venv/bin/activate
  echo "  Installing dependencies..."
  pip install --quiet -r requirements.txt
  echo -e "${GREEN}[OK]${NC} Backend venv ready"
else
  source .venv/bin/activate
  echo -e "${GREEN}[OK]${NC} Backend venv exists"
fi

# ──────────────────────────────────────────────────────────────────────
# Step 3: Setup Ollama
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "[3/6] Setting up Ollama..."

if pgrep -x "ollama" >/dev/null 2>&1; then
  echo -e "${GREEN}[OK]${NC} Ollama is running"
else
  echo "  Starting Ollama..."
  ollama serve >/tmp/ollama.log 2>&1 &
  sleep 2
  echo -e "${GREEN}[OK]${NC} Ollama started"
fi

# Check and pull model if needed
echo "  Checking model '$PARTH_MODEL'..."
if ! ollama list 2>/dev/null | grep -q "$PARTH_MODEL"; then
  echo "  Pulling model (first-time, may take minutes)..."
  ollama pull "$PARTH_MODEL"
fi
echo -e "${GREEN}[OK]${NC} Model ready"

# ──────────────────────────────────────────────────────────────────────
# Step 4: Firewall (Linux ufw)
# ──────────────────────────────────────────────────────────────────────

if [ "$LAN_MODE" = "y" ] || [ "$LAN_MODE" = "Y" ]; then
  echo ""
  echo "[4/6] Opening firewall ports..."
  
  if command -v ufw >/dev/null 2>&1; then
    sudo ufw allow "$FRONTEND_PORT/tcp" >/dev/null 2>&1 && \
      echo -e "${GREEN}[OK]${NC} ufw: port $FRONTEND_PORT open" || \
      echo -e "${YELLOW}[WARN]${NC} ufw: could not open port $FRONTEND_PORT"
    
    sudo ufw allow "$BACKEND_PORT/tcp" >/dev/null 2>&1 && \
      echo -e "${GREEN}[OK]${NC} ufw: port $BACKEND_PORT open" || \
      echo -e "${YELLOW}[WARN]${NC} ufw: could not open port $BACKEND_PORT"
  elif command -v iptables >/dev/null 2>&1; then
    sudo iptables -I INPUT -p tcp --dport "$FRONTEND_PORT" -j ACCEPT 2>/dev/null && \
      echo -e "${GREEN}[OK]${NC} iptables: port $FRONTEND_PORT open" || true
    sudo iptables -I INPUT -p tcp --dport "$BACKEND_PORT" -j ACCEPT 2>/dev/null && \
      echo -e "${GREEN}[OK]${NC} iptables: port $BACKEND_PORT open" || true
  else
    echo -e "${YELLOW}[WARN]${NC} No firewall tool found (ufw/iptables)"
  fi
else
  echo ""
  echo "[4/6] Firewall: Localhost only, skipping"
fi

# ──────────────────────────────────────────────────────────────────────
# Step 5: Start backend
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "[5/6] Starting backend..."

cd "$PARTH_DIR/backend"
source .venv/bin/activate
PARTH_HOST="$PARTH_HOST" PARTH_PORT="$BACKEND_PORT" PARTH_MODEL="$PARTH_MODEL" python main.py &
BACKEND_PID=$!
sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo -e "${RED}[ERR]${NC} Backend failed to start"
  exit 1
fi
echo -e "${GREEN}[OK]${NC} Backend running (PID $BACKEND_PID)"

# ──────────────────────────────────────────────────────────────────────
# Step 6: Start frontend
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "[6/6] Starting frontend..."

cd "$PARTH_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm dependencies (first-time setup)..."
  npm install --silent
fi

# Generate runtime vite config
cat > vite.runtime.config.js << EOF
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: $FRONTEND_PORT,
    proxy: {
      '/api': 'http://127.0.0.1:$BACKEND_PORT',
      '/ws':  { target: 'ws://127.0.0.1:$BACKEND_PORT', ws: true }
    }
  }
})
EOF

# Generate client config
mkdir -p public
cat > public/parth-config.js << EOF
window.__PARTH_AUTO_SERVER__ = {
  name: "PARTH Server",
  ip: "$LAN_IP",
  port: $FRONTEND_PORT,
  backendPort: $BACKEND_PORT,
  local: $IS_LOCAL
};
EOF

npm run dev -- --config vite.runtime.config.js --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
sleep 2

echo -e "${GREEN}[OK]${NC} Frontend running (PID $FRONTEND_PID)"

# ──────────────────────────────────────────────────────────────────────
# Ready!
# ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  PARTH is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Local URL: http://localhost:$FRONTEND_PORT"
if [ "$LAN_MODE" != "n" ] && [ "$LAN_MODE" != "N" ]; then
  echo "  LAN URL:   http://$LAN_IP:$FRONTEND_PORT"
fi
echo ""
echo "  Backend:   http://localhost:$BACKEND_PORT"
echo "  Model:     $PARTH_MODEL"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

wait "$BACKEND_PID" "$FRONTEND_PID"
