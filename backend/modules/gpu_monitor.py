"""
PARTH GPU Monitor
Detects high GPU utilization (crypto miners).
Uses nvidia-smi if available, falls back to /sys for AMD.
"""

import asyncio
import logging
import subprocess
import os
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.gpu_monitor")
POLL_INTERVAL = 30
GPU_THRESHOLD = 90.0  # % utilization


def _nvidia_stats() -> list:
    """Returns list of {index, name, util, mem_util, temp}."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=index,name,utilization.gpu,utilization.memory,temperature.gpu",
             "--format=csv,noheader,nounits"],
            timeout=5, text=True, stderr=subprocess.DEVNULL
        )
        gpus = []
        for line in out.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5:
                gpus.append({
                    "index": parts[0], "name": parts[1],
                    "util": float(parts[2]), "mem_util": float(parts[3]),
                    "temp": float(parts[4]),
                })
        return gpus
    except Exception:
        return []


def _amd_stats() -> list:
    """Basic AMD GPU util via sysfs."""
    gpus = []
    base = "/sys/class/drm"
    if not os.path.isdir(base):
        return gpus
    for card in os.listdir(base):
        util_path = f"{base}/{card}/device/gpu_busy_percent"
        if not os.path.exists(util_path):
            continue
        try:
            util = float(open(util_path).read().strip())
            gpus.append({"index": card, "name": "AMD GPU", "util": util, "mem_util": 0, "temp": 0})
        except Exception:
            continue
    return gpus


class GPUMonitor:
    name = "gpu_monitor"

    def __init__(self):
        self._running = False
        self._alerted: set = set()

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("GPU monitor started")

        while self._running:
            try:
                gpus = _nvidia_stats() or _amd_stats()
                if not gpus:
                    # No GPU or no driver — sleep longer
                    await asyncio.sleep(POLL_INTERVAL * 4)
                    continue

                for gpu in gpus:
                    util = gpu["util"]
                    idx = gpu["index"]

                    if util >= GPU_THRESHOLD and idx not in self._alerted:
                        self._alerted.add(idx)
                        scoring = score_event("high_cpu_spike", {"cpu_percent": util})
                        await event_bus.publish(Event(
                            source="gpu_monitor",
                            event_type="high_gpu_utilization",
                            severity="high",
                            data={
                                "gpu_index": idx,
                                "gpu_name": gpu["name"],
                                "util_percent": util,
                                "mem_util_percent": gpu["mem_util"],
                                "temp_celsius": gpu["temp"],
                                "threshold": GPU_THRESHOLD,
                                "reason": f"GPU {idx} ({gpu['name']}) at {util}% — possible crypto miner",
                                "risk_score": scoring["score"],
                                "ai_analyze": True,
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        ))
                    elif util < GPU_THRESHOLD - 10:
                        self._alerted.discard(idx)

            except Exception as e:
                logger.error(f"gpu_monitor error: {e}")

            await asyncio.sleep(POLL_INTERVAL)
