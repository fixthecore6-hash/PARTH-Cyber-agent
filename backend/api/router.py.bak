"""
PARTH REST API Router
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
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

api_router = APIRouter()
_ai_engine = AIReasoningEngine()
_net_scanner = NetworkScanner()


# ─── System Stats ───────────────────────────────────────────────────────────

@api_router.get("/stats")
async def get_stats():
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    counts = await get_event_counts_by_severity(since_hours=24)

    # GPU util (best effort)
    gpu_util = None
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            timeout=3, text=True, stderr=subprocess.DEVNULL
        )
        gpu_util = float(out.strip().splitlines()[0])
    except Exception:
        pass

    return {
        "cpu_percent": cpu,
        "mem_percent": mem.percent,
        "mem_available_mb": round(mem.available / 1024 / 1024),
        "disk_percent": disk.percent,
        "gpu_percent": gpu_util,
        "event_counts": counts,
        "total_events_24h": sum(counts.values()),
    }


# ─── Events ────────────────────────────────────────────────────────────────

@api_router.get("/events")
async def list_events(
    limit: int = Query(default=100, le=500),
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    since_hours: int = Query(default=24, le=168),
):
    events = await get_events(
        limit=limit, severity=severity, event_type=event_type, since_hours=since_hours,
    )
    return {"events": events, "count": len(events)}


# ─── Export Events as CSV ─────────────────────────────────────────────────

@api_router.get("/events/export/csv")
async def export_events_csv(since_hours: int = 24):
    events = await get_events(limit=500, since_hours=since_hours)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "timestamp", "source", "event_type", "severity", "data"])
    writer.writeheader()
    for e in events:
        writer.writerow({
            "id": e.get("id"), "timestamp": e.get("timestamp"),
            "source": e.get("source"), "event_type": e.get("event_type"),
            "severity": e.get("severity"), "data": e.get("data", ""),
        })
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=parth_events.csv"},
    )


@api_router.get("/events/export/json")
async def export_events_json(since_hours: int = 24):
    events = await get_events(limit=500, since_hours=since_hours)
    content = json.dumps({"events": events, "count": len(events)}, indent=2)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=parth_events.json"},
    )


# ─── Threat Summary ────────────────────────────────────────────────────────

@api_router.get("/threat-summary")
async def threat_summary(since_hours: int = 1):
    events = await get_events(limit=20, since_hours=since_hours)
    summary = await _ai_engine.summarize_threats(events)
    return {"summary": summary, "event_count": len(events)}


# ─── Per-event AI Explain ──────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    event_type: str
    severity: str
    source: str
    data: dict


@api_router.post("/ai/explain")
async def ai_explain(req: ExplainRequest):
    """Ask AI to explain a specific event on demand."""
    if not _ai_engine._ollama_available:
        _ai_engine._ollama_available = await _ai_engine._check_ollama()
    if not _ai_engine._ollama_available:
        return {"explanation": "AI engine offline. Start Ollama: ollama serve", "available": False}

    from core.event_bus import Event as BusEvent
    dummy = BusEvent(
        source=req.source,
        event_type=req.event_type,
        severity=req.severity,
        data=req.data,
    )
    prompt = _ai_engine._build_prompt(dummy)
    try:
        result = await _ai_engine._ollama_infer(prompt)
        import json as _json
        parsed = _json.loads(result)
        return {"available": True, **parsed}
    except Exception as e:
        return {"available": True, "explanation": result if 'result' in dir() else str(e)}


# ─── GeoIP Lookup ─────────────────────────────────────────────────────────

@api_router.get("/geoip/{ip}")
async def geoip_lookup(ip: str):
    """Free geoip lookup for remote IPs shown in connections panel."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as s:
            async with s.get(f"http://ip-api.com/json/{ip}?fields=status,country,city,isp,org,as,query") as r:
                data = await r.json()
                return data
    except Exception as e:
        return {"status": "fail", "message": str(e)}


