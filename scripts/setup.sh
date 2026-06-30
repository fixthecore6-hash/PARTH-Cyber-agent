#!/usr/bin/env bash
# =============================================================
#  PARTH — One-time Setup Script (Linux / Ubuntu / Debian)
#  created_by:pushkar | helped_by:claude | parth-host-defender
#  PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
#  Run once: bash scripts/setup.sh
# =============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info() { echo -e "${CYAN}[PARTH]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

PARTH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$PARTH_DIR/certs"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  PARTH Setup — Host Defender v1.0${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── System dependencies ───────────────────────────────────────
info "Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    python3 python3-pip python3-venv \
    nmap curl net-tools \
    scrot libnotify-bin \
    openssl \
    nodejs npm 2>/dev/null || true
ok "System dependencies installed"

# ── Python virtual environment ────────────────────────────────
info "Setting up Python virtual environment..."
cd "$PARTH_DIR/backend"

if [ ! -f ".venv/bin/activate" ]; then
    python3 -m venv .venv
    ok "Virtual environment created"
fi

source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel -q

info "Installing Python dependencies (mss, uvicorn[standard] for SSL, etc.)..."
pip install -q -r requirements.txt
ok "Python dependencies installed"

# ── Database directory ────────────────────────────────────────
mkdir -p "$PARTH_DIR/backend/db"
ok "Database directory ready"

# ── Self-signed HTTPS certificate ─────────────────────────────
info "Generating self-signed TLS certificate for HTTPS..."
mkdir -p "$CERT_DIR"

# Detect LAN IP
LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}')"
[ -z "$LAN_IP" ] && LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"

# Generate cert valid for localhost + LAN IP + hostname
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$CERT_DIR/key.pem" \
    -out    "$CERT_DIR/cert.pem" \
    -subj   "/CN=PARTH-Dashboard/O=PARTH/OU=CyberDefense" \
    -addext "subjectAltName=IP:127.0.0.1,IP:$LAN_IP,DNS:localhost" \
    2>/dev/null
ok "TLS certificate generated → $CERT_DIR/ (valid 825 days)"
info "Browser will show 'self-signed' warning — click Advanced → Proceed. This is normal for local certs."

# ── Frontend ──────────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "$PARTH_DIR/frontend"
npm install -q
# Also install @vitejs/plugin-basic-ssl for HTTPS dev server
npm install -q --save-dev @vitejs/plugin-basic-ssl 2>/dev/null || true
ok "Frontend dependencies installed"

# ── Firewall ports ────────────────────────────────────────────
info "Opening firewall ports (5173 frontend HTTPS, 8000 backend HTTPS)..."
if command -v ufw &>/dev/null; then
    sudo ufw allow 5173/tcp >/dev/null 2>&1 && ok "Port 5173 open" || warn "Could not open 5173"
    sudo ufw allow 8000/tcp >/dev/null 2>&1 && ok "Port 8000 open"  || warn "Could not open 8000"
else
    warn "ufw not found — open ports 5173 and 8000 manually if using LAN mode"
fi

# ── Ollama ────────────────────────────────────────────────────
echo ""
info "Checking Ollama (local AI engine)..."
if command -v ollama &>/dev/null; then
    ok "Ollama already installed: $(ollama --version 2>/dev/null || echo 'installed')"
else
    info "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    ok "Ollama installed"
fi

echo ""
info "Choose your Ollama model based on your hardware:"
echo ""
echo "  Very Low-end  (2–4 GB RAM)  :  tinyllama   qwen2.5:1.5b   phi3:mini"
echo "  Low-end       (4–8 GB RAM)  :  phi3        gemma2:2b"
echo "  Balanced      (8–16 GB RAM) :  mistral     llama3.2"
echo "  High-end     (16+ GB RAM)   :  llama3.1    mixtral"
echo ""
read -rp "  Model name [default: mistral]: " _model
_model="${_model:-mistral}"

info "Pulling model: $_model (may take a few minutes on first run)..."
ollama pull "$_model" || warn "Could not pull $_model — run manually later: ollama pull $_model"

# Write model to .env
ENV_FILE="$PARTH_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << ENVEOF
PARTH_MODEL=$_model
PARTH_ALLOW_EXECUTE=false
ENVEOF
else
    # Update or append — never duplicate
    if grep -q "^PARTH_MODEL=" "$ENV_FILE"; then
        sed -i "s/^PARTH_MODEL=.*/PARTH_MODEL=$_model/" "$ENV_FILE"
    else
        echo "PARTH_MODEL=$_model" >> "$ENV_FILE"
    fi
fi
ok ".env updated with model: $_model"

# ── Done ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  PARTH setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start PARTH:  bash scripts/start.sh"
echo "  Dashboard will open at:  https://localhost:5173"
echo ""
echo -e "${YELLOW}  NOTE: Your browser will warn about self-signed certificate.${NC}"
echo -e "${YELLOW}  Click 'Advanced' → 'Proceed to localhost' — this is safe.${NC}"
echo "  Voice features (microphone) require HTTPS — now enabled!"
echo ""
