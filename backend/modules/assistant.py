"""
PARTH AI Assistant + Resource Alerter — cross-platform, debounced.
"""

import asyncio, logging, os, sys, aiohttp
from datetime import datetime
from core.event_bus import event_bus, Event

logger = logging.getLogger("parth.assistant")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL      = os.environ.get("PARTH_MODEL", "mistral")

CPU_ALERT  = float(os.environ.get("PARTH_CPU_ALERT",  "88"))
MEM_ALERT  = float(os.environ.get("PARTH_MEM_ALERT",  "90"))
DISK_ALERT = float(os.environ.get("PARTH_DISK_ALERT", "92"))
RES_POLL   = int(os.environ.get("PARTH_RES_POLL",     "15"))
COOLDOWN   = 180   # seconds between same-type alerts

IS_WINDOWS = sys.platform == "win32"
DISK_PATH  = "C:\\" if IS_WINDOWS else "/"

_cooldowns: dict = {}

def _should_alert(key):
    now = datetime.utcnow().timestamp()
    if now - _cooldowns.get(key, 0) > COOLDOWN:
        _cooldowns[key] = now
        return True
    return False


class ResourceAlerter:
    name = "resource_alerter"
    def __init__(self): self._running = False
    def stop(self): self._running = False

    async def run(self):
        self._running = True
        import psutil
        # Strike counters — only alert after 3 consecutive readings
        strikes = {"cpu": 0, "mem": 0, "disk": 0}

        while self._running:
            try:
                cpu  = psutil.cpu_percent(interval=1)
                mem  = psutil.virtual_memory()
                disk = psutil.disk_usage(DISK_PATH)

                checks = [
                    ("cpu",  cpu,          CPU_ALERT,  f"CPU at {cpu:.1f}%"),
                    ("mem",  mem.percent,  MEM_ALERT,  f"RAM at {mem.percent:.1f}% — {round(mem.available/1024/1024)}MB free"),
                    ("disk", disk.percent, DISK_ALERT, f"Disk at {disk.percent:.1f}%"),
                ]
                for key, val, threshold, msg in checks:
                    if val >= threshold:
                        strikes[key] += 1
                    else:
                        strikes[key] = 0
                    if strikes[key] == 3 and _should_alert(key):
                        sev = "critical" if val >= threshold + 10 else "high"
                        await event_bus.publish(Event(
                            source="resource_alerter",
                            event_type=f"{key}_spike",
                            severity=sev,
                            data={"value": round(val,1), "threshold": threshold,
                                  "message": msg, "reason": msg,
                                  "timestamp": datetime.utcnow().isoformat()}
                        ))
            except Exception as e:
                logger.error(f"resource_alerter: {e}")
            await asyncio.sleep(RES_POLL)


ASSISTANT_SYSTEM = f"""You are PARTH, a personal AI assistant and cybersecurity defender created by Pushkar. Running on {sys.platform}.
Be friendly, warm, and concise — like a helpful tech-savvy friend, not a robot.
Rules: Always say you are PARTH by Pushkar (never any other AI). Keep replies SHORT. Plain text only, no asterisks or markdown. Be conversational."""


async def chat(message: str, history: list = None, system_context: str = "") -> str:
    history = history or []
    ctx = f"\nSystem: {system_context}" if system_context else ""
    parts = [f"{ASSISTANT_SYSTEM}{ctx}\n\n"]
    for t in history[-4:]:
        parts.append(f"{'Human' if t['role']=='user' else 'Assistant'}: {t['content']}\n")
    parts.append(f"Human: {message}\nAssistant:")
    prompt = "".join(parts)

    try:
        payload = {"model": MODEL, "prompt": prompt, "stream": False,
                   "options": {"temperature": 0.3, "num_predict": 350, "num_ctx": 2048}}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as s:
            async with s.post(OLLAMA_URL, json=payload) as r:
                if r.status != 200:
                    return f"Ollama error {r.status}. Run: ollama serve"
                return (await r.json()).get("response","").strip()
    except aiohttp.ClientConnectorError:
        return "Cannot reach Ollama. Run: ollama serve"
    except asyncio.TimeoutError:
        return "Timed out. Try a smaller model (phi3, qwen2.5:1.5b)."
    except Exception as e:
        return f"Error: {e}"
