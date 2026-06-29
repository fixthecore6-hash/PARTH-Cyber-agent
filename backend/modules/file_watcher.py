"""
PARTH File Watcher
File integrity monitoring using SHA256 baseline hashing.
"""

import asyncio
import hashlib
import logging
import os
import json
from datetime import datetime
from pathlib import Path
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.file_watcher")

# Directories to monitor
WATCHED_PATHS = [
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
    "/etc/hosts",
    "/etc/crontab",
    "/etc/ssh/sshd_config",
    "/etc/ld.so.preload",
    "/etc/profile",
    "/etc/bashrc",
    "/root/.bashrc",
    "/root/.profile",
    "/root/.ssh/authorized_keys",
]

WATCHED_DIRS = [
    "/etc/cron.d",
    "/etc/cron.daily",
    "/etc/init.d",
    "/etc/systemd/system",
]

import pathlib as _pathlib
BASELINE_FILE = str(_pathlib.Path(__file__).resolve().parent.parent / "db" / "file_baseline.json")
POLL_INTERVAL = 30  # seconds


def sha256_file(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (PermissionError, FileNotFoundError, OSError):
        return None


def collect_all_targets():
    targets = list(WATCHED_PATHS)
    for d in WATCHED_DIRS:
        if os.path.isdir(d):
            for fname in os.listdir(d):
                fpath = os.path.join(d, fname)
                if os.path.isfile(fpath):
                    targets.append(fpath)
    return targets


class FileWatcher:
    name = "file_watcher"

    def __init__(self):
        self._running = False
        self._baseline: dict = {}

    def stop(self):
        self._running = False

    def _load_baseline(self):
        if os.path.exists(BASELINE_FILE):
            with open(BASELINE_FILE, "r") as f:
                self._baseline = json.load(f)
        else:
            self._build_baseline()

    def _build_baseline(self):
        logger.info("Building file integrity baseline...")
        baseline = {}
        for path in collect_all_targets():
            h = sha256_file(path)
            if h:
                baseline[path] = {
                    "hash": h,
                    "created_at": datetime.utcnow().isoformat(),
                    "size": os.path.getsize(path),
                }
        os.makedirs(os.path.dirname(BASELINE_FILE), exist_ok=True)
        with open(BASELINE_FILE, "w") as f:
            json.dump(baseline, f, indent=2)
        self._baseline = baseline
        logger.info(f"Baseline built with {len(baseline)} files")

    async def run(self):
        self._running = True
        logger.info("File watcher started")
        self._load_baseline()

        while self._running:
            try:
                await self._check_integrity()
            except Exception as e:
                logger.error(f"file_watcher error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _check_integrity(self):
        for path in collect_all_targets():
            current_hash = sha256_file(path)

            if path not in self._baseline:
                # New file appeared in watched dir
                if current_hash:
                    self._baseline[path] = {
                        "hash": current_hash,
                        "created_at": datetime.utcnow().isoformat(),
                        "size": os.path.getsize(path) if os.path.exists(path) else 0,
                    }
                    scoring = score_event("file_integrity_change", {})
                    await event_bus.publish(Event(
                        source="file_watcher",
                        event_type="new_file_detected",
                        severity=scoring["severity"],
                        data={
                            "path": path,
                            "hash": current_hash,
                            "risk_score": scoring["score"],
                            "ai_analyze": True,
                        }
                    ))
                continue

            if current_hash is None:
                # File was deleted
                await event_bus.publish(Event(
                    source="file_watcher",
                    event_type="file_deleted",
                    severity="high",
                    data={
                        "path": path,
                        "previous_hash": self._baseline[path]["hash"],
                        "ai_analyze": True,
                    }
                ))
                del self._baseline[path]
                continue

            if current_hash != self._baseline[path]["hash"]:
                scoring = score_event("file_integrity_change", {})
                await event_bus.publish(Event(
                    source="file_watcher",
                    event_type="file_integrity_violation",
                    severity=scoring["severity"],
                    data={
                        "path": path,
                        "old_hash": self._baseline[path]["hash"],
                        "new_hash": current_hash,
                        "risk_score": scoring["score"],
                        "ai_analyze": True,
                    }
                ))
                # Update baseline to new value
                self._baseline[path]["hash"] = current_hash
                self._baseline[path]["modified_at"] = datetime.utcnow().isoformat()
