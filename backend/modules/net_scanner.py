"""
PARTH Network Scanner
Monitors active connections, detects port scans, suspicious outbound traffic.
"""

import asyncio
import logging
import psutil
import socket
import subprocess
import json
from datetime import datetime
from collections import defaultdict
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.net_scanner")

POLL_INTERVAL = 30  # seconds

# Suspicious ports often used by RATs, reverse shells, crypto miners
SUSPICIOUS_PORTS = {
    4444, 4445, 1234, 31337, 6666, 6667, 8888,
    9001, 9050,  # Tor
    3333, 4444, 14444, 45700,  # Crypto miners
}

# Sensitive local ports that shouldn't have unexpected inbound
SENSITIVE_LOCAL_PORTS = {22, 3306, 5432, 27017, 6379, 2375, 2376}

# Known bad IP ranges (minimal example — extend with threat intel feeds)
KNOWN_BAD_CIDRS = []

# Ports that are almost always benign outbound
WHITELIST_PORTS = {80, 443, 53, 123, 67, 68}


class NetworkScanner:
    name = "net_scanner"

    def __init__(self):
        self._running = False
        self._known_connections = set()
        self._connection_counts = defaultdict(int)  # remote_ip -> count (for scan detection)

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("Network scanner started")

        while self._running:
            try:
                await self._scan_connections()
                await self._check_listening_ports()
            except Exception as e:
                logger.error(f"net_scanner error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _scan_connections(self):
        try:
            connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied:
            return

        current_keys = set()

        for conn in connections:
            if conn.status != "ESTABLISHED":
                continue
            if conn.raddr is None:
                continue

            remote_ip = conn.raddr.ip
            remote_port = conn.raddr.port
            local_port = conn.laddr.port if conn.laddr else 0
            pid = conn.pid
            key = (remote_ip, remote_port, local_port, pid)
            current_keys.add(key)

            if key in self._known_connections:
                continue

            self._known_connections.add(key)

            # Skip whitelisted ports
            if remote_port in WHITELIST_PORTS:
                continue

            # Get process name
            proc_name = "unknown"
            try:
                if pid:
                    p = psutil.Process(pid)
                    proc_name = p.name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

            # Alert on suspicious remote ports
            if remote_port in SUSPICIOUS_PORTS:
                scoring = score_event("suspicious_connection", {"network_activity": True})
                await event_bus.publish(Event(
                    source="net_scanner",
                    event_type="suspicious_connection",
                    severity=scoring["severity"],
                    data={
                        "remote_ip": remote_ip,
                        "remote_port": remote_port,
                        "local_port": local_port,
                        "pid": pid,
                        "process": proc_name,
                        "reason": f"Port {remote_port} is associated with malware/RAT activity",
                        "risk_score": scoring["score"],
                        "ai_analyze": True,
                    }
                ))

            # Alert on unexpected sensitive local port exposure
            if local_port in SENSITIVE_LOCAL_PORTS:
                await event_bus.publish(Event(
                    source="net_scanner",
                    event_type="sensitive_port_connection",
                    severity="medium",
                    data={
                        "local_port": local_port,
                        "remote_ip": remote_ip,
                        "pid": pid,
                        "process": proc_name,
                    }
                ))

        # Cleanup stale connections
        self._known_connections &= current_keys

    async def _check_listening_ports(self):
        """Emit listening port inventory every cycle."""
        try:
            connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied:
            return

        listening = []
        for conn in connections:
            if conn.status == "LISTEN":
                listening.append({
                    "local_ip": conn.laddr.ip if conn.laddr else "",
                    "local_port": conn.laddr.port if conn.laddr else 0,
                    "pid": conn.pid,
                })

        await event_bus.publish(Event(
            source="net_scanner",
            event_type="listening_ports_snapshot",
            severity="info",
            data={
                "ports": listening,
                "count": len(listening),
                "timestamp": datetime.utcnow().isoformat(),
            }
        ))

    async def run_nmap_scan(self, target: str = "127.0.0.1") -> dict:
        """On-demand nmap scan (triggered by user from UI)."""
        try:
            result = subprocess.run(
                ["nmap", "-sV", "--open", "-T3", target],
                capture_output=True, text=True, timeout=120
            )
            return {"target": target, "output": result.stdout, "error": result.stderr}
        except FileNotFoundError:
            return {"error": "nmap not found. Install with: sudo apt install nmap"}
        except subprocess.TimeoutExpired:
            return {"error": "Scan timed out"}
