"""
PARTH System Monitor — fixed CPU spike issue + cross-platform
Uses cpu_percent(interval=1) with asyncio.to_thread to avoid blocking.
Raises thresholds to reduce false spikes on normal operation.
"""

import asyncio, logging, sys
import psutil
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.sys_monitor")

CPU_THRESHOLD  = float(__import__('os').environ.get("PARTH_CPU_ALERT",  "88"))
MEM_THRESHOLD  = float(__import__('os').environ.get("PARTH_MEM_ALERT",  "90"))
DISK_THRESHOLD = float(__import__('os').environ.get("PARTH_DISK_ALERT", "92"))
POLL_INTERVAL  = 20   # seconds — less frequent = less overhead
SPIKE_COUNT    = 3    # must exceed threshold N times in a row before alerting (debounce)

IS_WINDOWS = sys.platform == "win32"
DISK_PATH  = "C:\\" if IS_WINDOWS else "/"


def _blocking_cpu():
    """Blocking call — run in thread to avoid event loop stall."""
    return psutil.cpu_percent(interval=2)   # 2s blocking sample = accurate reading


class SystemMonitor:
    name = "sys_monitor"

    def __init__(self):
        self._running      = False
        self._cpu_strikes  = 0
        self._mem_strikes  = 0

    def stop(self): self._running = False

    async def run(self):
        self._running = True
        logger.info("System monitor started")
        # Prime the counter once without alerting
        await asyncio.to_thread(_blocking_cpu)
        await asyncio.sleep(2)

        while self._running:
            try:
                await self._collect()
            except Exception as e:
                logger.error(f"sys_monitor: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _collect(self):
        # Run blocking cpu_percent in thread so we don't stall the event loop
        cpu  = await asyncio.to_thread(_blocking_cpu)
        mem  = psutil.virtual_memory()
        disk = psutil.disk_usage(DISK_PATH)
        net  = psutil.net_io_counters()

        # Heartbeat metric (always)
        await event_bus.publish(Event(
            source="sys_monitor", event_type="system_metrics", severity="info",
            data={
                "cpu_percent": round(cpu, 1),
                "mem_percent": round(mem.percent, 1),
                "mem_available_mb": round(mem.available / 1024 / 1024),
                "disk_percent": round(disk.percent, 1),
                "net_bytes_sent": net.bytes_sent,
                "net_bytes_recv": net.bytes_recv,
                "platform": sys.platform,
                "timestamp": datetime.utcnow().isoformat(),
            }
        ))

        # CPU — debounced: must spike N times in a row
        if cpu > CPU_THRESHOLD:
            self._cpu_strikes += 1
        else:
            self._cpu_strikes = 0

        if self._cpu_strikes == SPIKE_COUNT:
            top = []
            for p in psutil.process_iter(["pid","name","cpu_percent"]):
                try: top.append(p.info)
                except: pass
            top = sorted(top, key=lambda x: x.get("cpu_percent") or 0, reverse=True)[:5]
            scoring = score_event("high_cpu_spike", {"cpu_percent": cpu})
            await event_bus.publish(Event(
                source="sys_monitor", event_type="high_cpu_spike",
                severity=scoring["severity"],
                data={"cpu_percent": cpu, "threshold": CPU_THRESHOLD,
                      "top_processes": top, "risk_score": scoring["score"],
                      "sustained_seconds": SPIKE_COUNT * POLL_INTERVAL}
            ))

        # Memory — debounced
        if mem.percent > MEM_THRESHOLD:
            self._mem_strikes += 1
        else:
            self._mem_strikes = 0

        if self._mem_strikes == SPIKE_COUNT:
            scoring = score_event("high_memory_usage", {})
            await event_bus.publish(Event(
                source="sys_monitor", event_type="high_memory_usage",
                severity=scoring["severity"],
                data={"mem_percent": mem.percent, "threshold": MEM_THRESHOLD,
                      "available_mb": round(mem.available / 1024 / 1024),
                      "risk_score": scoring["score"]}
            ))

        # Disk
        if disk.percent > DISK_THRESHOLD:
            await event_bus.publish(Event(
                source="sys_monitor", event_type="disk_critical", severity="high",
                data={"disk_percent": disk.percent,
                      "free_gb": round(disk.free / 1024 / 1024 / 1024, 2)}
            ))
