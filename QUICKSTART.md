# PARTH Quick Start Guide

## Windows

1. **Ensure you have:**
   - Python 3.x (https://python.org)
   - Node.js (https://nodejs.org)
   - Ollama (https://ollama.com)

2. **Run the startup script:**
   ```batch
   cd parth_fixed
   scripts\start.bat
   ```

The script will automatically:
- ✅ Create Python venv
- ✅ Install dependencies
- ✅ Start Ollama
- ✅ Pull the model if needed
- ✅ Start backend & frontend

3. **Open in browser:**
   - Local: `http://localhost:5173`
   - LAN (phone): `http://YOUR_PC_IP:5173`

---

## Linux

1. **Ensure you have:**
   ```bash
   sudo apt update
   sudo apt install python3 python3-venv python3-pip nodejs npm
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Run the startup script:**
   ```bash
   cd parth_fixed
   bash scripts/start.sh
   ```

The script will automatically:
- ✅ Create Python venv
- ✅ Install dependencies
- ✅ Start Ollama
- ✅ Pull the model if needed
- ✅ Open firewall ports (ufw/iptables)
- ✅ Start backend & frontend

3. **Open in browser:**
   - Local: `http://localhost:5173`
   - LAN (phone): `http://YOUR_LAN_IP:5173`

---

## Troubleshooting

### "Model not found 404"
The Ollama model isn't installed. The script tries to auto-pull it, but you can do it manually:
```bash
ollama pull mistral
# or
ollama pull qwen2.5:0.5b
```

### "Port already in use"
Kill the existing process:
```bash
# Windows
taskkill /IM python.exe /F
taskkill /IM node.exe /F

# Linux
pkill -f "python main.py"
pkill -f "npm run dev"
```

### "Phone can't reach the site"
1. Make sure you're on the same WiFi
2. Check firewall allows ports 5173 and 8000
3. Use the LAN IP shown in the startup output, not localhost

### "Ollama not found"
Install from https://ollama.com and make sure `ollama` is in PATH

---

## Manual Model Selection

Edit `.env`:
```
PARTH_MODEL=mistral
```

Popular models:
- `mistral` — Fast, good quality
- `llama2` — Very capable
- `neural-chat` — Lightweight
- `qwen2.5:0.5b` — Very fast, less capable
- `tinyllama` — Minimal

Pull any model:
```bash
ollama pull <model-name>
```

---

## Manual Setup (if scripts fail)

**Windows:**
```batch
cd parth_fixed\backend
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt

cd ..\frontend
npm install

cd ..
# Edit .env with your model name
# Then start Ollama in another terminal: ollama serve
# Then: scripts\start.bat
```

**Linux:**
```bash
cd parth_fixed/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd ../frontend
npm install

cd ..
# Edit .env with your model name
# Then start Ollama in another terminal: ollama serve
# Then: bash scripts/start.sh
```

