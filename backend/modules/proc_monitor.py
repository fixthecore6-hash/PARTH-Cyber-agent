"""
PARTH Process Monitor
Detects suspicious processes, privilege escalation, unknown binaries.
Windows-compatible: uids only exist on Linux/macOS.
"""

import asyncio
import logging
import psutil
import os
import platform
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.proc_monitor")

POLL_INTERVAL = 20
IS_WINDOWS = platform.system() == "Windows"

SUSPICIOUS_PATTERNS = [
    "nc ", "netcat", "ncat",
    "/dev/tcp", "/dev/udp",
    "base64 -d",
    "python -c", "perl -e", "ruby -e",
    "curl | bash", "wget | sh",
    "chmod 777", "chmod +s",
    "/tmp/", "/var/tmp/",
    "msfconsole", "metasploit",
    "socat",
    "cryptominer", "xmrig", "minerd",
    # Windows-specific
    "powershell -enc", "powershell -e ",
    "cmd /c", "certutil -decode",
    "bitsadmin /transfer",
    "wscript.exe", "cscript.exe",
    "regsvr32 /s /n /u",
    "mshta.exe http",
]

SENSITIVE_DIRS_WIN = ["C:\\Windows\\Temp\\", "%TEMP%\\", "C:\\Users\\Public\\"]
SENSITIVE_DIRS_LIN = ["/etc/passwd", "/etc/shadow", "/etc/sudoers", "/root/"]


def _get_uid(proc_info: dict) -> int:
    """Safely get UID — Windows doesn't have uids attr."""
    if IS_WINDOWS:
        return -1
    uids = proc_info.get("uids")
    if uids is None:
        return -1
    try:
        return uids.real
    except AttributeError:
        return -1


def _is_root(uid: int, username: str) -> bool:
    if IS_WINDOWS:
        return username.lower() in ("system", "nt authority\\system")
    return uid == 0


def _in_temp(exe: str) -> bool:
    if not exe:
        return False
    exe_l = exe.lower()
    if IS_WINDOWS:
        return any(d.lower() in exe_l for d in ["\\temp\\", "\\tmp\\", "c:\\users\\public\\"])
    return exe.startswith("/tmp/") or exe.startswith("/var/tmp/")


# Build attrs list per platform — uids only on non-Windows
_PROC_ATTRS = ["pid", "name", "cmdline", "username", "exe", "status", "create_time"]
if not IS_WINDOWS:
    _PROC_ATTRS.append("uids")


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

        for proc in psutil.process_iter(_PROC_ATTRS):
            try:
                info = proc.info
                pid = info["pid"]
                current_pids.add(pid)
                name     = info.get("name", "") or ""
                cmdline  = " ".join(info.get("cmdline") or [])
                username = info.get("username", "") or ""
                uid      = _get_uid(info)
                exe      = info.get("exe", "") or ""
                is_root  = _is_root(uid, username)

                is_new = pid not in self._known_pids
                if is_new:
                    self._known_pids.add(pid)

                # Suspicious cmdline patterns
                for pattern in SUSPICIOUS_PATTERNS:
                    if pattern.lower() in cmdline.lower():
                        if pid not in self._alerted_pids:
                            self._alerted_pids.add(pid)
                            scoring = score_event("unknown_process", {
                                "is_root": is_root,
                                "network_activity": any(
                                    kw in cmdline for kw in ["nc ", "netcat", "socat"]
                                ),
                            })
                            await event_bus.publish(Event(
                                source="proc_monitor",
                                event_type="suspicious_process",
                                severity=scoring["severity"],
                                data={
                                    "pid": pid, "name": name,
                                    "cmdline": cmdline[:300],
                                    "username": username, "uid": uid,
                                    "exe": exe,
                                    "matched_pattern": pattern,
                                    "risk_score": scoring["score"],
                                    "ai_analyze": True,
                                }
                            ))
                        break

                # Privilege escalation (Linux: uid 0, Windows: SYSTEM username)
                if is_root and username not in ("root", "", "SYSTEM", "NT AUTHORITY\\SYSTEM") \
                        and pid not in self._alerted_pids:
                    self._alerted_pids.add(pid)
                    scoring = score_event("privilege_escalation", {"is_root": True})
                    await event_bus.publish(Event(
                        source="proc_monitor",
                        event_type="privilege_escalation",
                        severity=scoring["severity"],
                        data={
                            "pid": pid, "name": name,
                            "cmdline": cmdline[:300],
                            "username": username, "uid": uid,
                            "risk_score": scoring["score"],
                            "ai_analyze": True,
                        }
                    ))

                # Process running from temp directory
                if _in_temp(exe) and pid not in self._alerted_pids:
                    self._alerted_pids.add(pid)
                    scoring = score_event("malware_behavior", {"is_root": is_root})
                    await event_bus.publish(Event(
                        source="proc_monitor",
                        event_type="process_in_tmp",
                        severity=scoring["severity"],
                        data={
                            "pid": pid, "name": name, "exe": exe,
                            "username": username,
                            "risk_score": scoring["score"],
                            "ai_analyze": True,
                        }
                    ))

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        dead = self._alerted_pids - current_pids
        self._alerted_pids -= dead
