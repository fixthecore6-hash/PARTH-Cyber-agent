"""
PARTH Startup Manager — Windows Auto-Start via Registry & Startup Folder
created_by:pushkar | helped_by:claude | parth-host-defender
PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
"""

import os
import sys
import json
import platform
import pathlib
import logging
import subprocess
from datetime import datetime

logger = logging.getLogger("parth.startup")

# ── Config persistence (survives updates) ─────────────────────────────────────
_CONFIG_DIR  = pathlib.Path.home() / ".parth"
_CONFIG_FILE = _CONFIG_DIR / "startup_config.json"

_DEFAULTS = {
    "auto_start":      False,
    "launch_minimized": False,
    "startup_delay":   0,          # seconds: 0 | 15 | 30
    "startup_method":  "registry", # "registry" | "startup_folder" | "task_scheduler"
    "last_startup":    None,
    "enabled_at":      None,
}

def _load_config() -> dict:
    try:
        if _CONFIG_FILE.exists():
            data = json.loads(_CONFIG_FILE.read_text())
            return {**_DEFAULTS, **data}
    except Exception as e:
        logger.warning(f"Could not load startup config: {e}")
    return dict(_DEFAULTS)

def _save_config(cfg: dict):
    try:
        _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        _CONFIG_FILE.write_text(json.dumps(cfg, indent=2, default=str))
    except Exception as e:
        logger.error(f"Could not save startup config: {e}")
        raise RuntimeError(f"Failed to persist startup config: {e}")

# ── Platform helpers ──────────────────────────────────────────────────────────
def _is_windows() -> bool:
    return platform.system() == "Windows"

def _get_parth_exe() -> str:
    """Return the best path to launch PARTH (scripts/start_windows.bat or python main.py)."""
    # Walk up from this file to find the project root
    here = pathlib.Path(__file__).resolve()
    for parent in [here.parent.parent, here.parent.parent.parent]:
        bat = parent / "scripts" / "start_windows.bat"
        if bat.exists():
            return str(bat)
    # Fall back to python main.py
    main = pathlib.Path(__file__).resolve().parent.parent / "main.py"
    return f'"{sys.executable}" "{main}"'

def _registry_key_path() -> str:
    return r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

# ── Windows Registry ──────────────────────────────────────────────────────────
def _write_registry(exe_path: str, delay: int = 0, minimized: bool = False) -> dict:
    """Add PARTH to HKCU Run registry key."""
    try:
        import winreg  # type: ignore
        cmd = f'cmd /c "timeout /t {delay} /nobreak >nul && start "" {exe_path}"' if delay else exe_path
        if minimized:
            cmd = f'cmd /c "start /min {exe_path}"' if not delay else \
                  f'cmd /c "timeout /t {delay} /nobreak >nul && start /min {exe_path}"'
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _registry_key_path(),
                            0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, "PARTH_HostDefender", 0, winreg.REG_SZ, cmd)
        return {"ok": True, "method": "registry", "command": cmd}
    except Exception as e:
        return {"ok": False, "error": str(e), "method": "registry"}

def _remove_registry() -> dict:
    try:
        import winreg  # type: ignore
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _registry_key_path(),
                            0, winreg.KEY_SET_VALUE) as key:
            try:
                winreg.DeleteValue(key, "PARTH_HostDefender")
            except FileNotFoundError:
                pass
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def _read_registry() -> bool:
    """Check if PARTH is in Run key."""
    try:
        import winreg  # type: ignore
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _registry_key_path(),
                            0, winreg.KEY_READ) as key:
            winreg.QueryValueEx(key, "PARTH_HostDefender")
        return True
    except Exception:
        return False

# ── Windows Startup Folder ────────────────────────────────────────────────────
def _startup_folder_path() -> pathlib.Path:
    if _is_windows():
        appdata = os.environ.get("APPDATA", "")
        return pathlib.Path(appdata) / r"Microsoft\Windows\Start Menu\Programs\Startup"
    return pathlib.Path.home() / ".config/autostart"

