"""
PARTH REST API Router
created_by:pushkar | helped_by:claude | parth-host-defender
PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.database import get_events, get_event_counts_by_severity, save_approved_action
from modules.ai_reasoning import AIReasoningEngine
from modules.net_scanner import NetworkScanner
import psutil
import asyncio
import subprocess
import csv
import io
import json
import aiohttp
import os
import base64
import pathlib
import re as _re
import shutil
import socket as _socket

api_router = APIRouter()
_ai_engine = AIReasoningEngine()
_net_scanner = NetworkScanner()


# ─── System Stats ─────────────────────────────────────────────────────────────

@api_router.get("/stats")
async def get_stats():
    cpu  = psutil.cpu_percent(interval=0.5)
    mem  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    counts = await get_event_counts_by_severity(since_hours=24)

    gpu_util = None
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            timeout=3, text=True, stderr=subprocess.DEVNULL,
        )
        gpu_util = float(out.strip().splitlines()[0])
    except Exception:
        pass

    return {
        "cpu_percent":    cpu,
        "mem_percent":    mem.percent,
        "mem_available_mb": round(mem.available / 1024 / 1024),
        "disk_percent":   disk.percent,
        "gpu_percent":    gpu_util,
        "event_counts":   counts,
        "total_events_24h": sum(counts.values()),
    }


# ─── Events ───────────────────────────────────────────────────────────────────

@api_router.get("/events")
async def list_events(
    limit:       int           = Query(default=100, le=500),
    severity:    Optional[str] = None,
    event_type:  Optional[str] = None,
    since_hours: int           = Query(default=24, le=168),
):
    events = await get_events(
        limit=limit, severity=severity,
        event_type=event_type, since_hours=since_hours,
    )
    return {"events": events, "total": len(events), "count": len(events)}


# ─── Export Events ────────────────────────────────────────────────────────────

@api_router.get("/events/export/csv")
async def export_events_csv(since_hours: int = 24):
    events = await get_events(limit=500, since_hours=since_hours)
    output = io.StringIO()
    writer = csv.DictWriter(
        output, fieldnames=["id","timestamp","source","event_type","severity","data"]
    )
    writer.writeheader()
    for e in events:
        writer.writerow({
            "id": e.get("id"), "timestamp": e.get("timestamp"),
            "source": e.get("source"), "event_type": e.get("event_type"),
            "severity": e.get("severity"), "data": e.get("data",""),
        })
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=parth_events.csv"},
    )


@api_router.get("/events/export/json")
async def export_events_json(since_hours: int = 24):
    events = await get_events(limit=500, since_hours=since_hours)
    content = json.dumps({"events": events, "count": len(events)}, indent=2)
    return StreamingResponse(
        io.BytesIO(content.encode()), media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=parth_events.json"},
    )


# ─── Threat Summary ───────────────────────────────────────────────────────────

@api_router.get("/threat-summary")
async def threat_summary(since_hours: int = 1):
    events = await get_events(limit=20, since_hours=since_hours)
    summary = await _ai_engine.summarize_threats(events)
    return {"summary": summary, "event_count": len(events)}


# ─── Per-event AI Explain ─────────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    event_type: str
    severity:   str
    source:     str
    data:       dict

@api_router.post("/ai/explain")
async def ai_explain(req: ExplainRequest):
    if not _ai_engine._ollama_available:
        _ai_engine._ollama_available = await _ai_engine._check_ollama()
    if not _ai_engine._ollama_available:
        return {"explanation": "AI engine offline. Start Ollama: ollama serve", "available": False}

    from core.event_bus import Event as BusEvent
    from modules.ai_reasoning import _extract_json  # BUG 2+3 FIX
    dummy = BusEvent(
        source=req.source, event_type=req.event_type,
        severity=req.severity, data=req.data,
    )
    prompt = _ai_engine._build_prompt(dummy)
    result_text = None  # BUG 3 FIX: proper scoped variable, not dir() hack
    try:
        result_text = await _ai_engine._ollama_infer(prompt)
        parsed = _extract_json(result_text)   # BUG 2 FIX: robust parse
        return {"available": True, **parsed}
    except Exception as e:
        return {
            "available": True,
            "explanation": result_text[:300] if result_text else str(e),
            "threat_category": "unknown",
            "recommended_actions": [],
            "confidence": "low",
            "false_positive_likelihood": "medium",
        }


# ─── GeoIP ────────────────────────────────────────────────────────────────────

@api_router.get("/geoip/{ip}")
async def geoip_lookup(ip: str):
    # BUG 5 FIX: validate IP before hitting external API
    import ipaddress
    try:
        parsed_ip = ipaddress.ip_address(ip)
        if parsed_ip.is_private or parsed_ip.is_loopback or parsed_ip.is_reserved:
            return {"status": "fail", "message": "Private/local IPs have no geo data"}
    except ValueError:
        return {"status": "fail", "message": "Invalid IP address"}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as s:
            async with s.get(
                f"http://ip-api.com/json/{ip}?fields=status,country,city,isp,org,as,query"
            ) as r:
                return await r.json()
    except Exception as e:
        return {"status": "fail", "message": str(e)}


# ─── Network Scan ─────────────────────────────────────────────────────────────

@api_router.post("/scan/nmap")
async def run_nmap(target: str = "127.0.0.1"):
    if not target.replace(".", "").replace("-", "").replace("/", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid target")
    return await _net_scanner.run_nmap_scan(target)


# ─── Actions ──────────────────────────────────────────────────────────────────

class ActionRequest(BaseModel):
    event_id:  str
    action:    str
    confirmed: bool = False
    params:    dict = {}

SAFE_ACTION_TEMPLATES = {
    "ufw_deny":         "sudo ufw deny from {ip}",
    "kill_process":     "sudo kill -9 {pid}",
    "ufw_enable":       "sudo ufw enable",
    "disable_root_ssh": "sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && sudo systemctl reload sshd",
}

EXECUTE_ACTIONS = os.environ.get("PARTH_ALLOW_EXECUTE", "false").lower() == "true"

@api_router.post("/actions/approve")
async def approve_action(req: ActionRequest):
    if not req.confirmed:
        return {"status": "pending", "message": "Set confirmed=true to execute"}

    action_cmd = None
    if req.action in SAFE_ACTION_TEMPLATES and req.params:
        try:
            action_cmd = SAFE_ACTION_TEMPLATES[req.action].format(**req.params)
        except KeyError:
            pass

    result = "logged"
    if EXECUTE_ACTIONS and action_cmd:
        try:
            out = subprocess.run(
                action_cmd, shell=True, capture_output=True, text=True, timeout=10
            )
            result = f"executed: rc={out.returncode} {out.stdout[:200]}"
        except Exception as e:
            result = f"failed: {e}"

    await save_approved_action(req.event_id, req.action, result=result)
    return {
        "status": "approved", "action": req.action,
        "command": action_cmd, "result": result,
        "note": "Set PARTH_ALLOW_EXECUTE=true in .env to enable real execution",
    }


# ─── Processes ────────────────────────────────────────────────────────────────

@api_router.get("/processes")
async def list_processes(limit: int = 30):
    procs = []
    for p in psutil.process_iter(["pid","name","username","cpu_percent","memory_percent","status"]):
        try:
            procs.append(p.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x.get("cpu_percent") or 0, reverse=True)
    return {"processes": procs[:limit]}


# ─── Network Connections ──────────────────────────────────────────────────────

@api_router.get("/connections")
async def list_connections():
    try:
        conns = psutil.net_connections(kind="inet")
    except psutil.AccessDenied:
        return {"error": "Run with sudo for full connection data", "connections": []}

    result = []
    for c in conns:
        if c.status == "ESTABLISHED" and c.raddr:
            proc_name = "unknown"
            try:
                if c.pid:
                    proc_name = psutil.Process(c.pid).name()
            except Exception:
                pass
            result.append({
                "local":     f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else "",
                "remote":    f"{c.raddr.ip}:{c.raddr.port}",
                "remote_ip": c.raddr.ip,
                "pid":       c.pid,
                "process":   proc_name,
                "status":    c.status,
            })
    return {"connections": result}


# ─── Alert Config ─────────────────────────────────────────────────────────────

@api_router.get("/alerts/config")
async def alert_config():
    return {
        "telegram":       bool(os.environ.get("PARTH_TELEGRAM_TOKEN")),
        "discord":        bool(os.environ.get("PARTH_DISCORD_WEBHOOK")),
        "webhook":        bool(os.environ.get("PARTH_WEBHOOK_URL")),
        "execute_actions": os.environ.get("PARTH_ALLOW_EXECUTE", "false"),
    }


# ─── Network Info ─────────────────────────────────────────────────────────────

@api_router.get("/network/info")
async def network_info():
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        lan_ip = "unavailable"
    return {
        "lan_ip":       lan_ip,
        "dashboard_url": f"http://{lan_ip}:5173",
        "api_url":      f"http://{lan_ip}:8000",
    }


# ─── Screenshot (on-demand) ───────────────────────────────────────────────────
# Takes a single screenshot when requested, returns base64 image.
# Nothing is stored on disk. No continuous capture.
# A visible notification is shown on the captured machine via notify-send.
# created_by:pushkar | helped_by:claude

@api_router.post("/screen/capture")
async def capture_screenshot():
    """
    On-demand screenshot. Captures once, returns base64 PNG.
    Sends a desktop notification so the local user always knows.
    created_by:pushkar | helped_by:claude
    """
    # Notify local user — transparency
    try:
        subprocess.Popen(
            ["notify-send", "--urgency=normal",
             "PARTH Screen Capture",
             "A screenshot was taken via the PARTH dashboard."],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass

    img_b64 = None
    img_format = "png"
    error_msg = None

    # BUG 4 FIX: flat fallback chain — each method tried independently
    # Method 1: mss (fastest, cross-platform)
    try:
        import mss
        import mss.tools
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            sshot = sct.grab(monitor)
            png_bytes = mss.tools.to_png(sshot.rgb, sshot.size)
            img_b64 = base64.b64encode(png_bytes).decode("utf-8")
    except Exception as e1:
        logger.warning(f"mss failed: {e1} — trying fallback")
        # Method 2: scrot (Linux) or screencapture (macOS)
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
            system = os.uname().sysname.lower() if hasattr(os, "uname") else ""
            if system == "darwin":
                subprocess.run(["screencapture", "-x", tmp_path], timeout=10, check=True)
            else:
                subprocess.run(["scrot", tmp_path], timeout=10, check=True)
            with open(tmp_path, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        except Exception as e2:
            error_msg = f"mss: {e1} | scrot/screencapture: {e2}"

    if not img_b64:
        return {
            "success": False,
            "error": error_msg or "Screenshot failed — no capture method available",
            "hint": "Install mss: pip install mss   OR   apt install scrot",
        }

    return {
        "success":   True,
        "image":     img_b64,
        "format":    img_format,
        "timestamp": datetime.utcnow().isoformat(),
        "note":      "Screenshot taken. Desktop notification sent to local user.",
    }


# ─── Developer Security Tools ─────────────────────────────────────────────────

from modules.dev_security import (
    zap_start, zap_scan,
    nuclei_scan, nuclei_templates,
    discover_surface,
    analyze_headers_ssl,
    scan_dependencies,
    test_api_security,
)

class TargetRequest(BaseModel):
    url: str

class NucleiRequest(BaseModel):
    target:    str
    templates: list = []
    severity:  str  = "medium,high,critical"

class SurfaceRequest(BaseModel):
    domain: str

class DepsRequest(BaseModel):
    path:    str = "."
    scanner: str = "auto"

class APITestRequest(BaseModel):
    base_url:  str
    endpoints: list = []

@api_router.post("/dev/zap/start")
async def dev_zap_start():
    return await zap_start()

@api_router.post("/dev/zap/scan")
async def dev_zap_scan(req: TargetRequest):
    return await zap_scan(req.url)

@api_router.post("/dev/nuclei/scan")
async def dev_nuclei_scan(req: NucleiRequest):
    return await nuclei_scan(req.target, req.templates or None, req.severity)

@api_router.get("/dev/nuclei/templates")
async def dev_nuclei_templates():
    return await nuclei_templates()

@api_router.post("/dev/surface")
async def dev_surface(req: SurfaceRequest):
    return await discover_surface(req.domain)

@api_router.post("/dev/headers")
async def dev_headers(req: TargetRequest):
    return await analyze_headers_ssl(req.url)

@api_router.post("/dev/deps")
async def dev_deps(req: DepsRequest):
    return await scan_dependencies(req.path, req.scanner)

@api_router.post("/dev/api-test")
async def dev_api_test(req: APITestRequest):
    return await test_api_security(req.base_url, req.endpoints)


# ─── AI Assistant Chat ────────────────────────────────────────────────────────

from modules.assistant import chat as assistant_chat

class ChatRequest(BaseModel):
    message: str
    history: list = []
    model:   str  = None   # None = use PARTH_MODEL from .env; set by frontend dropdown

@api_router.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    # req.model comes from the frontend dropdown — overrides env PARTH_MODEL
    reply = await assistant_chat(req.message, req.history, "", model=req.model)
    return {"reply": reply, "model": req.model, "timestamp": datetime.utcnow().isoformat()}


# ─── System Command Executor ──────────────────────────────────────────────────

APP_MAP = {
    "browser":      ["xdg-open","firefox","chromium-browser","chromium","google-chrome","brave-browser","opera"],
    "firefox":      ["firefox"],
    "chrome":       ["google-chrome","chromium-browser","chromium"],
    "brave":        ["brave-browser","brave"],
    "terminal":     ["x-terminal-emulator","gnome-terminal","konsole","xfce4-terminal","alacritty","kitty","xterm"],
    "files":        ["nautilus","dolphin","thunar","nemo","pcmanfm"],
    "file manager": ["nautilus","dolphin","thunar","nemo","pcmanfm"],
    "vscode":       ["code","codium"],
    "vs code":      ["code","codium"],
    "code":         ["code","codium"],
    "calculator":   ["gnome-calculator","kcalc","galculator","xcalc"],
    "text editor":  ["gedit","kate","mousepad","xed"],
    "settings":     ["gnome-control-center","systemsettings5","xfce4-settings-manager"],
    "htop":         ["htop"],
    "vlc":          ["vlc"],
    "gimp":         ["gimp"],
    "steam":        ["steam"],
    "discord":      ["discord","vesktop"],
    "telegram":     ["telegram-desktop","telegram"],
    "spotify":      ["spotify"],
}

OPEN_KEYWORDS   = ["open","launch","start","run","show","bring up"]
CLOSE_KEYWORDS  = ["close","kill","stop","quit","exit","terminate"]
SEARCH_KEYWORDS = ["search","google","look up","find","search for"]
PLAY_KEYWORDS   = ["play","watch","listen"]

def _find_binary(names: list):
    for n in names:
        if shutil.which(n.split()[0]):
            return n
    return None

def _detect_intent(message: str):
    msg = message.lower().strip()
    for kw in SEARCH_KEYWORDS:
        if msg.startswith(kw):
            query = msg[len(kw):].strip().lstrip("for").strip()
            if query:
                return "search", "browser", query
    for kw in PLAY_KEYWORDS:
        if msg.startswith(kw):
            return "youtube", "browser", msg[len(kw):].strip()
    if msg.startswith("open ") and any(x in msg for x in ["http","https",".com",".in",".org"]):
        url = msg.replace("open ","").strip()
        if not url.startswith("http"):
            url = "https://" + url
        return "url", "browser", url

    action = None
    for kw in OPEN_KEYWORDS:
        if kw in msg: action = "open"; break
    for kw in CLOSE_KEYWORDS:
        if kw in msg: action = "close"; break
    if not action:
        return None
    for key in sorted(APP_MAP.keys(), key=len, reverse=True):
        if key in msg:
            return action, key, ""
    return None

class CommandRequest(BaseModel):
    message: str

@api_router.post("/ai/command")
async def ai_command(req: CommandRequest):
    intent = _detect_intent(req.message)
    if intent:
        action, app_key, extra = intent
        if action == "search":
            url = f"https://www.google.com/search?q={extra.replace(' ', '+')}"
            b = _find_binary(APP_MAP["browser"])
            if b:
                subprocess.Popen([b.split()[0], url], stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Searching for '{extra}' ✓"}
        if action == "youtube":
            url = f"https://www.youtube.com/results?search_query={extra.replace(' ', '+')}"
            b = _find_binary(APP_MAP["browser"])
            if b:
                subprocess.Popen([b.split()[0], url], stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Opening YouTube for '{extra}' ✓"}
        if action == "url":
            b = _find_binary(APP_MAP["browser"])
            if b:
                subprocess.Popen([b.split()[0], extra], stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Opening {extra} ✓"}
        if action == "open":
            b = _find_binary(APP_MAP.get(app_key, []))
            if b:
                subprocess.Popen(b.split(), stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Opening {app_key} ✓"}
            return {"type":"command","status":"not_found","reply":f"'{app_key}' not installed."}
        if action == "close":
            binaries = APP_MAP.get(app_key, [])
            name = binaries[0].split()[0] if binaries else app_key
            r = subprocess.run(["pkill","-f",name], capture_output=True)
            if r.returncode == 0:
                return {"type":"command","status":"ok","reply":f"Closed {app_key} ✓"}
            return {"type":"command","status":"not_running","reply":f"{app_key} not running."}

    reply = await assistant_chat(req.message, [], "", model=None)  # uses env PARTH_MODEL
    return {"type":"chat","status":"ok","reply":reply}


# ─── Safe File Writer ─────────────────────────────────────────────────────────

SAFE_DIR = pathlib.Path.home() / "Documents" / "PARTH"
SAFE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    '.txt','.md','.py','.js','.ts','.html','.css','.json',
    '.yaml','.yml','.sh','.csv','.log','.conf','.ini','.toml','.xml',
}

def _safe_path(filename: str) -> pathlib.Path:
    clean = _re.sub(r'[^\w\.\-_ ]', '', filename).strip()
    if not clean:
        raise ValueError("Invalid filename")
    p = (SAFE_DIR / clean).resolve()
    p.relative_to(SAFE_DIR.resolve())
    ext = p.suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Extension '{ext}' not allowed")
    return p

class FileWriteRequest(BaseModel):
    filename: str
    content:  str
    append:   bool = False

class FileReadRequest(BaseModel):
    filename: str

@api_router.post("/files/write")
async def write_file(req: FileWriteRequest):
    try:
        p = _safe_path(req.filename)
        if req.append:
            with open(p, 'a') as f:
                f.write(req.content)
        else:
            p.write_text(req.content)
        return {"status": "ok", "path": str(p), "size": p.stat().st_size}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.get("/files/list")
async def list_files():
    files = []
    for f in SAFE_DIR.iterdir():
        if f.is_file():
            files.append({
                "name": f.name, "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
    return {"files": sorted(files, key=lambda x: x["modified"], reverse=True), "dir": str(SAFE_DIR)}

@api_router.post("/files/read")
async def read_file(req: FileReadRequest):
    try:
        p = _safe_path(req.filename)
        if not p.exists():
            raise HTTPException(404, "File not found")
        return {"content": p.read_text(), "path": str(p)}
    except ValueError as e:
        raise HTTPException(400, str(e))

@api_router.delete("/files/{filename}")
async def delete_file(filename: str):
    try:
        p = _safe_path(filename)
        if not p.exists():
            raise HTTPException(404, "File not found")
        p.unlink()
        return {"status": "deleted", "filename": filename}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── Defense Tools ────────────────────────────────────────────────────────────

from modules.defense_tools import (
    ufw_status, ufw_enable, ufw_disable, ufw_rules,
    ufw_block_ip, ufw_unblock_ip, ufw_block_port, ufw_allow_port,
    kill_process, top_processes, suspicious_processes,
    list_open_ports, active_connections, lockdown_mode,
    fail2ban_status, fail2ban_jail_status, fail2ban_unban,
    hardening_audit, read_audit_log,
)

class IPRequest(BaseModel):
    ip: str

class PortRequest(BaseModel):
    port:  int
    proto: str = "tcp"
    action: str = "block"

class KillRequest(BaseModel):
    pid:    int
    signal: str = "TERM"

class LockdownRequest(BaseModel):
    enable: bool

class UnbanRequest(BaseModel):
    ip:   str
    jail: str = "sshd"

@api_router.get("/defense/firewall/status")
async def defense_fw_status(): return ufw_status()

@api_router.post("/defense/firewall/enable")
async def defense_fw_enable(): return ufw_enable()

@api_router.post("/defense/firewall/disable")
async def defense_fw_disable(): return ufw_disable()

@api_router.get("/defense/firewall/rules")
async def defense_fw_rules(): return ufw_rules()

@api_router.post("/defense/firewall/block-ip")
async def defense_block_ip(req: IPRequest): return ufw_block_ip(req.ip)

@api_router.post("/defense/firewall/unblock-ip")
async def defense_unblock_ip(req: IPRequest): return ufw_unblock_ip(req.ip)

@api_router.post("/defense/firewall/port")
async def defense_fw_port(req: PortRequest):
    return ufw_block_port(req.port, req.proto) if req.action == "block" else ufw_allow_port(req.port, req.proto)

@api_router.get("/defense/processes/top")
async def defense_top_procs(): return {"processes": top_processes()}

@api_router.get("/defense/processes/suspicious")
async def defense_suspicious_procs(): return {"processes": suspicious_processes()}

@api_router.post("/defense/processes/kill")
async def defense_kill(req: KillRequest): return kill_process(req.pid, req.signal)

@api_router.get("/defense/network/ports")
async def defense_ports(): return list_open_ports()

@api_router.get("/defense/network/connections")
async def defense_conns(): return {"connections": active_connections()}

@api_router.post("/defense/lockdown")
async def defense_lockdown(req: LockdownRequest): return lockdown_mode(req.enable)

@api_router.get("/defense/fail2ban/status")
async def defense_f2b_status(): return fail2ban_status()

@api_router.get("/defense/fail2ban/{jail}")
async def defense_f2b_jail(jail: str): return fail2ban_jail_status(jail)

@api_router.post("/defense/fail2ban/unban")
async def defense_f2b_unban(req: UnbanRequest): return fail2ban_unban(req.ip, req.jail)

@api_router.get("/defense/hardening")
async def defense_hardening(): return hardening_audit()

@api_router.get("/defense/audit-log")
async def defense_audit_log(limit: int = 50): return {"entries": read_audit_log(limit)}


# ─── Startup Manager ──────────────────────────────────────────────────────────

from modules.startup_manager import (
    get_startup_status, enable_startup,
    disable_startup, update_startup_settings,
)

class StartupEnableRequest(BaseModel):
    method:    str  = "registry"   # "registry" | "startup_folder"
    delay:     int  = 0            # 0 | 15 | 30
    minimized: bool = False

class StartupSettingsRequest(BaseModel):
    launch_minimized: Optional[bool] = None
    startup_delay:    Optional[int]  = None
    startup_method:   Optional[str]  = None

@api_router.get("/startup/status")
async def startup_status():
    try:
        return get_startup_status()
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.post("/startup/enable")
async def startup_enable(req: StartupEnableRequest):
    try:
        result = enable_startup(
            method=req.method,
            delay=req.delay,
            minimized=req.minimized,
        )
        if not result.get("ok"):
            raise HTTPException(400, result.get("error", "Failed to enable startup"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.post("/startup/disable")
async def startup_disable():
    try:
        result = disable_startup()
        if not result.get("ok"):
            raise HTTPException(400, "Failed to remove startup entry")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.patch("/startup/settings")
async def startup_update(req: StartupSettingsRequest):
    try:
        updates = req.model_dump(exclude_none=True)
        return update_startup_settings(updates)
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Model Config ─────────────────────────────────────────────────────────────

class ModelConfigRequest(BaseModel):
    model: str

@api_router.get("/model/current")
async def model_current():
    import os as _os2
    m = _os2.environ.get("PARTH_MODEL", "").strip()
    return {"model": m or None, "set": bool(m)}

@api_router.post("/model/set")
async def model_set(req: ModelConfigRequest):
    import os as _os2
    model = req.model.strip()
    if not model:
        raise HTTPException(400, "Model name cannot be empty")
    _os2.environ["PARTH_MODEL"] = model

    # Persist to .env in project root
    env_path = pathlib.Path(__file__).resolve().parent.parent.parent / ".env"
    lines = []
    found = False
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("PARTH_MODEL="):
                lines.append(f"PARTH_MODEL={model}")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"PARTH_MODEL={model}")
    env_path.write_text("\n".join(lines) + "\n")

    return {"ok": True, "model": model, "persisted": True}

@api_router.get("/model/available")
async def model_available():
    """List models currently pulled in Ollama."""
    try:
        ollama_base = _os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
        tags_url = ollama_base.replace("/api/generate", "/api/tags")
        async with aiohttp.ClientSession() as s:
            async with s.get(tags_url, timeout=aiohttp.ClientTimeout(total=4)) as r:
                data = await r.json()
                models = [m["name"] for m in data.get("models", [])]
                return {"models": models, "count": len(models)}
    except Exception as e:
        return {"models": [], "count": 0, "error": str(e)}
