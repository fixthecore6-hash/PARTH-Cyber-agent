#!/usr/bin/env bash
# ============================================================
#  PARTH — Setup Script for Ubuntu/Debian
#  Run once: bash scripts/setup.sh
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[PARTH]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"

info "Starting PARTH setup at $PARTH_DIR"
echo ""

# ─── System dependencies ────────────────────────────────────
info "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    python3 python3-pip python3-venv \
    nmap \
    curl \
    net-tools \
    nodejs npm 2>/dev/null || true
ok "System dependencies installed"

# ─── Python virtual environment ─────────────────────────────
info "Setting up Python virtual environment..."
cd "$PARTH_DIR/backend"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel -q
python -m pip install -r requirements.txt -q
ok "Python environment ready"

# ─── Database init ──────────────────────────────────────────
mkdir -p "$PARTH_DIR/backend/db"
ok "Database directory created"

# ─── Frontend ───────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "$PARTH_DIR/frontend"
npm install -q
ok "Frontend dependencies installed"

# ─── Ollama ─────────────────────────────────────────────────
echo ""
info "Installing Ollama (local AI engine)..."
if command -v ollama &>/dev/null; then
    ok "Ollama already installed"
else
    curl -fsSL https://ollama.com/install.sh | sh
    ok "Ollama installed"
fi

echo ""
info "Choose your Ollama model to pull:"
echo "  Lightweight (low-end PC):  qwen2.5:1.5b, phi3, tinyllama"
echo "  Balanced:                  mistral, gemma2"
echo "  Powerful (high-end):       llama3, mixtral, deepseek-r1"
read -rp "Model name [default: mistral]: " _setup_model
_setup_model="${_setup_model:-mistral}"
info "Pulling model: $_setup_model (may take a few minutes)..."
ollama pull "$_setup_model" || warn "Could not pull $_setup_model. Run manually: ollama pull $_setup_model"
echo "PARTH_MODEL=$_setup_model" >> "$PARTH_DIR/.env" 2>/dev/null || true

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  PARTH setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Start PARTH:  bash scripts/start.sh"
echo ""