# ─── Network Scan ──────────────────────────────────────────────────────────

@api_router.post("/scan/nmap")
async def run_nmap(target: str = "127.0.0.1"):
    if not target.replace(".", "").replace("-", "").replace("/", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid target")
    result = await _net_scanner.run_nmap_scan(target)
    return result


# ─── Actions (with actual execution for safe commands) ────────────────────

class ActionRequest(BaseModel):
    event_id: str
    action: str
    confirmed: bool = False
    params: dict = {}


SAFE_ACTION_TEMPLATES = {
    "ufw_deny": "sudo ufw deny from {ip}",
    "kill_process": "sudo kill -9 {pid}",
    "ufw_enable": "sudo ufw enable",
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
        "status": "approved",
        "action": req.action,
        "command": action_cmd,
        "result": result,
        "note": "Set PARTH_ALLOW_EXECUTE=true in .env to enable real execution",
    }


# ─── Processes ─────────────────────────────────────────────────────────────

@api_router.get("/processes")
async def list_processes(limit: int = 30):
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "status"]):
        try:
            procs.append(p.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x.get("cpu_percent") or 0, reverse=True)
    return {"processes": procs[:limit]}


# ─── Network Connections ───────────────────────────────────────────────────

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
                "local": f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else "",
                "remote": f"{c.raddr.ip}:{c.raddr.port}",
                "remote_ip": c.raddr.ip,
                "pid": c.pid,
                "process": proc_name,
                "status": c.status,
            })
    return {"connections": result}


# ─── Alert Webhook Config Check ────────────────────────────────────────────

@api_router.get("/alerts/config")
async def alert_config():
    return {
        "telegram": bool(os.environ.get("PARTH_TELEGRAM_TOKEN")),
        "discord": bool(os.environ.get("PARTH_DISCORD_WEBHOOK")),
        "webhook": bool(os.environ.get("PARTH_WEBHOOK_URL")),
        "execute_actions": os.environ.get("PARTH_ALLOW_EXECUTE", "false"),
    }



# ─── System Stats ───────────────────────────────────────────────────────────

@api_router.get("/stats")
async def get_stats():
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    counts = await get_event_counts_by_severity(since_hours=24)
    return {
        "cpu_percent": cpu,
        "mem_percent": mem.percent,
        "mem_available_mb": round(mem.available / 1024 / 1024),
        "disk_percent": disk.percent,
        "event_counts": counts,
        "total_events_24h": sum(counts.values()),
    }


# ─── Events ────────────────────────────────────────────────────────────────

@api_router.get("/events")
async def list_events(
    limit: int = Query(default=100, le=500),
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    since_hours: int = Query(default=24, le=168),
):
    events = await get_events(
        limit=limit,
        severity=severity,
        event_type=event_type,
        since_hours=since_hours,
    )
    return {"events": events, "count": len(events)}


# ─── Threat Summary ────────────────────────────────────────────────────────

@api_router.get("/threat-summary")
async def threat_summary(since_hours: int = 1):
    events = await get_events(limit=20, since_hours=since_hours)
    summary = await _ai_engine.summarize_threats(events)
    return {"summary": summary, "event_count": len(events)}


# ─── Network Scan ──────────────────────────────────────────────────────────

@api_router.post("/scan/nmap")
async def run_nmap(target: str = "127.0.0.1"):
    if not target.replace(".", "").replace("-", "").replace("/", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid target")
    result = await _net_scanner.run_nmap_scan(target)
    return result


# ─── Actions (Human Approval Required) ─────────────────────────────────────

class ActionRequest(BaseModel):
    event_id: str
    action: str
    confirmed: bool = False


SAFE_ACTIONS = {
    "ufw_deny": "sudo ufw deny from {ip}",
    "kill_process": "sudo kill -9 {pid}",
}


@api_router.post("/actions/approve")
async def approve_action(req: ActionRequest):
    if not req.confirmed:
        return {"status": "pending", "message": "Set confirmed=true to execute"}

    # Whitelist: only run predefined safe defensive commands
    # Real implementation would shell out carefully — this is logged only
    await save_approved_action(req.event_id, req.action, result="logged")
    return {
        "status": "approved",
        "action": req.action,
        "message": "Action logged. Execute manually or implement safe shell runner.",
    }


# ─── Processes ─────────────────────────────────────────────────────────────

@api_router.get("/processes")
async def list_processes(limit: int = 30):
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "status"]):
        try:
            procs.append(p.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x.get("cpu_percent") or 0, reverse=True)
    return {"processes": procs[:limit]}


