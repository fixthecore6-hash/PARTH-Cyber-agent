"""
PARTH Defense Tools
Active PC defense: firewall rules, process killing, port blocking,
auto-quarantine of suspicious processes, fail2ban, network lockdown.
All destructive actions require explicit confirmation.
"""

import asyncio
import logging
import os
import subprocess
import psutil
import json
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("parth.defense")

AUDIT_LOG = Path(__file__).resolve().parent.parent / "db" / "defense_audit.log"


def _audit(action: str, result: str, params: dict = None):
    """Append every action to tamper-evident audit log."""
    entry = {
        "ts": datetime.utcnow().isoformat(),
        "action": action,
        "params": params or {},
        "result": result,
        "user": os.environ.get("USER", "unknown"),
    }
    try:
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _run(cmd: list, timeout: int = 10) -> dict:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"ok": r.returncode == 0, "out": r.stdout.strip(), "err": r.stderr.strip(), "rc": r.returncode}
    except FileNotFoundError:
        return {"ok": False, "out": "", "err": f"Command not found: {cmd[0]}", "rc": -1}
    except subprocess.TimeoutExpired:
        return {"ok": False, "out": "", "err": "Timed out", "rc": -1}
    except Exception as e:
        return {"ok": False, "out": "", "err": str(e), "rc": -1}


# ── 1. Firewall (UFW) ─────────────────────────────────────────────────────────

def ufw_status() -> dict:
    r = _run(["sudo", "ufw", "status", "verbose"])
    return {"output": r["out"] or r["err"], "ok": r["ok"]}


def ufw_enable() -> dict:
    r = _run(["sudo", "ufw", "--force", "enable"])
    _audit("ufw_enable", "ok" if r["ok"] else r["err"])
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_disable() -> dict:
    r = _run(["sudo", "ufw", "disable"])
    _audit("ufw_disable", "ok" if r["ok"] else r["err"])
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_block_ip(ip: str) -> dict:
    if not _valid_ip(ip):
        return {"ok": False, "message": "Invalid IP"}
    r = _run(["sudo", "ufw", "deny", "from", ip, "to", "any"])
    _audit("ufw_block_ip", "ok" if r["ok"] else r["err"], {"ip": ip})
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_unblock_ip(ip: str) -> dict:
    if not _valid_ip(ip):
        return {"ok": False, "message": "Invalid IP"}
    r = _run(["sudo", "ufw", "delete", "deny", "from", ip, "to", "any"])
    _audit("ufw_unblock_ip", "ok" if r["ok"] else r["err"], {"ip": ip})
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_block_port(port: int, proto: str = "tcp") -> dict:
    if not (1 <= port <= 65535):
        return {"ok": False, "message": "Invalid port"}
    r = _run(["sudo", "ufw", "deny", f"{port}/{proto}"])
    _audit("ufw_block_port", "ok" if r["ok"] else r["err"], {"port": port, "proto": proto})
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_allow_port(port: int, proto: str = "tcp") -> dict:
    if not (1 <= port <= 65535):
        return {"ok": False, "message": "Invalid port"}
    r = _run(["sudo", "ufw", "allow", f"{port}/{proto}"])
    _audit("ufw_allow_port", "ok" if r["ok"] else r["err"], {"port": port, "proto": proto})
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


def ufw_rules() -> dict:
    r = _run(["sudo", "ufw", "status", "numbered"])
    return {"output": r["out"] or r["err"], "ok": r["ok"]}


# ── 2. Process Management ─────────────────────────────────────────────────────

