"""
PARTH Log Ingestor
Tails system logs and detects suspicious patterns.
"""

import asyncio
import logging
import re
import os
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.log_ingestor")

POLL_INTERVAL = 10  # seconds

LOG_FILES = [
    "/var/log/auth.log",
    "/var/log/syslog",
    "/var/log/kern.log",
    "/var/log/ufw.log",
    "/var/log/dpkg.log",
]

# Pattern: (regex, event_type, severity_hint)
LOG_PATTERNS = [
    (re.compile(r"Failed password for .+ from (\S+)", re.I),   "failed_login",         "medium"),
    (re.compile(r"authentication failure",                re.I), "auth_failure",          "medium"),
    (re.compile(r"sudo:.+command not allowed",            re.I), "sudo_denied",           "medium"),
    (re.compile(r"CRON.+CMD\s+\((.+)\)",                  re.I), "cron_execution",        "low"),
    (re.compile(r"segfault at",                           re.I), "segfault",              "low"),
    (re.compile(r"kernel: \[.+\] .+oom.+killed",          re.I), "oom_kill",              "medium"),
    (re.compile(r"UFW BLOCK",                             re.I), "firewall_block",        "low"),
    (re.compile(r"accepted publickey for (\S+) from (\S+)", re.I), "ssh_login",           "info"),
    (re.compile(r"new user: name=(\S+)",                  re.I), "new_user_created",      "high"),
    (re.compile(r"usermod.+",                             re.I), "user_modified",         "medium"),
    (re.compile(r"passwd\[.+\]: pam_unix.+: password changed", re.I), "password_changed", "medium"),
    (re.compile(r"possible SYN flooding",                 re.I), "syn_flood",             "high"),
    (re.compile(r"nf_conntrack: table full",              re.I), "conntrack_full",        "medium"),
    (re.compile(r"Accepted password for root",            re.I), "root_login",            "critical"),
    (re.compile(r"su: .+ to root",                        re.I), "su_to_root",            "high"),
]

# Track failed logins per IP for burst detection
_failed_logins: dict = {}
FAILED_LOGIN_BURST_THRESHOLD = 5


class LogIngestor:
    name = "log_ingestor"

    def __init__(self):
        self._running = False
        self._file_positions: dict = {}

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("Log ingestor started")

        # Seek to end of all log files so we only see new lines
        for path in LOG_FILES:
            if os.path.exists(path):
                try:
                    self._file_positions[path] = os.path.getsize(path)
                except OSError:
                    self._file_positions[path] = 0
            else:
                self._file_positions[path] = 0

        while self._running:
            try:
                for path in LOG_FILES:
                    await self._tail_file(path)
            except Exception as e:
                logger.error(f"log_ingestor error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _tail_file(self, path: str):
        if not os.path.exists(path):
            return
        try:
            current_size = os.path.getsize(path)
        except OSError:
            return

        if current_size < self._file_positions.get(path, 0):
            # File was rotated
            self._file_positions[path] = 0

        pos = self._file_positions.get(path, 0)
        if current_size <= pos:
            return

        try:
            with open(path, "r", errors="replace") as f:
                f.seek(pos)
                new_lines = f.readlines()
                self._file_positions[path] = f.tell()
        except (PermissionError, OSError):
            return

        for line in new_lines:
            line = line.strip()
            if not line:
                continue
            await self._analyze_line(path, line)

    async def _analyze_line(self, log_file: str, line: str):
        for pattern, event_type, severity_hint in LOG_PATTERNS:
            m = pattern.search(line)
            if m:
                data = {
                    "log_file": log_file,
                    "raw_line": line[:500],
                    "matched_groups": list(m.groups()),
                    "timestamp": datetime.utcnow().isoformat(),
                }

                # Burst detection for failed logins
                if event_type == "failed_login":
                    ip = m.group(1) if m.groups() else "unknown"
                    _failed_logins[ip] = _failed_logins.get(ip, 0) + 1
                    if _failed_logins[ip] >= FAILED_LOGIN_BURST_THRESHOLD:
                        scoring = score_event("failed_login_burst", {"repeated": True})
                        await event_bus.publish(Event(
                            source="log_ingestor",
                            event_type="brute_force_detected",
                            severity=scoring["severity"],
                            data={
                                **data,
                                "source_ip": ip,
                                "attempt_count": _failed_logins[ip],
                                "risk_score": scoring["score"],
                                "ai_analyze": True,
                                "suggested_action": f"Block IP {ip} with: sudo ufw deny from {ip}",
                            }
                        ))
                        _failed_logins[ip] = 0  # reset burst counter
                        continue

                scoring = score_event(event_type, {})
                await event_bus.publish(Event(
                    source="log_ingestor",
                    event_type=event_type,
                    severity=severity_hint,
                    data={**data, "risk_score": scoring["score"]},
                ))
                break  # one match per line
