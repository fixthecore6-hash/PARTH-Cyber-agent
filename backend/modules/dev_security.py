"""
PARTH Developer Security Tools
Integrates: OWASP ZAP, Nuclei, subfinder/httpx, header/SSL analysis,
Trivy dependency scanner, API security tester.
"""

import asyncio
import logging
import subprocess
import json
import os
import re
import ssl
import socket
import aiohttp
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("parth.devtools")

BASE_DIR = Path(__file__).resolve().parent.parent
REPORTS_DIR = BASE_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL = os.environ.get("PARTH_MODEL", "mistral")


# ─── Helpers ────────────────────────────────────────────────────────────────

def _tool_exists(name: str) -> bool:
    return subprocess.run(["which", name], capture_output=True).returncode == 0


async def _ai_explain(prompt: str, max_tokens: int = 400) -> str:
    try:
        payload = {
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": max_tokens},
        }
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as s:
            async with s.post(OLLAMA_URL, json=payload) as r:
                d = await r.json()
                return d.get("response", "AI unavailable").strip()
    except Exception as e:
        return f"AI unavailable: {e}"


def _run(cmd: list, timeout: int = 300, cwd=None) -> dict:
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=cwd or str(BASE_DIR)
        )
        return {"stdout": r.stdout, "stderr": r.stderr, "returncode": r.returncode}
    except subprocess.TimeoutExpired:
        return {"error": f"Timed out after {timeout}s", "returncode": -1}
    except FileNotFoundError:
        return {"error": f"Tool not found: {cmd[0]}", "returncode": -1}
    except Exception as e:
        return {"error": str(e), "returncode": -1}


# ─── 1. OWASP ZAP ───────────────────────────────────────────────────────────

ZAP_PORT = 8090
ZAP_API_KEY = os.environ.get("PARTH_ZAP_API_KEY", "parth-zap-key")


