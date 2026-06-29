"""
PARTH Risk Scorer
CVSS-inspired local risk scoring engine.
"""

from typing import Dict, Any

SEVERITY_WEIGHTS = {
    "critical": 10.0,
    "high": 7.5,
    "medium": 5.0,
    "low": 2.5,
    "info": 0.5,
}

EVENT_TYPE_BASE_SCORES: Dict[str, float] = {
    "malware_behavior":        9.5,
    "privilege_escalation":    9.0,
    "rootkit_indicator":       9.0,
    "ransomware_indicator":    9.5,
    "unauthorized_root_proc":  8.5,
    "port_scan_detected":      7.0,
    "suspicious_connection":   6.5,
    "file_integrity_change":   6.0,
    "unknown_process":         5.5,
    "high_cpu_spike":          4.0,
    "high_memory_usage":       3.5,
    "large_file_transfer":     5.0,
    "failed_login_burst":      7.5,
    "new_suid_binary":         8.0,
    "suspicious_cron":         7.0,
    "dns_anomaly":             6.5,
    "dga_domain":              7.5,
    "dns_beacon":              8.0,
    "dns_tunnel":              8.5,
    "log_cleared":             8.0,
    "hidden_process":          9.5,
    "ld_preload_set":          9.5,
    "new_kernel_module":       7.0,
    "usb_device_connected":    4.0,
    "high_gpu_utilization":    5.5,
    "default":                 3.0,
}


def score_event(event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    base = EVENT_TYPE_BASE_SCORES.get(event_type, EVENT_TYPE_BASE_SCORES["default"])

    # Modifiers
    modifiers = 0.0
    if data.get("is_root") or data.get("uid") == 0:
        modifiers += 1.5
    if data.get("network_activity"):
        modifiers += 0.5
    if data.get("repeated", False):
        modifiers += 1.0
    if data.get("known_bad_hash"):
        modifiers += 2.0

    final_score = min(base + modifiers, 10.0)

    if final_score >= 9.0:
        severity = "critical"
    elif final_score >= 7.0:
        severity = "high"
    elif final_score >= 4.0:
        severity = "medium"
    elif final_score >= 2.0:
        severity = "low"
    else:
        severity = "info"

    return {
        "score": round(final_score, 1),
        "severity": severity,
        "base_score": base,
        "modifiers": round(modifiers, 1),
    }
