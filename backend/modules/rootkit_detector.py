"""
PARTH Rootkit Detector — optimized, low-resource
Reduced poll frequency, cheaper checks first.
"""
import asyncio, logging, os, subprocess, psutil
from datetime import datetime
from pathlib import Path
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.rootkit_detector")
POLL_INTERVAL = 120   # was 60 — doubled to halve CPU cost

def _proc_pids():
    pids = set()
    try:
        for e in os.listdir("/proc"):
            if e.isdigit(): pids.add(int(e))
    except Exception: pass
    return pids

def _find_suid(paths=None):
    if paths is None:
        paths = ["/usr/bin","/usr/sbin","/bin","/sbin"]
    suid = set()
    for base in paths:
        if not os.path.isdir(base): continue
        try:
            for f in os.listdir(base):
                fp = os.path.join(base, f)
                try:
                    if os.stat(fp).st_mode & 0o4000: suid.add(fp)
                except OSError: continue
        except PermissionError: continue
    return suid

class RootkitDetector:
    name = "rootkit_detector"
    def __init__(self):
        self._running=False; self._suid=set(); self._modules=set(); self._ready=False

    def stop(self): self._running=False

    async def run(self):
        self._running=True
        logger.info("Rootkit detector started")
        # Defer baseline build so startup isn't heavy
        await asyncio.sleep(30)
        self._suid = await asyncio.to_thread(_find_suid)
        self._modules = await asyncio.to_thread(self._read_modules)
        self._ready = True
        while self._running:
            try:
                await self._check_preload()          # cheapest
                await self._check_kernel_modules()   # cheap
                await asyncio.sleep(30)
                await self._check_new_suid()         # moderate
                await asyncio.sleep(30)
                await self._check_hidden_procs()     # most expensive — last
            except Exception as e: logger.error(f"rootkit: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _check_hidden_procs(self):
        proc_pids  = await asyncio.to_thread(_proc_pids)
        ps_pids    = set(psutil.pids())
        hidden     = proc_pids - ps_pids - {0}
        for pid in list(hidden)[:3]:   # limit to 3 per cycle
            cp = f"/proc/{pid}/cmdline"
            if not os.path.exists(cp): continue
            try:
                with open(cp,"rb") as f:
                    cmdline = f.read().replace(b"\x00",b" ").decode(errors="replace").strip()
            except OSError: continue
            if not cmdline: continue
            await event_bus.publish(Event(source="rootkit_detector",event_type="hidden_process",severity="critical",
                data={"pid":pid,"cmdline":cmdline[:200],"reason":"Hidden from psutil","ai_analyze":True,"timestamp":datetime.utcnow().isoformat()}))

    async def _check_preload(self):
        if not os.path.exists("/etc/ld.so.preload"): return
        try:
            content = Path("/etc/ld.so.preload").read_text().strip()
        except OSError: return
        if content:
            await event_bus.publish(Event(source="rootkit_detector",event_type="ld_preload_set",severity="critical",
                data={"content":content[:300],"reason":"ld.so.preload has entries","ai_analyze":True,"timestamp":datetime.utcnow().isoformat()}))

    def _read_modules(self):
        mods=set()
        try:
            with open("/proc/modules") as f:
                for line in f: mods.add(line.split()[0])
        except OSError: pass
        return mods

    async def _check_kernel_modules(self):
        if not self._ready: return
        current = await asyncio.to_thread(self._read_modules)
        for mod in current - self._modules:
            await event_bus.publish(Event(source="rootkit_detector",event_type="new_kernel_module",severity="high",
                data={"module":mod,"reason":f"New kernel module: {mod}","timestamp":datetime.utcnow().isoformat()}))
        self._modules = current

    async def _check_new_suid(self):
        if not self._ready: return
        current = await asyncio.to_thread(_find_suid)
        for path in current - self._suid:
            await event_bus.publish(Event(source="rootkit_detector",event_type="new_suid_binary",severity="high",
                data={"path":path,"reason":f"New SUID binary: {path}","timestamp":datetime.utcnow().isoformat()}))
        self._suid = current
