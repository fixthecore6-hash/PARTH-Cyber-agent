"""
PARTH Process Monitor
Detects suspicious processes, privilege escalation, unknown binaries.
"""

import asyncio
import logging
import psutil
import os
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.proc_monitor")

POLL_INTERVAL = 20  # seconds

# Known suspicious command patterns
SUSPICIOUS_PATTERNS = [
    "nc ", "netcat", "ncat",
    "/dev/tcp", "/dev/udp",
    "base64 -d",
    "python -c", "perl -e", "ruby -e",
    "curl | bash", "wget | sh",
    "chmod 777",
    "chmod +s",
    "/tmp/", "/var/tmp/",
    "msfconsole", "metasploit",
    "socat",
    "cryptominer", "xmrig", "minerd",
]

SENSITIVE_DIRS = ["/etc/passwd", "/etc/shadow", "/etc/sudoers", "/root/"]


class ProcessMonitor:
    name = "proc_monitor"

    def __init__(self):
        self._running = False
        self._known_pids = set()
        self._alerted_pids = set()

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("Process monitor started")

        # Build initial known PIDs
        for p in psutil.process_iter():
            self._known_pids.add(p.pid)

        while self._running:
            try:
                await self._scan_processes()
            except Exception as e:
                logger.error(f"proc_monitor error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _scan_processes(self):
        current_pids = set()

        for proc in psutil.process_iter(
            ["pid", "name", "cmdline", "username", "exe", "status", "uids", "create_time"]
        ):
            try:
                info = proc.info
                pid = info["pid"]
                current_pids.add(pid)
                name = info.get("name", "") or ""
                cmdline = " ".join(info.get("cmdline") or [])
                username = info.get("username", "") or ""
                uids = info.get("uids")
                uid = uids.real if uids else -1
                exe = info.get("exe", "") or ""

                # New process appeared
                is_new = pid not in self._known_pids
                if is_new:
                    self._known_pids.add(pid)

                # Check suspicious cmdline
                for pattern in SUSPICIOUS_PATTERNS:
                    if pattern.lower() in cmdline.lower():
                        if pid not in self._alerted_pids:
                            self._alerted_pids.add(pid)
                            scoring = score_event("unknown_process", {
                                "is_root": uid == 0,
                                "network_activity": any(kw in cmdline for kw in ["nc ", "netcat", "socat"]),
                            })
                            await event_bus.publish(Event(
                                source="proc_monitor",
                                event_type="suspicious_process",
                                severity=scoring["severity"],
                                data={
                                    "pid": pid,
                                    "name": name,
                                    "cmdline": cmdline[:300],
                                    "username": username,
                                    "uid": uid,
                                    "exe": exe,
                                    "matched_pattern": pattern,
                                    "risk_score": scoring["score"],
                                    "ai_analyze": True,
                                }
                            ))

                # Detect non-root process escalating to UID 0
                if uid == 0 and username not in ("root", "") and pid not in self._alerted_pids:
                    self._alerted_pids.add(pid)
                    scoring = score_event("privilege_escalation", {"is_root": True})
                    await event_bus.publish(Event(
                        source="proc_monitor",
                        event_type="privilege_escalation",
                        severity=scoring["severity"],
                        data={
                            "pid": pid,
                            "name": name,
                            "cmdline": cmdline[:300],
                            "username": username,
                            "uid": uid,
                            "risk_score": scoring["score"],
                            "ai_analyze": True,
                        }
                    ))

                # Detect processes running from /tmp or /var/tmp
                if exe and (exe.startswith("/tmp/") or exe.startswith("/var/tmp/")):
                    if pid not in self._alerted_pids:
                        self._alerted_pids.add(pid)
                        scoring = score_event("malware_behavior", {"is_root": uid == 0})
                        await event_bus.publish(Event(
                            source="proc_monitor",
                            event_type="process_in_tmp",
                            severity=scoring["severity"],
                            data={
                                "pid": pid,
                                "name": name,
                                "exe": exe,
                                "username": username,
                                "risk_score": scoring["score"],
                                "ai_analyze": True,
                            }
                        ))

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # Cleanup dead PIDs from alert cache
        dead = self._alerted_pids - current_pids
        self._alerted_pids -= dead