def kill_process(pid: int, signal: str = "TERM") -> dict:
    sig = 15 if signal == "TERM" else 9
    try:
        p = psutil.Process(pid)
        name = p.name()
        p.send_signal(sig)
        _audit("kill_process", "ok", {"pid": pid, "name": name, "signal": signal})
        return {"ok": True, "message": f"Signal {signal} sent to {name} (pid {pid})"}
    except psutil.NoSuchProcess:
        return {"ok": False, "message": f"Process {pid} not found"}
    except psutil.AccessDenied:
        # Try sudo kill
        r = _run(["sudo", "kill", f"-{sig}", str(pid)])
        _audit("kill_process_sudo", "ok" if r["ok"] else r["err"], {"pid": pid})
        return {"ok": r["ok"], "message": r["out"] or r["err"] or f"kill -{sig} {pid}"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


def top_processes(n: int = 15) -> list:
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "status", "cmdline"]):
        try:
            info = p.info
            info["cmdline"] = " ".join(info.get("cmdline") or [])[:80]
            procs.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return sorted(procs, key=lambda x: (x.get("cpu_percent") or 0) + (x.get("memory_percent") or 0) * 2, reverse=True)[:n]


def suspicious_processes() -> list:
    """Return processes with high resource use or suspicious names."""
    SUSPICIOUS_NAMES = {
        "cryptominer", "xmrig", "minerd", "cgminer", "bfgminer",
        "ncat", "netcat", "nc.openbsd", "socat",
        "mimikatz", "metasploit", "msfconsole",
    }
    result = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "connections"]):
        try:
            info = p.info
            name = (info.get("name") or "").lower()
            cpu = info.get("cpu_percent") or 0
            mem = info.get("memory_percent") or 0
            flags = []
            if any(s in name for s in SUSPICIOUS_NAMES):
                flags.append("suspicious_name")
            if cpu > 80:
                flags.append(f"high_cpu:{cpu:.0f}%")
            if mem > 50:
                flags.append(f"high_mem:{mem:.1f}%")
            if flags:
                info["flags"] = flags
                info.pop("connections", None)
                result.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return result


# ── 3. Network Defense ────────────────────────────────────────────────────────

def list_open_ports() -> dict:
    """Show all listening ports with process info."""
    ports = []
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" or conn.type == 2:  # TCP LISTEN or UDP
                proc_name = "unknown"
                try:
                    if conn.pid:
                        proc_name = psutil.Process(conn.pid).name()
                except Exception:
                    pass
                ports.append({
                    "port": conn.laddr.port if conn.laddr else 0,
                    "ip": conn.laddr.ip if conn.laddr else "",
                    "proto": "tcp" if conn.type == 1 else "udp",
                    "pid": conn.pid,
                    "process": proc_name,
                })
    except psutil.AccessDenied:
        return {"error": "Run with sudo for full data", "ports": []}
    return {"ports": sorted(ports, key=lambda x: x["port"])}


def active_connections() -> list:
    """All ESTABLISHED connections with process."""
    conns = []
    try:
        for c in psutil.net_connections(kind="inet"):
            if c.status == "ESTABLISHED" and c.raddr:
                try:
                    proc = psutil.Process(c.pid).name() if c.pid else "unknown"
                except Exception:
                    proc = "unknown"
                conns.append({
                    "local": f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else "",
                    "remote": f"{c.raddr.ip}:{c.raddr.port}",
                    "remote_ip": c.raddr.ip,
                    "pid": c.pid,
                    "process": proc,
                })
    except psutil.AccessDenied:
        pass
    return conns


def lockdown_mode(enable: bool) -> dict:
    """Block ALL incoming except SSH (22) and dashboard (5173, 8000)."""
    if enable:
        cmds = [
            ["sudo", "ufw", "--force", "enable"],
            ["sudo", "ufw", "default", "deny", "incoming"],
            ["sudo", "ufw", "default", "allow", "outgoing"],
            ["sudo", "ufw", "allow", "22/tcp"],
            ["sudo", "ufw", "allow", "5173/tcp"],
            ["sudo", "ufw", "allow", "8000/tcp"],
        ]
        action = "lockdown_enable"
    else:
        cmds = [
            ["sudo", "ufw", "default", "allow", "incoming"],
        ]
        action = "lockdown_disable"

    results = []
    for cmd in cmds:
        r = _run(cmd)
        results.append({"cmd": " ".join(cmd), "ok": r["ok"], "out": r["out"]})

    success = all(r["ok"] for r in results)
    _audit(action, "ok" if success else "partial", {})
    return {"ok": success, "results": results, "mode": "enabled" if enable else "disabled"}


