#!/usr/bin/env bash
# One-time Linux setup helper
# Run once: bash scripts/setup_linux.sh

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${GREEN}"
echo "PARTH Linux Setup"
echo "─────────────────"
echo -e "${NC}"

# Check Python
if ! command -v python3 >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} python3 not found"
  echo "  sudo apt install python3 python3-venv python3-pip"
  exit 1
fi

# Check Node
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} node not found"
  echo "  sudo apt install nodejs npm"
  exit 1
fi

# Backend venv
echo "[1] Creating Python venv..."
cd "$PARTH_DIR/backend"
if [ ! -f ".venv/bin/activate" ]; then
  python3 -m venv .venv
  source .venv/bin/activate
  echo "  Installing dependencies..."
  pip install --quiet -r requirements.txt
  echo -e "${GREEN}[OK]${NC} Backend venv ready"
else
  echo -e "${GREEN}[OK]${NC} venv already exists"
fi

# Frontend
echo "[2] Installing Node dependencies..."
cd "$PARTH_DIR/frontend"
if [ ! -d "node_modules" ]; then
  npm install --silent
  echo -e "${GREEN}[OK]${NC} Frontend ready"
else
  echo -e "${GREEN}[OK]${NC} node_modules already exists"
fi

# Firewall
echo "[3] Opening firewall ports..."
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 5173/tcp >/dev/null 2>&1 && echo -e "${GREEN}[OK]${NC} Port 5173 open" || echo -e "${YELLOW}[WARN]${NC} Port 5173"
  sudo ufw allow 8000/tcp >/dev/null 2>&1 && echo -e "${GREEN}[OK]${NC} Port 8000 open" || echo -e "${YELLOW}[WARN]${NC} Port 8000"
else
  echo -e "${YELLOW}[WARN]${NC} ufw not found (firewall may block LAN access)"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo "Next: bash scripts/start.sh"
echo ""
