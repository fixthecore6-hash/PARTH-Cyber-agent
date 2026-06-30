# PARTH — Proactive Autonomous Real-Time Host-Defender

Local-first cybersecurity AI. No cloud. No telemetry. Human-approved actions only.

---

## Quick Start

**Windows**
```bat
scripts\setup_windows.bat
scripts\start_windows.bat
start http://localhost:5173
```

**Linux / macOS**
```bash
bash scripts/setup.sh
bash scripts/start.sh
xdg-open http://localhost:5173
```

For full visibility into network connections and logs, run with elevated permissions:
- Linux: `sudo bash scripts/start.sh`
- Windows: right-click `start_windows.bat` → Run as Administrator

---

## What PARTH Monitors

| Module | What it watches |
|---|---|
| `sys_monitor` | CPU, RAM, disk spikes and pressure |
| `proc_monitor` | Suspicious processes, temp-folder executables, SYSTEM-level activity |
| `file_watcher` | SHA-256 integrity of critical system files |
| `net_scanner` | Active connections, suspicious ports, port inventory |
| `log_ingestor` | Auth logs, syslog, Windows Event Log — brute force, sudo abuse, new users |
| `usb_monitor` | USB device insertion and removal |
| `rootkit_detector` | Hidden processes, suspicious kernel modules |
| `gpu_monitor` | GPU spikes — catches cryptomining-level usage |
| `ai_reasoning` | Local AI explains and classifies every alert in plain language |

---

## AI Model Support

PARTH works with any model supported by Ollama. All inference runs on your machine — no API keys, no internet after the first pull.

Configurable from the Settings page in the dashboard — pick from installed models, the built-in library, or type any custom model name. No code edits needed.

| Model | RAM needed | Notes |
|---|---|---|
| `mistral` | ~6 GB | Default, well-rounded |
| `llama3.1` | ~6 GB | Strong reasoning |
| `phi3` | ~4 GB | Good for lighter machines |
| `phi3:mini` | ~2.5 GB | Minimal systems |
| `gemma2` | ~6 GB | Clean structured output |
| `deepseek-r1` | ~8 GB | Best for complex threat chains |
| `tinyllama` | ~1.5 GB | Very limited — last resort |

---

## Auto-Start (Windows)

Configurable from the Settings page in the dashboard:
- Registry Run key or Startup Folder method
- Optional tray-only launch (no window on startup)
- Optional 15–30 second delay after login to reduce boot load
- Config persists across updates at `~/.parth/startup_config.json`
- Registry method works without administrator rights

---

## Interface

- Dark / light mode toggle, saved across sessions
- System tray icon — PARTH keeps running independent of any visible window
- Mobile-friendly dashboard, accessible from any device on the same network

---

## Requirements

- Windows 10+ / Ubuntu 20.04+ / Debian 11+ / macOS
- Python 3.10 or newer (including 3.13+)
- Node.js 18+
- 4 GB RAM minimum, 8 GB recommended for Mistral / LLaMA
- nmap — `sudo apt install nmap` or `winget install nmap`

---

## Safety

- Defensive only — no offensive capabilities, no exploit code
- Every system-modifying action requires explicit human confirmation
- All data, logs, and AI inference stay on your machine
- No telemetry, no cloud, no external calls of any kind

---

## License

GPL v3 — open source, attribution required. See `LICENSE`.

Original author: Pushkar