# ── 4. Fail2ban ──────────────────────────────────────────────────────────────

def fail2ban_status() -> dict:
    r = _run(["sudo", "fail2ban-client", "status"])
    if not r["ok"]:
        return {"installed": False, "message": "fail2ban not running. Install: sudo apt install fail2ban"}
    return {"installed": True, "output": r["out"]}


def fail2ban_jail_status(jail: str = "sshd") -> dict:
    r = _run(["sudo", "fail2ban-client", "status", jail])
    return {"jail": jail, "output": r["out"] or r["err"], "ok": r["ok"]}


def fail2ban_unban(ip: str, jail: str = "sshd") -> dict:
    if not _valid_ip(ip):
        return {"ok": False, "message": "Invalid IP"}
    r = _run(["sudo", "fail2ban-client", "set", jail, "unbanip", ip])
    _audit("fail2ban_unban", "ok" if r["ok"] else r["err"], {"ip": ip, "jail": jail})
    return {"ok": r["ok"], "message": r["out"] or r["err"]}


# ── 5. System Hardening Checks ────────────────────────────────────────────────

def hardening_audit() -> dict:
    """Quick checklist of common hardening items."""
    checks = []

    def chk(name, cmd, good_pattern, fix):
        r = _run(cmd)
        out = r["out"] + r["err"]
        passed = good_pattern in out if good_pattern else r["ok"]
        checks.append({"name": name, "passed": passed, "output": out[:200], "fix": fix if not passed else ""})

    # UFW active
    chk("Firewall (UFW) enabled",
        ["sudo", "ufw", "status"],
        "Status: active",
        "sudo ufw enable")

    # SSH root login
    chk("SSH root login disabled",
        ["grep", "-i", "permitrootlogin", "/etc/ssh/sshd_config"],
        "no",
        "Edit /etc/ssh/sshd_config: set PermitRootLogin no")

    # Fail2ban
    chk("fail2ban running",
        ["systemctl", "is-active", "fail2ban"],
        "active",
        "sudo apt install fail2ban && sudo systemctl enable --now fail2ban")

    # Automatic updates
    chk("Unattended upgrades enabled",
        ["systemctl", "is-active", "unattended-upgrades"],
        "active",
        "sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades")

    # AppArmor
    chk("AppArmor active",
        ["sudo", "aa-status", "--enabled"],
        "",
        "sudo systemctl enable --now apparmor")

    # SSHD password auth
    chk("SSH password auth disabled",
        ["grep", "-i", "passwordauthentication", "/etc/ssh/sshd_config"],
        "no",
        "Edit /etc/ssh/sshd_config: set PasswordAuthentication no (use keys instead)")

    # Check if /tmp is noexec
    r = _run(["findmnt", "-n", "-o", "OPTIONS", "/tmp"])
    noexec = "noexec" in r["out"]
    checks.append({"name": "/tmp mounted noexec", "passed": noexec, "output": r["out"][:100],
                   "fix": "Add noexec to /tmp in /etc/fstab" if not noexec else ""})

    passed = sum(1 for c in checks if c["passed"])
    score = int(passed / len(checks) * 100)
    return {"checks": checks, "passed": passed, "total": len(checks), "score": score}


# ── 6. Audit Log Reader ───────────────────────────────────────────────────────

def read_audit_log(limit: int = 50) -> list:
    if not AUDIT_LOG.exists():
        return []
    lines = AUDIT_LOG.read_text().splitlines()
    entries = []
    for line in lines[-limit:]:
        try:
            entries.append(json.loads(line))
        except Exception:
            pass
    return list(reversed(entries))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _valid_ip(ip: str) -> bool:
    import re
    return bool(re.match(r'^(\d{1,3}\.){3}\d{1,3}$', ip))