# ─── Network Connections ───────────────────────────────────────────────────

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
                "local": f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else "",
                "remote": f"{c.raddr.ip}:{c.raddr.port}",
                "pid": c.pid,
                "process": proc_name,
                "status": c.status,
            })
    return {"connections": result}


# ─── Developer Security Tools ────────────────────────────────────────────────

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
    target: str
    templates: list = []
    severity: str = "medium,high,critical"

class SurfaceRequest(BaseModel):
    domain: str

class DepsRequest(BaseModel):
    path: str = "."
    scanner: str = "auto"

class APITestRequest(BaseModel):
    base_url: str
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
    include_system_context: bool = True

@api_router.post("/ai/chat")
async def ai_chat(req: ChatRequest):
    ctx = ""
    if req.include_system_context:
        try:
            import psutil
            cpu = psutil.cpu_percent(interval=0.2)
            mem = psutil.virtual_memory()
            ctx = f"CPU {cpu:.0f}%, RAM {mem.percent:.0f}% used ({round(mem.available/1024/1024)}MB free)"
        except Exception:
            pass
    reply = await assistant_chat(req.message, req.history, ctx)
    return {"reply": reply, "timestamp": datetime.utcnow().isoformat()}


# ─── System Command Executor ──────────────────────────────────────────────────

import shutil, subprocess as _sp
from modules.assistant import chat as assistant_chat