def _write_startup_folder(exe_path: str) -> dict:
    try:
        folder = _startup_folder_path()
        folder.mkdir(parents=True, exist_ok=True)
        shortcut = folder / "PARTH_HostDefender.bat"
        shortcut.write_text(f'@echo off\nstart "" {exe_path}\n')
        return {"ok": True, "method": "startup_folder", "path": str(shortcut)}
    except Exception as e:
        return {"ok": False, "error": str(e), "method": "startup_folder"}

def _remove_startup_folder() -> dict:
    try:
        p = _startup_folder_path() / "PARTH_HostDefender.bat"
        if p.exists():
            p.unlink()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def _read_startup_folder() -> bool:
    return (_startup_folder_path() / "PARTH_HostDefender.bat").exists()

# ── Privilege check ───────────────────────────────────────────────────────────
def _has_admin() -> bool:
    if _is_windows():
        try:
            import ctypes  # type: ignore
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    return os.geteuid() == 0

# ── Public API ────────────────────────────────────────────────────────────────
def get_startup_status() -> dict:
    cfg = _load_config()
    is_win = _is_windows()

    # Verify actual OS state
    actual_enabled = False
    if is_win:
        if cfg.get("startup_method") == "registry":
            actual_enabled = _read_registry()
        else:
            actual_enabled = _read_startup_folder()
    else:
        # Linux: check systemd or startup folder
        actual_enabled = _read_startup_folder()

    # Record startup time on first run
    if not cfg.get("last_startup"):
        cfg["last_startup"] = datetime.now().isoformat()
        _save_config(cfg)

    return {
        "auto_start":       cfg.get("auto_start", False),
        "actual_enabled":   actual_enabled,
        "launch_minimized": cfg.get("launch_minimized", False),
        "startup_delay":    cfg.get("startup_delay", 0),
        "startup_method":   cfg.get("startup_method", "registry"),
        "last_startup":     cfg.get("last_startup"),
        "enabled_at":       cfg.get("enabled_at"),
        "platform":         platform.system(),
        "has_admin":        _has_admin(),
        "exe_path":         _get_parth_exe(),
        "is_windows":       is_win,
    }

def enable_startup(method: str = "registry", delay: int = 0, minimized: bool = False) -> dict:
    cfg = _load_config()
    exe = _get_parth_exe()

    if _is_windows():
        if method == "registry":
            result = _write_registry(exe, delay=delay, minimized=minimized)
        else:
            result = _write_startup_folder(exe)
    else:
        # Linux: write .desktop file or startup script
        result = _write_startup_folder(exe)

    if result.get("ok"):
        cfg.update({
            "auto_start":       True,
            "launch_minimized": minimized,
            "startup_delay":    delay,
            "startup_method":   method,
            "enabled_at":       datetime.now().isoformat(),
        })
        _save_config(cfg)

    return {**result, "config": cfg}

def disable_startup() -> dict:
    cfg = _load_config()
    method = cfg.get("startup_method", "registry")

    if _is_windows():
        r1 = _remove_registry()
        r2 = _remove_startup_folder()
        ok = r1.get("ok") or r2.get("ok")
    else:
        r1 = _remove_startup_folder()
        ok = r1.get("ok", False)

    if ok:
        cfg["auto_start"] = False
        cfg["enabled_at"] = None
        _save_config(cfg)

    return {"ok": ok, "config": cfg}

def update_startup_settings(settings: dict) -> dict:
    cfg = _load_config()
    allowed = {"launch_minimized", "startup_delay", "startup_method"}
    for k, v in settings.items():
        if k in allowed:
            cfg[k] = v
    _save_config(cfg)
    # If already enabled, reapply
    if cfg.get("auto_start"):
        enable_startup(
            method=cfg.get("startup_method", "registry"),
            delay=cfg.get("startup_delay", 0),
            minimized=cfg.get("launch_minimized", False),
        )
    return {"ok": True, "config": cfg}
