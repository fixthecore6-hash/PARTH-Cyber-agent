"""
PARTH Defense Tools
Cross-platform active defense: firewall rules, process management,
startup programs, open ports, network kill-switch, quarantine.
"""

import asyncio, subprocess, sys, os, json, psutil, socket
from datetime import datetime
from pathlib import Path

IS_WIN  = sys.platform == "win32"
IS_MAC  = sys.platform == "darwin"
IS_LIN  = sys.platform.startswith("linux")


def _run(cmd: list | str, shell=False, timeout=15) -> dict:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=timeout, shell=shell)
        return {"ok": r.returncode == 0, "out": r.stdout.strip(),
                "err": r.stderr.strip(), "rc": r.returncode}
    except FileNotFoundError as e:
        return {"ok": False, "out": "", "err": f"Command not found: {e}", "rc": -1}
    except subprocess.TimeoutExpired:
        return {"ok": False, "out": "", "err": "Timeout", "rc": -1}
    except Exception as e:
        return {"ok": False, "out": "", "err": str(e), "rc": -1}


# ── 1. Kill Process ────────────────────────────────────────────────────────────

async def kill_process(pid: int, force: bool = False) -> dict:
    try:
        p = psutil.Process(pid)
        name = p.name()
        if force:
            p.kill()
        else:
            p.terminate()
        return {"ok": True, "message": f"{'Killed' if force else 'Terminated'} {name} (PID {pid})"}
    except psutil.NoSuchProcess:
        return {"ok": False, "message": f"PID {pid} not found"}
    except psutil.AccessDenied:
        return {"ok": False, "message": f"Access denied — try running PARTH with admin/sudo privileges"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── 2. Block IP (Firewall) ─────────────────────────────────────────────────────

async def block_ip(ip: str, direction: str = "both") -> dict:
    """Block an IP address using platform firewall."""
    # Validate IP
    try:
        socket.inet_aton(ip)
    except socket.error:
        return {"ok": False, "message": f"Invalid IP: {ip}"}

    if IS_LIN:
        cmds = []
        if direction in ("in", "both"):
            cmds.append(["sudo", "ufw", "deny", "from", ip, "to", "any"])
        if direction in ("out", "both"):
            cmds.append(["sudo", "ufw", "deny", "out", "to", ip])
        results = [_run(c) for c in cmds]
        ok = all(r["ok"] for r in results)
        return {"ok": ok, "message": f"Blocked {ip} ({'both directions' if direction=='both' else direction})" if ok else results[0]["err"]}

    elif IS_WIN:
        cmds = []
        if direction in ("in", "both"):
            cmds.append(f'netsh advfirewall firewall add rule name="PARTH_BLOCK_{ip}" dir=in action=block remoteip={ip}')
        if direction in ("out", "both"):
            cmds.append(f'netsh advfirewall firewall add rule name="PARTH_BLOCK_{ip}_OUT" dir=out action=block remoteip={ip}')
        results = [_run(c, shell=True) for c in cmds]
        ok = all(r["ok"] for r in results)
        return {"ok": ok, "message": f"Blocked {ip}" if ok else results[0]["err"]}

    elif IS_MAC:
        r = _run(["sudo", "pfctl", "-t", "parth_blocked", "-T", "add", ip])
        return {"ok": r["ok"], "message": f"Blocked {ip} via pf" if r["ok"] else r["err"]}

    return {"ok": False, "message": "Unsupported platform"}


async def unblock_ip(ip: str) -> dict:
    if IS_LIN:
        r1 = _run(["sudo", "ufw", "delete", "deny", "from", ip, "to", "any"])
        r2 = _run(["sudo", "ufw", "delete", "deny", "out", "to", ip])
        return {"ok": True, "message": f"Unblocked {ip}"}
    elif IS_WIN:
        r1 = _run(f'netsh advfirewall firewall delete rule name="PARTH_BLOCK_{ip}"', shell=True)
        r2 = _run(f'netsh advfirewall firewall delete rule name="PARTH_BLOCK_{ip}_OUT"', shell=True)
        return {"ok": True, "message": f"Unblocked {ip}"}
    elif IS_MAC:
        r = _run(["sudo", "pfctl", "-t", "parth_blocked", "-T", "delete", ip])
        return {"ok": r["ok"], "message": f"Unblocked {ip}" if r["ok"] else r["err"]}
    return {"ok": False, "message": "Unsupported platform"}


async def list_firewall_rules() -> dict:
    if IS_LIN:
        r = _run(["sudo", "ufw", "status", "numbered"])
        return {"ok": r["ok"], "rules": r["out"], "platform": "ufw"}
    elif IS_WIN:
        r = _run('netsh advfirewall firewall show rule name=all dir=in', shell=True)
        # Filter to PARTH rules only
        lines = [l for l in r["out"].splitlines() if "PARTH" in l or "Rule Name" in l]
        return {"ok": r["ok"], "rules": "\n".join(lines), "platform": "Windows Firewall"}
    elif IS_MAC:
        r = _run(["sudo", "pfctl", "-t", "parth_blocked", "-T", "show"])
        return {"ok": r["ok"], "rules": r["out"], "platform": "pf"}
    return {"ok": False, "rules": "", "platform": "unknown"}


# ── 3. Port Closer ────────────────────────────────────────────────────────────

async def close_port(port: int, protocol: str = "tcp") -> dict:
    """Block a port using firewall."""
    if IS_LIN:
        r = _run(["sudo", "ufw", "deny", f"{port}/{protocol}"])
        return {"ok": r["ok"], "message": f"Blocked port {port}/{protocol}" if r["ok"] else r["err"]}
    elif IS_WIN:
        r = _run(f'netsh advfirewall firewall add rule name="PARTH_PORT_{port}" dir=in action=block protocol={protocol} localport={port}', shell=True)
        return {"ok": r["ok"], "message": f"Blocked port {port}" if r["ok"] else r["err"]}
    elif IS_MAC:
        r = _run(["sudo", "pfctl", "-f", "/etc/pf.conf"])
        return {"ok": False, "message": "Add 'block in proto tcp from any to any port {port}' to /etc/pf.conf"}
    return {"ok": False, "message": "Unsupported"}


async def list_open_ports() -> dict:
    """List all listening ports with process info."""
    ports = []
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN" or (conn.type == 2 and conn.laddr):  # TCP LISTEN or UDP
                proc_name = "unknown"
                try:
                    if conn.pid:
                        proc_name = psutil.Process(conn.pid).name()
                except Exception:
                    pass
                ports.append({
                    "port": conn.laddr.port,
                    "ip":   conn.laddr.ip,
                    "pid":  conn.pid,
                    "process": proc_name,
                    "type": "TCP" if conn.type == 1 else "UDP",
                    "status": conn.status,
                })
    except psutil.AccessDenied:
        return {"ok": False, "ports": [], "error": "Run with sudo/admin for full port list"}
    return {"ok": True, "ports": sorted(ports, key=lambda x: x["port"])}


# ── 4. Startup Programs Manager ───────────────────────────────────────────────

async def list_startup_programs() -> dict:
    items = []

    if IS_WIN:
        import winreg
        keys = [
            (winreg.HKEY_CURRENT_USER,  r"Software\Microsoft\Windows\CurrentVersion\Run"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run"),
        ]
        for hive, path in keys:
            try:
                key = winreg.OpenKey(hive, path)
                i = 0
                while True:
                    try:
                        name, val, _ = winreg.EnumValue(key, i)
                        items.append({"name": name, "command": val,
                                      "location": "HKCU" if hive == winreg.HKEY_CURRENT_USER else "HKLM"})
                        i += 1
                    except OSError:
                        break
            except Exception:
                pass

    elif IS_LIN:
        # systemd user services
        r = _run(["systemctl", "--user", "list-units", "--type=service", "--state=enabled", "--no-legend"])
        if r["ok"]:
            for line in r["out"].splitlines():
                parts = line.split()
                if parts:
                    items.append({"name": parts[0], "command": "", "location": "systemd-user"})
        # autostart desktop entries
        autostart = Path.home() / ".config" / "autostart"
        if autostart.exists():
            for f in autostart.glob("*.desktop"):
                try:
                    content = f.read_text()
                    name = next((l.split("=",1)[1] for l in content.splitlines() if l.startswith("Name=")), f.stem)
                    cmd  = next((l.split("=",1)[1] for l in content.splitlines() if l.startswith("Exec=")), "")
                    items.append({"name": name, "command": cmd, "location": "autostart"})
                except Exception:
                    pass

    elif IS_MAC:
        r = _run(["launchctl", "list"])
        if r["ok"]:
            for line in r["out"].splitlines()[1:]:
                parts = line.split("\t")
                if len(parts) >= 3:
                    items.append({"name": parts[2], "command": "", "location": "launchd"})

    return {"ok": True, "items": items, "platform": sys.platform}


async def disable_startup(name: str, location: str = "") -> dict:
    if IS_WIN:
        import winreg
        hive = winreg.HKEY_CURRENT_USER if location == "HKCU" else winreg.HKEY_LOCAL_MACHINE
        try:
            key = winreg.OpenKey(hive, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, name)
            return {"ok": True, "message": f"Removed {name} from startup"}
        except Exception as e:
            return {"ok": False, "message": str(e)}
    elif IS_LIN:
        autostart_file = Path.home() / ".config" / "autostart" / f"{name}.desktop"
        if autostart_file.exists():
            autostart_file.unlink()
            return {"ok": True, "message": f"Removed {name} from autostart"}
        r = _run(["systemctl", "--user", "disable", name])
        return {"ok": r["ok"], "message": f"Disabled {name}" if r["ok"] else r["err"]}
    return {"ok": False, "message": "Unsupported"}


# ── 5. Network Kill-Switch ────────────────────────────────────────────────────

async def network_killswitch(enable: bool) -> dict:
    """Block ALL outbound traffic except to localhost."""
    if IS_LIN:
        if enable:
            cmds = [
                ["sudo", "ufw", "--force", "enable"],
                ["sudo", "ufw", "default", "deny", "outgoing"],
                ["sudo", "ufw", "allow", "out", "to", "127.0.0.1"],
                ["sudo", "ufw", "allow", "out", "to", "::1"],
            ]
            for c in cmds: _run(c)
            return {"ok": True, "message": "🚨 Network kill-switch ENABLED — outbound traffic blocked"}
        else:
            _run(["sudo", "ufw", "default", "allow", "outgoing"])
            return {"ok": True, "message": "✓ Network kill-switch DISABLED — outbound traffic restored"}
    elif IS_WIN:
        if enable:
            r = _run('netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound', shell=True)
        else:
            r = _run('netsh advfirewall set allprofiles firewallpolicy blockinbound,allowoutbound', shell=True)
        return {"ok": r["ok"], "message": ("Kill-switch enabled" if enable else "Kill-switch disabled") if r["ok"] else r["err"]}
    return {"ok": False, "message": "Unsupported platform"}


# ── 6. Process Quarantine (suspend) ──────────────────────────────────────────

async def suspend_process(pid: int) -> dict:
    """Suspend (pause) a process without killing it."""
    try:
        p = psutil.Process(pid)
        p.suspend()
        return {"ok": True, "message": f"Suspended {p.name()} (PID {pid}) — resume with resume_process"}
    except psutil.AccessDenied:
        return {"ok": False, "message": "Access denied — need sudo/admin"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


async def resume_process(pid: int) -> dict:
    try:
        p = psutil.Process(pid)
        p.resume()
        return {"ok": True, "message": f"Resumed {p.name()} (PID {pid})"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── 7. System Hardening Checker ───────────────────────────────────────────────

async def hardening_check() -> dict:
    checks = []

    if IS_LIN:
        def chk(name, cmd, pass_if, fix):
            r = _run(cmd if isinstance(cmd, list) else cmd.split())
            passed = pass_if(r["out"] + r["err"])
            checks.append({"name": name, "passed": passed,
                            "status": "✓" if passed else "✗", "fix": fix if not passed else ""})

        chk("SSH root login disabled",
            "grep -i PermitRootLogin /etc/ssh/sshd_config",
            lambda o: "no" in o.lower(),
            "Edit /etc/ssh/sshd_config: set PermitRootLogin no")

        chk("UFW firewall enabled",
            ["sudo", "ufw", "status"],
            lambda o: "active" in o.lower(),
            "Run: sudo ufw enable")

        chk("Automatic updates enabled",
            ["which", "unattended-upgrades"],
            lambda o: len(o) > 0,
            "Run: sudo apt install unattended-upgrades && sudo dpkg-reconfigure unattended-upgrades")

        chk("No empty passwords",
            "awk -F: '($2==\"\"){print $1}' /etc/shadow",
            lambda o: len(o.strip()) == 0,
            "Lock accounts with empty passwords: sudo passwd -l <username>")

        chk("Fail2ban installed",
            ["which", "fail2ban-server"],
            lambda o: len(o) > 0,
            "Run: sudo apt install fail2ban && sudo systemctl enable fail2ban")

        chk("AppArmor enabled",
            ["sudo", "aa-status"],
            lambda o: "profiles are in enforce mode" in o.lower() or "enabled" in o.lower(),
            "Run: sudo systemctl enable apparmor && sudo systemctl start apparmor")

        chk("No world-writable files in /etc",
            ["find", "/etc", "-perm", "-0002", "-type", "f"],
            lambda o: len(o.strip()) == 0,
            "Fix with: sudo chmod o-w <file>")

    elif IS_WIN:
        chk_win = lambda name, cmd, pass_if, fix: checks.append({
            "name": name,
            "passed": pass_if(_run(cmd, shell=True)["out"]),
            "status": "?", "fix": fix
        })
        r = _run('sc query WinDefend', shell=True)
        checks.append({"name": "Windows Defender running",
                        "passed": "RUNNING" in r["out"],
                        "status": "✓" if "RUNNING" in r["out"] else "✗",
                        "fix": "Enable Windows Defender in Security Center"})
        r2 = _run('netsh advfirewall show allprofiles', shell=True)
        checks.append({"name": "Windows Firewall enabled",
                        "passed": "ON" in r2["out"],
                        "status": "✓" if "ON" in r2["out"] else "✗",
                        "fix": "Enable in Control Panel > Windows Firewall"})

    elif IS_MAC:
        r = _run(["sudo", "spctl", "--status"])
        checks.append({"name": "Gatekeeper enabled", "passed": "enabled" in r["out"].lower(),
                        "status": "✓" if "enabled" in r["out"].lower() else "✗",
                        "fix": "Run: sudo spctl --master-enable"})
        r2 = _run(["defaults", "read", "/Library/Preferences/com.apple.alf", "globalstate"])
        checks.append({"name": "macOS Firewall enabled", "passed": r2["out"].strip() in ("1","2"),
                        "status": "✓" if r2["out"].strip() in ("1","2") else "✗",
                        "fix": "Enable in System Preferences > Security > Firewall"})

    passed = sum(1 for c in checks if c["passed"])
    score  = round(passed / len(checks) * 100) if checks else 0
    return {"ok": True, "checks": checks, "score": score,
            "passed": passed, "total": len(checks), "platform": sys.platform}