# App name → possible binary names (ordered by preference)
APP_MAP = {
    # Browsers
    "browser":        ["xdg-open","firefox","chromium-browser","chromium","google-chrome","brave-browser","opera","epiphany","microsoft-edge"],
    "firefox":        ["firefox"],
    "chrome":         ["google-chrome","chromium-browser","chromium"],
    "brave":          ["brave-browser","brave"],
    "edge":           ["microsoft-edge","msedge"],
    "opera":          ["opera"],
    # Terminals
    "terminal":       ["x-terminal-emulator","gnome-terminal","konsole","xfce4-terminal","alacritty","kitty","tilix","xterm","wezterm"],
    "konsole":        ["konsole"],
    "alacritty":      ["alacritty"],
    # File managers
    "files":          ["nautilus","dolphin","thunar","nemo","pcmanfm"],
    "file manager":   ["nautilus","dolphin","thunar","nemo","pcmanfm"],
    "nautilus":       ["nautilus"],
    # Editors / IDE
    "text editor":    ["gedit","kate","mousepad","leafpad","xed","geany"],
    "editor":         ["gedit","kate","mousepad","xed","code","codium"],
    "vscode":         ["code","codium"],
    "vs code":        ["code","codium"],
    "code":           ["code","codium"],
    "notepad":        ["gedit","mousepad","xed","leafpad"],
    "vim":            ["vim"],
    "nano":           ["nano"],
    "gedit":          ["gedit"],
    # Productivity
    "calculator":     ["gnome-calculator","kcalc","galculator","qalculate-gtk","xcalc"],
    "calendar":       ["gnome-calendar","korganizer","gnome-contacts"],
    "clock":          ["gnome-clocks","kclock"],
    "contacts":       ["gnome-contacts","kaddressbook"],
    "maps":           ["gnome-maps","marble"],
    "notes":          ["gnome-notes","tomboy","xpad","gedit"],
    "sticky notes":   ["xpad","gnote","tomboy"],
    "todo":           ["gnome-todo","taskwarrior-tui"],
    # Office
    "libreoffice":    ["libreoffice"],
    "word":           ["libreoffice --writer","abiword"],
    "writer":         ["libreoffice --writer"],
    "excel":          ["libreoffice --calc","gnumeric"],
    "calc":           ["libreoffice --calc","gnumeric"],
    "spreadsheet":    ["libreoffice --calc","gnumeric"],
    "presentation":   ["libreoffice --impress"],
    "impress":        ["libreoffice --impress"],
    "powerpoint":     ["libreoffice --impress"],
    # Media
    "music":          ["rhythmbox","amarok","clementine","audacious","vlc","lollypop"],
    "spotify":        ["spotify","ncspot"],
    "vlc":            ["vlc"],
    "video":          ["vlc","totem","mpv","celluloid","haruna"],
    "mpv":            ["mpv"],
    "media player":   ["vlc","totem","mpv","celluloid"],
    "photos":         ["eog","shotwell","gwenview","gthumb","nomacs"],
    "image viewer":   ["eog","gwenview","nomacs","feh"],
    # Communication
    "mail":           ["thunderbird","evolution","geary","kmail"],
    "email":          ["thunderbird","evolution","geary"],
    "discord":        ["discord","vesktop","armcord"],
    "telegram":       ["telegram-desktop","telegram"],
    "whatsapp":       ["whatsapp-desktop","whatsdesk"],
    "slack":          ["slack"],
    "zoom":           ["zoom"],
    "teams":          ["teams","ms-teams"],
    "skype":          ["skype"],
    # System
    "settings":       ["gnome-control-center","systemsettings5","xfce4-settings-manager","cinnamon-settings"],
    "system monitor": ["gnome-system-monitor","ksysguard","htop"],
    "task manager":   ["gnome-system-monitor","ksysguard","xfce4-taskmanager"],
    "htop":           ["htop"],
    "top":            ["top"],
    "disk usage":     ["baobab","filelight","qdirstat"],
    "disk":           ["gnome-disks","gparted","partitionmanager"],
    "software":       ["gnome-software","discover","pamac","synaptic"],
    "app store":      ["gnome-software","discover","pamac"],
    "update":         ["gnome-software","update-manager"],
    # Graphics / Design
    "gimp":           ["gimp"],
    "inkscape":       ["inkscape"],
    "blender":        ["blender"],
    "kdenlive":       ["kdenlive"],
    "obs":            ["obs","obs-studio"],
    "screenshot":     ["gnome-screenshot","spectacle","xfce4-screenshooter","flameshot","scrot"],
    "camera":         ["cheese","guvcview","kamoso"],
    # Games
    "steam":          ["steam"],
    "lutris":         ["lutris"],
    "minecraft":      ["minecraft-launcher"],
    # Dev tools
    "docker":         ["docker","docker-desktop"],
    "postman":        ["postman"],
    "dbeaver":        ["dbeaver"],
    "github":         ["github-desktop"],
    # Password manager
    "passwords":      ["gnome-keyring","seahorse","keepassxc","bitwarden-desktop"],
    "keepass":        ["keepassxc"],
}

OPEN_KEYWORDS  = ["open","launch","start","run","show","bring up","start up","turn on","switch to","go to"]
CLOSE_KEYWORDS = ["close","kill","stop","quit","exit","shut","terminate"]
SEARCH_KEYWORDS = ["search","google","look up","find","search for"]
PLAY_KEYWORDS   = ["play","watch","listen"]
VOLUME_KEYWORDS = ["volume","louder","quieter","mute","unmute","sound"]


def _find_binary(names: list) -> str | None:
    for n in names:
        bin_name = n.split()[0]
        if shutil.which(bin_name):
            return n
    return None


