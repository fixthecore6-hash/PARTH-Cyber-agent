# PARTH — Proactive Autonomous Real-Time Host-defender

A fully **local** cybersecurity AI monitoring system for Linux.
No cloud. No external APIs. Human-approved actions only.

---

## Quick Start (Ubuntu/Debian)

```bash
# Clone or extract to a folder, then:
cd parth

# 1. Run setup (once only)
bash scripts/setup.sh

# 2. Start everything
bash scripts/start.sh

# 3. Open dashboard
xdg-open http://localhost:5173
```

---

## What PARTH monitors

| Module          | What it watches                                      |
|-----------------|------------------------------------------------------|
| sys_monitor     | CPU, RAM, disk — spikes and pressure alerts          |
| proc_monitor    | Suspicious cmdlines, /tmp executables, UID 0 procs   |
| file_watcher    | SHA256 integrity of /etc/*, /root/*, sshd_config     |
| net_scanner     | Active connections, suspicious ports, port inventory |
| log_ingestor    | auth.log, syslog — brute force, sudo, new users      |
| ai_reasoning    | Ollama/Mistral explains and classifies each alert    |

---

## Architecture

```
Data Sources → Collection Workers → Event Bus
           → Detection Engine → Risk Scorer
           → AI Reasoning (Ollama local)
           → Action Router (human approval gate)
           → FastAPI + WebSocket → React Dashboard
```

---

## AI Model

PARTH uses **Mistral 7B** via Ollama (runs fully locally).
First run downloads ~4GB. All inference is on your machine.

To change model: edit `backend/modules/ai_reasoning.py` → `MODEL = "llama3"`

---

## Requirements

- Ubuntu 20.04+ or Debian 11+
- Python 3.10+ including Python 3.13 and newer
- Node.js 18+
- 8GB RAM recommended (for Mistral)
- nmap: `sudo apt install nmap`

---

## Running with elevated permissions (recommended)

Some modules (network connections, log files) need root access for full visibility:

```bash
sudo bash scripts/start.sh
```

---

## Safety

- PARTH is **defensive only**
- All system-modifying actions require explicit human confirmation
- No offensive capabilities, no exploit code
- All data stays on your machine
