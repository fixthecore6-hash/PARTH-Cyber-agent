"""
PARTH DNS Monitor — low-resource version
Polls log file tail at reduced frequency, limits processing.
"""
import asyncio, logging, os, re, math
from collections import defaultdict
from datetime import datetime
from core.event_bus import event_bus, Event

logger = logging.getLogger("parth.dns_monitor")
POLL_INTERVAL = 15   # was 5
MAX_LINES_PER_CYCLE = 200  # limit lines processed per cycle

DNS_LOG_FILES = ["/var/log/syslog","/var/log/messages","/var/log/dnsmasq.log"]
SUSPICIOUS_TLD = re.compile(r"\.(xyz|tk|ml|ga|cf|gq|top|pw|click|work|loan|download|racing|win|stream)$", re.I)
DNS_QUERY_RE   = re.compile(r"query\[A+\]\s+(\S+)\s+from", re.I)

def _entropy(s):
    if not s: return 0.0
    freq = defaultdict(int)
    for c in s: freq[c]+=1
    n=len(s)
    return -sum((f/n)*math.log2(f/n) for f in freq.values())

_seen = set()
_counts = defaultdict(int)
BEACON_THRESH = 20  # raised from 15

class DNSMonitor:
    name = "dns_monitor"
    def __init__(self): self._running=False; self._positions={}

    def stop(self): self._running=False

    async def run(self):
        self._running=True
        logger.info("DNS monitor started")
        for p in DNS_LOG_FILES:
            if os.path.exists(p):
                try: self._positions[p]=os.path.getsize(p)
                except: self._positions[p]=0
        while self._running:
            try:
                for p in DNS_LOG_FILES: await self._tail(p)
            except Exception as e: logger.error(f"dns: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _tail(self, path):
        if not os.path.exists(path): return
        try: size=os.path.getsize(path)
        except: return
        pos=self._positions.get(path,0)
        if size<=pos: return
        try:
            with open(path,"r",errors="replace") as f:
                f.seek(pos); lines=f.readlines(MAX_LINES_PER_CYCLE*200)
                self._positions[path]=f.tell()
        except (PermissionError,OSError): return
        for line in lines[-MAX_LINES_PER_CYCLE:]:
            m=DNS_QUERY_RE.search(line)
            if m: await self._analyze(m.group(1).lower().rstrip("."))

    async def _analyze(self, domain):
        _counts[domain]+=1
        parts=domain.split(".")
        sub=parts[0] if len(parts)>2 else ""
        ent=_entropy(sub) if sub else _entropy(parts[0])
        alerts=[]
        if SUSPICIOUS_TLD.search(domain): alerts.append(("suspicious_tld","medium"))
        if ent>3.8 and len(sub)>12: alerts.append(("dga_domain","high"))
        if _counts[domain]>=BEACON_THRESH: alerts.append(("dns_beacon","high")); _counts[domain]=0
        if len(sub)>50: alerts.append(("dns_tunnel","high"))
        for etype,sev in alerts:
            key=(domain,etype)
            if key in _seen: continue
            _seen.add(key)
            await event_bus.publish(Event(source="dns_monitor",event_type=etype,severity=sev,
                data={"domain":domain,"entropy":round(ent,2),"timestamp":datetime.utcnow().isoformat()}))