def _detect_intent(message: str):
    """Return (action, app_key, extra) or None."""
    msg = message.lower().strip()

    # Search intent → open browser with search
    for kw in SEARCH_KEYWORDS:
        if msg.startswith(kw):
            query = msg[len(kw):].strip().lstrip("for").strip()
            if query:
                return "search", "browser", query

    # Play music/video on YouTube
    for kw in PLAY_KEYWORDS:
        if msg.startswith(kw):
            query = msg[len(kw):].strip()
            if query:
                return "youtube", "browser", query

    # Volume control
    if any(kw in msg for kw in VOLUME_KEYWORDS):
        if "mute" in msg and "unmute" not in msg:
            return "volume", "mute", ""
        elif "unmute" in msg:
            return "volume", "unmute", ""
        elif any(x in msg for x in ["up","higher","louder","increase"]):
            return "volume", "up", ""
        elif any(x in msg for x in ["down","lower","quieter","decrease"]):
            return "volume", "down", ""

    # Open URL directly
    if msg.startswith("open ") and ("http" in msg or ".com" in msg or ".in" in msg or ".org" in msg or ".net" in msg):
        url = msg.replace("open ","").strip()
        if not url.startswith("http"):
            url = "https://" + url
        return "url", "browser", url

    # Open/close app
    action = None
    for kw in OPEN_KEYWORDS:
        if kw in msg:
            action = "open"; break
    for kw in CLOSE_KEYWORDS:
        if kw in msg:
            action = "close"; break
    if not action:
        return None

    # Find app key — longest match first to avoid "code" matching "vs code"
    for key in sorted(APP_MAP.keys(), key=len, reverse=True):
        if key in msg:
            return action, key, ""

    return None


class CommandRequest(BaseModel):
    message: str


