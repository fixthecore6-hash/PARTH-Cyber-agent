"""
PARTH Alert Webhooks
Sends critical/high alerts to Telegram, Discord, or generic webhook.
Configure via environment variables or .env file.
"""

import asyncio
import logging
import os
import aiohttp
from datetime import datetime
from core.event_bus import event_bus, Event

logger = logging.getLogger("parth.alerter")

TELEGRAM_TOKEN = os.environ.get("PARTH_TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("PARTH_TELEGRAM_CHAT_ID", "")
DISCORD_WEBHOOK = os.environ.get("PARTH_DISCORD_WEBHOOK", "")
GENERIC_WEBHOOK = os.environ.get("PARTH_WEBHOOK_URL", "")

# Only alert on these severities
ALERT_SEVERITIES = {"critical", "high"}

# Avoid alert storms — dedupe same event_type within window (seconds)
_COOLDOWN: dict = {}
COOLDOWN_SECONDS = 120

SEV_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "medium": "🟡",
    "low": "🟢",
    "info": "⚪",
}


def _should_alert(event: Event) -> bool:
    if event.severity not in ALERT_SEVERITIES:
        return False
    key = event.event_type
    now = datetime.utcnow().timestamp()
    last = _COOLDOWN.get(key, 0)
    if now - last < COOLDOWN_SECONDS:
        return False
    _COOLDOWN[key] = now
    return True


def _format_message(event: Event) -> str:
    emoji = SEV_EMOJI.get(event.severity, "⚪")
    lines = [
        f"{emoji} *PARTH ALERT* — `{event.event_type}`",
        f"Severity: `{event.severity.upper()}`",
        f"Source: `{event.source}`",
        f"Time: `{event.timestamp[:19]}`",
    ]
    data = event.data
    if data.get("cmdline"):
        lines.append(f"Cmd: `{data['cmdline'][:100]}`")
    if data.get("reason"):
        lines.append(f"Reason: {data['reason'][:200]}")
    if data.get("remote_ip"):
        lines.append(f"Remote IP: `{data['remote_ip']}:{data.get('remote_port', '')}`")
    if data.get("risk_score"):
        lines.append(f"Risk Score: `{data['risk_score']}/10`")
    return "\n".join(lines)


async def _send_telegram(text: str):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.post(url, json=payload) as r:
                if r.status != 200:
                    logger.warning(f"Telegram alert failed: {r.status}")
    except Exception as e:
        logger.error(f"Telegram send error: {e}")


async def _send_discord(text: str):
    if not DISCORD_WEBHOOK:
        return
    # Strip markdown for Discord embed
    payload = {"content": text.replace("*", "**").replace("`", "`")}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.post(DISCORD_WEBHOOK, json=payload) as r:
                if r.status not in (200, 204):
                    logger.warning(f"Discord alert failed: {r.status}")
    except Exception as e:
        logger.error(f"Discord send error: {e}")


async def _send_generic(event: Event):
    if not GENERIC_WEBHOOK:
        return
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.post(GENERIC_WEBHOOK, json=event.to_dict()) as r:
                if r.status not in (200, 201, 204):
                    logger.warning(f"Generic webhook failed: {r.status}")
    except Exception as e:
        logger.error(f"Generic webhook error: {e}")


class AlertWebhook:
    name = "alert_webhook"

    def __init__(self):
        self._running = False

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        has_any = any([TELEGRAM_TOKEN, DISCORD_WEBHOOK, GENERIC_WEBHOOK])
        if not has_any:
            logger.info("Alert webhooks: no destinations configured (set PARTH_TELEGRAM_TOKEN, PARTH_DISCORD_WEBHOOK, or PARTH_WEBHOOK_URL in .env)")
        else:
            logger.info(f"Alert webhook started — Telegram={'yes' if TELEGRAM_TOKEN else 'no'}, Discord={'yes' if DISCORD_WEBHOOK else 'no'}, Generic={'yes' if GENERIC_WEBHOOK else 'no'}")

        event_bus.subscribe("*", self._handle)

        while self._running:
            await asyncio.sleep(1)

    async def _handle(self, event: Event):
        if not _should_alert(event):
            return
        text = _format_message(event)
        await asyncio.gather(
            _send_telegram(text),
            _send_discord(text),
            _send_generic(event),
            return_exceptions=True,
        )