async def zap_start() -> dict:
    """Start ZAP daemon."""
    if not _tool_exists("zap.sh") and not _tool_exists("zaproxy"):
        return {"error": "ZAP not installed. Install: sudo snap install zaproxy --classic  OR  sudo apt install zaproxy"}

    zap_bin = "zaproxy" if _tool_exists("zaproxy") else "zap.sh"
    proc = subprocess.Popen(
        [zap_bin, "-daemon", "-port", str(ZAP_PORT),
         "-config", f"api.key={ZAP_API_KEY}",
         "-config", "api.addrs.addr.name=.*",
         "-config", "api.addrs.addr.regex=true"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    await asyncio.sleep(8)
    return {"status": "started", "pid": proc.pid, "port": ZAP_PORT}


async def zap_scan(target_url: str) -> dict:
    """Run ZAP spider + active scan, return findings."""
    base = f"http://127.0.0.1:{ZAP_PORT}"
    key = ZAP_API_KEY
    results = {"target": target_url, "alerts": [], "ai_summary": "", "timestamp": datetime.utcnow().isoformat()}

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as s:
            # Spider
            async with s.get(f"{base}/JSON/spider/action/scan/?url={target_url}&apikey={key}") as r:
                spider = await r.json()
                scan_id = spider.get("scan")

            # Wait for spider
            for _ in range(30):
                async with s.get(f"{base}/JSON/spider/view/status/?scanId={scan_id}&apikey={key}") as r:
                    st = await r.json()
                    if int(st.get("status", 0)) >= 100:
                        break
                await asyncio.sleep(3)

            # Active scan
            async with s.get(f"{base}/JSON/ascan/action/scan/?url={target_url}&apikey={key}") as r:
                ascan = await r.json()
                ascan_id = ascan.get("scan")

            # Wait for active scan (max 3min)
            for _ in range(60):
                async with s.get(f"{base}/JSON/ascan/view/status/?scanId={ascan_id}&apikey={key}") as r:
                    st = await r.json()
                    if int(st.get("status", 0)) >= 100:
                        break
                await asyncio.sleep(3)

            # Get alerts
            async with s.get(f"{base}/JSON/alert/view/alerts/?baseurl={target_url}&apikey={key}") as r:
                data = await r.json()
                alerts = data.get("alerts", [])

            # Classify and trim
            results["alerts"] = [{
                "name": a.get("alert"),
                "risk": a.get("risk"),
                "confidence": a.get("confidence"),
                "url": a.get("url"),
                "description": a.get("description", "")[:300],
                "solution": a.get("solution", "")[:300],
                "cweid": a.get("cweid"),
            } for a in alerts[:50]]

            results["counts"] = {
                "high": sum(1 for a in alerts if a.get("risk") == "High"),
                "medium": sum(1 for a in alerts if a.get("risk") == "Medium"),
                "low": sum(1 for a in alerts if a.get("risk") == "Low"),
                "info": sum(1 for a in alerts if a.get("risk") == "Informational"),
            }

    except Exception as e:
        results["error"] = str(e)
        return results

    # AI summary
    top = results["alerts"][:10]
    prompt = f"""You are a web security expert. Summarize these ZAP scan findings for {target_url} in developer-friendly language.
Findings: {json.dumps(top, indent=2)}
Total: {results.get('counts')}
Give: risk level, top 3 issues to fix immediately, and concrete code-level fixes. Max 200 words."""
    results["ai_summary"] = await _ai_explain(prompt, 400)

    # Save report
    report_path = REPORTS_DIR / f"zap_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    report_path.write_text(json.dumps(results, indent=2))
    results["report_path"] = str(report_path)

    return results


# ─── 2. Nuclei ──────────────────────────────────────────────────────────────

async def nuclei_scan(target: str, templates: list = None, severity: str = "medium,high,critical") -> dict:
    """Run nuclei scan with optional template selection."""
    if not _tool_exists("nuclei"):
        return {
            "error": "Nuclei not installed.",
            "install": "go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest  OR  sudo apt install nuclei"
        }

    cmd = ["nuclei", "-u", target, "-severity", severity,
           "-json", "-silent", "-timeout", "10", "-rate-limit", "50"]

    if templates:
        for t in templates:
            cmd += ["-t", t]

    result = _run(cmd, timeout=180)

    if result.get("error"):
        return result

    findings = []
    for line in result["stdout"].splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            findings.append(json.loads(line))
        except Exception:
            continue

    counts = {}
    for f in findings:
        sev = f.get("info", {}).get("severity", "unknown")
        counts[sev] = counts.get(sev, 0) + 1

    # AI explanation of findings
    ai_summary = ""
    if findings:
        top = findings[:15]
        prompt = f"""Nuclei vulnerability scan of {target} found these issues:
{json.dumps([{
    'template': f.get('template-id'),
    'name': f.get('info', {}).get('name'),
    'severity': f.get('info', {}).get('severity'),
    'matched': f.get('matched-at'),
    'description': f.get('info', {}).get('description', '')[:150],
} for f in top], indent=2)}
Explain the top 3 most critical findings and exact steps to fix them. Developer-friendly, max 200 words."""
        ai_summary = await _ai_explain(prompt, 400)

    report_path = REPORTS_DIR / f"nuclei_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    report_path.write_text(json.dumps({"target": target, "findings": findings}, indent=2))

    return {
        "target": target,
        "findings": findings[:50],
        "counts": counts,
        "total": len(findings),
        "ai_summary": ai_summary,
        "report_path": str(report_path),
        "timestamp": datetime.utcnow().isoformat(),
    }


async def nuclei_templates() -> dict:
    """List available nuclei template categories."""
    if not _tool_exists("nuclei"):
        return {"error": "Nuclei not installed"}
    r = _run(["nuclei", "-tl"], timeout=15)
    return {"templates": r.get("stdout", ""), "error": r.get("error")}


# ─── 3. Subdomain + Surface Discovery ───────────────────────────────────────

async def discover_surface(domain: str) -> dict:
    """Run subfinder + httpx to map attack surface."""
    results = {
        "domain": domain,
        "subdomains": [],
        "live_hosts": [],
        "technologies": [],
        "admin_panels": [],
        "timestamp": datetime.utcnow().isoformat(),
    }

    # subfinder
    if _tool_exists("subfinder"):
        r = _run(["subfinder", "-d", domain, "-silent", "-o", "/dev/stdout"], timeout=60)
        if not r.get("error"):
            results["subdomains"] = [s.strip() for s in r["stdout"].splitlines() if s.strip()]
    else:
        # Fallback: basic DNS brute with common prefixes
        prefixes = ["www", "api", "admin", "dev", "staging", "test", "mail",
                    "app", "portal", "dashboard", "beta", "cdn", "static"]
        live = []
        for p in prefixes:
            sub = f"{p}.{domain}"
            try:
                socket.setdefaulttimeout(2)
                socket.gethostbyname(sub)
                live.append(sub)
            except Exception:
                pass
        results["subdomains"] = live
        results["subfinder_note"] = "subfinder not installed — used DNS brute force fallback"

    # httpx for live hosts + tech detection
    if results["subdomains"] and _tool_exists("httpx"):
        hosts_input = "\n".join(results["subdomains"])
        proc = subprocess.Popen(
            ["httpx", "-silent", "-json", "-tech-detect", "-title", "-status-code"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        try:
            out, _ = proc.communicate(input=hosts_input.encode(), timeout=60)
            for line in out.decode().splitlines():
                try:
                    d = json.loads(line)
                    entry = {
                        "url": d.get("url"),
                        "status": d.get("status-code"),
                        "title": d.get("title"),
                        "tech": d.get("tech", []),
                    }
                    results["live_hosts"].append(entry)
                    results["technologies"].extend(d.get("tech", []))
                    # Detect admin panels
                    url = (d.get("url") or "").lower()
                    title = (d.get("title") or "").lower()
                    if any(k in url + title for k in ["admin", "phpmyadmin", "wp-admin", "panel", "dashboard", "console", "manager"]):
                        results["admin_panels"].append(d.get("url"))
                except Exception:
                    continue
        except subprocess.TimeoutExpired:
            proc.kill()
    elif results["subdomains"]:
        # Fallback: check each with requests-style
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as s:
            for sub in results["subdomains"][:20]:
                for scheme in ["https", "http"]:
                    try:
                        async with s.get(f"{scheme}://{sub}", allow_redirects=True, ssl=False) as r:
                            entry = {"url": f"{scheme}://{sub}", "status": r.status, "title": "", "tech": []}
                            results["live_hosts"].append(entry)
                            break
                    except Exception:
                        continue

    results["technologies"] = list(set(results["technologies"]))

    # AI risk summary
    prompt = f"""Attack surface discovery for {domain}:
Subdomains found: {len(results['subdomains'])}
Live hosts: {len(results['live_hosts'])}
Technologies: {results['technologies'][:20]}
Exposed admin panels: {results['admin_panels']}
Top hosts: {json.dumps(results['live_hosts'][:10], indent=2)}

Summarize the security risk of this attack surface. What are the most dangerous exposures? Max 150 words."""
    results["ai_summary"] = await _ai_explain(prompt, 300)

    return results


# ─── 4. Security Header + SSL Analyzer ──────────────────────────────────────

SECURITY_HEADERS = {
    "strict-transport-security": {"weight": 15, "fix": "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains"},
    "content-security-policy": {"weight": 20, "fix": "Add a CSP header to restrict script/style sources"},
    "x-frame-options": {"weight": 10, "fix": "Add: X-Frame-Options: DENY  (prevents clickjacking)"},
    "x-content-type-options": {"weight": 10, "fix": "Add: X-Content-Type-Options: nosniff"},
    "referrer-policy": {"weight": 5, "fix": "Add: Referrer-Policy: strict-origin-when-cross-origin"},
    "permissions-policy": {"weight": 5, "fix": "Add: Permissions-Policy: camera=(), microphone=(), geolocation=()"},
    "x-xss-protection": {"weight": 5, "fix": "Add: X-XSS-Protection: 1; mode=block"},
    "cross-origin-embedder-policy": {"weight": 5, "fix": "Add: Cross-Origin-Embedder-Policy: require-corp"},
    "cross-origin-opener-policy": {"weight": 5, "fix": "Add: Cross-Origin-Opener-Policy: same-origin"},
    "cross-origin-resource-policy": {"weight": 5, "fix": "Add: Cross-Origin-Resource-Policy: same-origin"},
}

DANGEROUS_HEADERS = [
    "server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"
]


async def analyze_headers_ssl(url: str) -> dict:
    """Analyze HTTP security headers and TLS config."""
    results = {
        "url": url,
        "headers": {},
        "missing_headers": [],
        "dangerous_headers": [],
        "ssl": {},
        "score": 100,
        "grade": "A+",
        "issues": [],
        "fixes": [],
        "timestamp": datetime.utcnow().isoformat(),
    }

    # Headers
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
            async with s.get(url, allow_redirects=True, ssl=False) as r:
                headers = {k.lower(): v for k, v in r.headers.items()}
                results["headers"] = dict(headers)
                results["status_code"] = r.status

        for h, meta in SECURITY_HEADERS.items():
            if h not in headers:
                results["missing_headers"].append(h)
                results["score"] -= meta["weight"]
                results["issues"].append(f"Missing: {h}")
                results["fixes"].append(meta["fix"])

        for h in DANGEROUS_HEADERS:
            if h in headers:
                results["dangerous_headers"].append({"header": h, "value": headers[h]})
                results["issues"].append(f"Exposing: {h}: {headers[h]}")
                results["score"] -= 5
                results["fixes"].append(f"Remove or mask the '{h}' header to hide server info")

        # CORS check
        cors = headers.get("access-control-allow-origin", "")
        if cors == "*":
            results["issues"].append("CORS wildcard (*) — any origin can make cross-origin requests")
            results["fixes"].append("Restrict CORS to specific origins instead of *")
            results["score"] -= 10

    except Exception as e:
        results["header_error"] = str(e)

    # SSL/TLS
    hostname = url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
    try:
        ctx = ssl.create_default_context()
        conn = ctx.wrap_socket(socket.socket(), server_hostname=hostname)
        conn.settimeout(10)
        conn.connect((hostname, 443))
        cert = conn.getpeercert()
        cipher = conn.cipher()
        proto = conn.version()
        conn.close()

        import time
        expire_ts = ssl.cert_time_to_seconds(cert.get("notAfter", ""))
        days_left = int((expire_ts - time.time()) / 86400)

        results["ssl"] = {
            "protocol": proto,
            "cipher_suite": cipher[0] if cipher else "",
            "cipher_bits": cipher[2] if cipher else 0,
            "cert_expires": cert.get("notAfter"),
            "days_until_expiry": days_left,
            "subject": dict(x[0] for x in cert.get("subject", [])),
            "issuer": dict(x[0] for x in cert.get("issuer", [])),
            "san": [v for _, v in cert.get("subjectAltName", [])],
        }

        if days_left < 30:
            results["issues"].append(f"SSL cert expires in {days_left} days!")
            results["score"] -= 20
        if proto in ("TLSv1", "TLSv1.1", "SSLv3"):
            results["issues"].append(f"Insecure TLS version: {proto}")
            results["fixes"].append(f"Upgrade to TLS 1.2+ and disable {proto}")
            results["score"] -= 15

    except Exception as e:
        results["ssl"]["error"] = str(e)

    results["score"] = max(0, results["score"])
    if results["score"] >= 90:
        results["grade"] = "A+"
    elif results["score"] >= 80:
        results["grade"] = "A"
    elif results["score"] >= 70:
        results["grade"] = "B"
    elif results["score"] >= 60:
        results["grade"] = "C"
    elif results["score"] >= 50:
        results["grade"] = "D"
    else:
        results["grade"] = "F"

    # AI fixes
    prompt = f"""Security header and SSL analysis for {url}:
Score: {results['score']}/100 (Grade: {results['grade']})
Missing headers: {results['missing_headers']}
Dangerous headers: {results['dangerous_headers']}
SSL: {json.dumps(results['ssl'], indent=2)}
Issues: {results['issues']}

Provide developer-friendly fixes with exact header values and nginx/Apache config snippets. Max 200 words."""
    results["ai_fixes"] = await _ai_explain(prompt, 400)

    return results


# ─── 5. Dependency Vulnerability Scanner (Trivy / OSV) ──────────────────────

async def scan_dependencies(path: str = ".", scanner: str = "auto") -> dict:
    """Scan project dependencies or Docker image for CVEs."""
    results = {
        "path": path,
        "vulnerabilities": [],
        "counts": {},
        "ai_summary": "",
        "timestamp": datetime.utcnow().isoformat(),
    }

    # Auto-detect best tool
    if scanner == "auto":
        if _tool_exists("trivy"):
            scanner = "trivy"
        elif _tool_exists("osv-scanner"):
            scanner = "osv"
        else:
            # Fallback: parse package files manually
            scanner = "manual"

    if scanner == "trivy":
        cmd = ["trivy", "fs", "--format", "json", "--quiet", path]
        r = _run(cmd, timeout=120)
        if r.get("error"):
            results["error"] = r["error"]
        else:
            try:
                data = json.loads(r["stdout"])
                for res in data.get("Results", []):
                    for v in res.get("Vulnerabilities", []):
                        results["vulnerabilities"].append({
                            "id": v.get("VulnerabilityID"),
                            "pkg": v.get("PkgName"),
                            "version": v.get("InstalledVersion"),
                            "fixed_in": v.get("FixedVersion"),
                            "severity": v.get("Severity"),
                            "title": v.get("Title", "")[:150],
                            "url": v.get("PrimaryURL"),
                        })
            except Exception as e:
                results["parse_error"] = str(e)

    elif scanner == "osv":
        cmd = ["osv-scanner", "--format", "json", path]
        r = _run(cmd, timeout=60)
        if not r.get("error"):
            try:
                data = json.loads(r["stdout"])
                for result in data.get("results", []):
                    for pkg in result.get("packages", []):
                        for vuln in pkg.get("vulnerabilities", []):
                            results["vulnerabilities"].append({
                                "id": vuln.get("id"),
                                "pkg": pkg.get("package", {}).get("name"),
                                "severity": "unknown",
                                "title": vuln.get("summary", "")[:150],
                                "url": f"https://osv.dev/vulnerability/{vuln.get('id')}",
                            })
            except Exception as e:
                results["parse_error"] = str(e)

    else:
        # Manual: check requirements.txt, package.json
        manual_vulns = []
        req_file = Path(path) / "requirements.txt"
        pkg_file = Path(path) / "package.json"
        if req_file.exists():
            results["note"] = f"Install trivy for full scanning. Found {req_file}. Run: pip-audit"
        if pkg_file.exists():
            results["note"] = (results.get("note", "") + f" Found {pkg_file}. Run: npm audit")
        results["error"] = "No scanner found. Install: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh"
        return results

    # Count by severity
    for v in results["vulnerabilities"]:
        sev = (v.get("severity") or "unknown").upper()
        results["counts"][sev] = results["counts"].get(sev, 0) + 1

    # AI summary
    if results["vulnerabilities"]:
        top = results["vulnerabilities"][:15]
        prompt = f"""Dependency vulnerability scan found {len(results['vulnerabilities'])} CVEs in {path}:
{json.dumps(top, indent=2)}
Counts by severity: {results['counts']}
Summarize the top risks and give exact package upgrade commands to fix the most critical ones. Max 200 words."""
        results["ai_summary"] = await _ai_explain(prompt, 400)

    return results


# ─── 6. API Security Tester ──────────────────────────────────────────────────

DANGEROUS_METHODS = ["TRACE", "TRACK", "DELETE", "PUT", "PATCH"]
DEBUG_PATHS = [
    "/_debug", "/debug", "/actuator", "/actuator/env", "/actuator/health",
    "/.env", "/config", "/api/debug", "/graphql", "/graphiql", "/api-docs",
    "/swagger", "/swagger-ui", "/swagger.json", "/openapi.json",
    "/api/v1/debug", "/phpinfo.php", "/server-status", "/metrics",
    "/__admin", "/admin", "/wp-admin", "/phpmyadmin",
]


async def test_api_security(base_url: str, endpoints: list = None) -> dict:
    """Test API for missing auth, dangerous methods, exposed debug endpoints, rate limiting."""
    results = {
        "base_url": base_url,
        "issues": [],
        "exposed_endpoints": [],
        "auth_issues": [],
        "method_issues": [],
        "rate_limit": {},
        "timestamp": datetime.utcnow().isoformat(),
    }

    base_url = base_url.rstrip("/")

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=10),
        connector=aiohttp.TCPConnector(ssl=False)
    ) as s:

        # 1. Exposed debug endpoints
        for path in DEBUG_PATHS:
            try:
                async with s.get(f"{base_url}{path}") as r:
                    if r.status not in (404, 410):
                        content = (await r.text())[:200]
                        results["exposed_endpoints"].append({
                            "path": path,
                            "status": r.status,
                            "preview": content,
                        })
                        results["issues"].append(f"Exposed: {path} (HTTP {r.status})")
            except Exception:
                continue

        # 2. Dangerous HTTP methods on each endpoint
        test_paths = (endpoints or [""]) + ["/api", "/api/v1", "/"]
        for path in test_paths[:10]:
            url = f"{base_url}{path}"
            for method in DANGEROUS_METHODS:
                try:
                    async with s.request(method, url) as r:
                        if r.status not in (404, 405, 501):
                            results["method_issues"].append({
                                "url": url, "method": method, "status": r.status,
                            })
                            results["issues"].append(f"Dangerous method allowed: {method} {url} → {r.status}")
                except Exception:
                    continue

        # 3. Rate limit detection
        try:
            async with s.get(f"{base_url}/") as r:
                rl_headers = {
                    k: v for k, v in r.headers.items()
                    if any(x in k.lower() for x in ["ratelimit", "rate-limit", "x-ratelimit", "retry-after"])
                }
            results["rate_limit"]["headers"] = rl_headers
            if not rl_headers:
                results["issues"].append("No rate-limit headers detected — API may be vulnerable to brute force")
                results["rate_limit"]["note"] = "Consider adding: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After"
        except Exception:
            pass

        # 4. Auth check on common API paths
        auth_paths = ["/api/users", "/api/admin", "/api/v1/users", "/api/me", "/api/profile"]
        for path in auth_paths:
            try:
                async with s.get(f"{base_url}{path}") as r:
                    if r.status == 200:
                        results["auth_issues"].append({
                            "path": path,
                            "status": r.status,
                            "issue": "Accessible without auth",
                        })
                        results["issues"].append(f"Unauthenticated access: {path}")
            except Exception:
                continue

        # 5. Check for security headers on API responses
        try:
            async with s.get(f"{base_url}/") as r:
                headers = {k.lower(): v for k, v in r.headers.items()}
                if "authorization" not in str(headers) and r.status == 200:
                    pass
                for dangerous in ["x-powered-by", "server"]:
                    if dangerous in headers:
                        results["issues"].append(f"Info leak header: {dangerous}: {headers[dangerous]}")
        except Exception:
            pass

    # AI summary
    if results["issues"]:
        prompt = f"""API security test of {base_url} found these issues:
{json.dumps(results['issues'], indent=2)}
Exposed endpoints: {results['exposed_endpoints']}
Auth issues: {results['auth_issues']}
Method issues: {results['method_issues']}

Give developer-friendly fixes with exact middleware/config examples (Express.js, FastAPI, Nginx). Max 200 words."""
        results["ai_summary"] = await _ai_explain(prompt, 400)

    results["total_issues"] = len(results["issues"])
    return results