@api_router.post("/ai/command")
async def ai_command(req: CommandRequest):
    """Detect intent and execute, else fall through to chat."""
    intent = _detect_intent(req.message)

    if intent:
        action, app_key, extra = intent

        # ── Search ──────────────────────────────────────────
        if action == "search":
            url = f"https://www.google.com/search?q={extra.replace(' ', '+')}"
            browser = _find_binary(APP_MAP["browser"])
            if browser:
                _sp.Popen([browser.split()[0], url], stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Searching for '{extra}' in your browser ✓"}
            return {"type":"command","status":"error","reply":"No browser found to open search."}

        # ── YouTube ─────────────────────────────────────────
        if action == "youtube":
            url = f"https://www.youtube.com/results?search_query={extra.replace(' ', '+')}"
            browser = _find_binary(APP_MAP["browser"])
            if browser:
                _sp.Popen([browser.split()[0], url], stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Opening YouTube for '{extra}' ✓"}
            return {"type":"command","status":"error","reply":"No browser found."}

        # ── Open URL ─────────────────────────────────────────
        if action == "url":
            browser = _find_binary(APP_MAP["browser"])
            if browser:
                _sp.Popen([browser.split()[0], extra], stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":f"Opening {extra} ✓"}
            return {"type":"command","status":"error","reply":"No browser found."}

        # ── Volume ───────────────────────────────────────────
        if action == "volume":
            cmds = {
                "mute":   ["amixer", "-D", "pulse", "set", "Master", "mute"],
                "unmute": ["amixer", "-D", "pulse", "set", "Master", "unmute"],
                "up":     ["amixer", "-D", "pulse", "set", "Master", "10%+"],
                "down":   ["amixer", "-D", "pulse", "set", "Master", "10%-"],
            }
            labels = {"mute":"Muted","unmute":"Unmuted","up":"Volume up","down":"Volume down"}
            if app_key in cmds:
                try:
                    _sp.run(cmds[app_key], capture_output=True, timeout=5)
                    return {"type":"command","status":"ok","reply":f"{labels[app_key]} ✓"}
                except Exception as e:
                    return {"type":"command","status":"error","reply":f"Volume control error: {e}"}

        # ── Open app ─────────────────────────────────────────
        if action == "open":
            binaries = APP_MAP.get(app_key, [])
            binary = _find_binary(binaries)
            if binary:
                try:
                    _sp.Popen(binary.split(), stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True)
                    return {"type":"command","status":"ok","reply":f"Opening {app_key} ✓", "app":app_key}
                except Exception as e:
                    return {"type":"command","status":"error","reply":f"Found {app_key} but couldn't launch: {e}"}
            # Browser fallback with xdg-open
            if app_key == "browser" and shutil.which("xdg-open"):
                _sp.Popen(["xdg-open","https://"], stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True)
                return {"type":"command","status":"ok","reply":"Opening default browser ✓"}
            return {"type":"command","status":"not_found","reply":f"'{app_key}' is not installed on your system. Try installing it first."}

        # ── Close app ────────────────────────────────────────
        if action == "close":
            binaries = APP_MAP.get(app_key, [])
            binary_name = binaries[0].split()[0] if binaries else app_key
            try:
                r = _sp.run(["pkill", "-f", binary_name], capture_output=True)
                if r.returncode == 0:
                    return {"type":"command","status":"ok","reply":f"Closed {app_key} ✓"}
                return {"type":"command","status":"not_running","reply":f"{app_key} doesn't seem to be running."}
            except Exception as e:
                return {"type":"command","status":"error","reply":f"Error closing {app_key}: {e}"}

    # Not a command — normal AI chat
    reply = await assistant_chat(req.message, [], "")
    return {"type":"chat","status":"ok","reply":reply}


# ─── Safe File Writer ─────────────────────────────────────────────────────────

import pathlib, re as _re

# All PARTH-written files go here — never outside
SAFE_DIR = pathlib.Path.home() / "Documents" / "PARTH"
SAFE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'.txt','.md','.py','.js','.ts','.html','.css','.json',
                      '.yaml','.yml','.sh','.csv','.log','.conf','.ini','.toml','.xml'}

def _safe_path(filename: str) -> pathlib.Path:
    """Resolve path inside SAFE_DIR, reject any traversal."""
    # Strip dangerous characters
    clean = _re.sub(r'[^\w\.\-_ ]', '', filename).strip()
    if not clean:
        raise ValueError("Invalid filename")
    p = (SAFE_DIR / clean).resolve()
    # Must stay inside SAFE_DIR
    p.relative_to(SAFE_DIR.resolve())
    ext = p.suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Extension '{ext}' not allowed. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    return p

class FileWriteRequest(BaseModel):
    filename: str
    content: str
    append: bool = False

class FileReadRequest(BaseModel):
    filename: str

@api_router.post("/files/write")
async def write_file(req: FileWriteRequest):
    try:
        p = _safe_path(req.filename)
        mode = 'a' if req.append else 'w'
        p.write_text(req.content) if not req.append else open(p, 'a').write(req.content)
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
            files.append({"name": f.name, "size": f.stat().st_size,
                          "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat()})
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


# ─── Network Info ─────────────────────────────────────────────────────────────

import socket as _socket

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
        "lan_ip": lan_ip,
        "dashboard_url": f"http://{lan_ip}:5173",
        "api_url": f"http://{lan_ip}:8000",
    }


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
    port: int
    proto: str = "tcp"
    action: str = "block"

class KillRequest(BaseModel):
    pid: int
    signal: str = "TERM"

class LockdownRequest(BaseModel):
    enable: bool

class UnbanRequest(BaseModel):
    ip: str
    jail: str = "sshd"

@api_router.get("/defense/firewall/status")
async def defense_fw_status():
    return ufw_status()

@api_router.post("/defense/firewall/enable")
async def defense_fw_enable():
    return ufw_enable()

@api_router.post("/defense/firewall/disable")
async def defense_fw_disable():
    return ufw_disable()

@api_router.get("/defense/firewall/rules")
async def defense_fw_rules():
    return ufw_rules()

@api_router.post("/defense/firewall/block-ip")
async def defense_block_ip(req: IPRequest):
    return ufw_block_ip(req.ip)

@api_router.post("/defense/firewall/unblock-ip")
async def defense_unblock_ip(req: IPRequest):
    return ufw_unblock_ip(req.ip)

@api_router.post("/defense/firewall/port")
async def defense_fw_port(req: PortRequest):
    if req.action == "block":
        return ufw_block_port(req.port, req.proto)
    return ufw_allow_port(req.port, req.proto)

@api_router.get("/defense/processes/top")
async def defense_top_procs():
    return {"processes": top_processes()}

@api_router.get("/defense/processes/suspicious")
async def defense_suspicious_procs():
    return {"processes": suspicious_processes()}

@api_router.post("/defense/processes/kill")
async def defense_kill(req: KillRequest):
    return kill_process(req.pid, req.signal)

@api_router.get("/defense/network/ports")
async def defense_ports():
    return list_open_ports()

@api_router.get("/defense/network/connections")
async def defense_conns():
    return {"connections": active_connections()}

@api_router.post("/defense/lockdown")
async def defense_lockdown(req: LockdownRequest):
    return lockdown_mode(req.enable)

@api_router.get("/defense/fail2ban/status")
async def defense_f2b_status():
    return fail2ban_status()

@api_router.get("/defense/fail2ban/{jail}")
async def defense_f2b_jail(jail: str):
    return fail2ban_jail_status(jail)

@api_router.post("/defense/fail2ban/unban")
async def defense_f2b_unban(req: UnbanRequest):
    return fail2ban_unban(req.ip, req.jail)

@api_router.get("/defense/hardening")
async def defense_hardening():
    return hardening_audit()

@api_router.get("/defense/audit-log")
async def defense_audit_log(limit: int = 50):
    return {"entries": read_audit_log(limit)}


# ─── Defense Tools ────────────────────────────────────────────────────────────

from modules.defense import (
    kill_process, block_ip, unblock_ip, list_firewall_rules,
    close_port, list_open_ports, list_startup_programs, disable_startup,
    network_killswitch, suspend_process, resume_process, hardening_check,
)

class IPRequest(BaseModel):
    ip: str
    direction: str = "both"

class PortRequest(BaseModel):
    port: int
    protocol: str = "tcp"

class PIDRequest(BaseModel):
    pid: int
    force: bool = False

class StartupRequest(BaseModel):
    name: str
    location: str = ""

class KillswitchRequest(BaseModel):
    enable: bool

@api_router.post("/defense/kill-process")
async def defense_kill_process(req: PIDRequest):
    return await kill_process(req.pid, req.force)

@api_router.post("/defense/block-ip")
async def defense_block_ip(req: IPRequest):
    return await block_ip(req.ip, req.direction)

@api_router.post("/defense/unblock-ip")
async def defense_unblock_ip(req: IPRequest):
    return await unblock_ip(req.ip)

@api_router.get("/defense/firewall-rules")
async def defense_firewall_rules():
    return await list_firewall_rules()

@api_router.post("/defense/close-port")
async def defense_close_port(req: PortRequest):
    return await close_port(req.port, req.protocol)

@api_router.get("/defense/open-ports")
async def defense_open_ports():
    return await list_open_ports()

@api_router.get("/defense/startup")
async def defense_startup():
    return await list_startup_programs()

@api_router.post("/defense/startup/disable")
async def defense_disable_startup(req: StartupRequest):
    return await disable_startup(req.name, req.location)

@api_router.post("/defense/killswitch")
async def defense_killswitch(req: KillswitchRequest):
    return await network_killswitch(req.enable)

@api_router.post("/defense/suspend")
async def defense_suspend(req: PIDRequest):
    return await suspend_process(req.pid)

@api_router.post("/defense/resume")
async def defense_resume(req: PIDRequest):
    return await resume_process(req.pid)

@api_router.get("/defense/hardening")
async def defense_hardening():
    return await hardening_check()
