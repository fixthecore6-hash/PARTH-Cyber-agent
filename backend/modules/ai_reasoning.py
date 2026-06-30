"""
PARTH AI Reasoning Engine
created_by:pushkar | helped_by:claude | parth-host-defender
PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
"""

import asyncio
import logging
import json
import re
import aiohttp
import os as _os
from datetime import datetime
from core.event_bus import event_bus, Event

logger = logging.getLogger("parth.ai_reasoning")

OLLAMA_URL      = _os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
POLL_INTERVAL   = 10
MAX_QUEUE_SIZE  = 20
MIN_INFERENCE_GAP = 8

# BUG 1 FIX: never cache model at import — always read from env per request
def _get_model() -> str:
    """Read model from env every call — never cached. Fails loud if not set."""
    m = _os.environ.get("PARTH_MODEL", "").strip()
    if not m:
        raise RuntimeError(
            "PARTH_MODEL not set. Add PARTH_MODEL=qwen2.5:0.5b to your .env file."
        )
    return m

SYSTEM_PROMPT = """You are PARTH, a local cybersecurity AI assistant.
Analyze security events and respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "explanation": "...",
  "threat_category": "...",
  "recommended_actions": ["action1", "action2"],
  "confidence": "high|medium|low",
  "false_positive_likelihood": "high|medium|low"
}"""


def _extract_json(text: str) -> dict:
    """BUG 2 FIX: robustly extract JSON even if model adds preamble text."""
    text = text.strip()
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Find first { ... } block
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Return safe fallback so analysis is never silently lost
    return {
        "explanation": text[:300] if text else "Could not parse AI response.",
        "threat_category": "unknown",
        "recommended_actions": ["Review event manually"],
        "confidence": "low",
        "false_positive_likelihood": "medium",
    }


class AIReasoningEngine:
    name = "ai_reasoning"

    def __init__(self):
        self._running = False
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        self._ollama_available = False

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("AI Reasoning Engine started")

        event_bus.subscribe("suspicious_process",       self._enqueue)
        event_bus.subscribe("privilege_escalation",     self._enqueue)
        event_bus.subscribe("file_integrity_violation", self._enqueue)
        event_bus.subscribe("brute_force_detected",     self._enqueue)
        event_bus.subscribe("suspicious_connection",    self._enqueue)
        event_bus.subscribe("process_in_tmp",           self._enqueue)
        event_bus.subscribe("new_user_created",         self._enqueue)
        event_bus.subscribe("root_login",               self._enqueue)

        self._ollama_available = await self._check_ollama()
        if not self._ollama_available:
            logger.warning("Ollama not available — AI analysis skipped. Run: ollama serve")

        while self._running:
            try:
                if not self._queue.empty() and self._ollama_available:
                    event = await self._queue.get()
                    await self._analyze(event)
                    self._queue.task_done()
                    await asyncio.sleep(MIN_INFERENCE_GAP)
            except Exception as e:
                logger.error(f"ai_reasoning loop error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _enqueue(self, event: Event):
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("AI analysis queue full — dropping event")

    async def _check_ollama(self) -> bool:
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=3)
            ) as session:
                async with session.get("http://127.0.0.1:11434/api/tags") as r:
                    return r.status == 200
        except Exception:
            return False

    async def _ollama_infer(self, prompt: str) -> str:
        # BUG 1 FIX: read model dynamically every call
        payload = {
            "model": _get_model(),
            "prompt": f"{SYSTEM_PROMPT}\n\n{prompt}",
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 512},
        }
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=60)
        ) as session:
            async with session.post(OLLAMA_URL, json=payload) as resp:
                if resp.status == 404:
                    m = _get_model()
                    raise RuntimeError(f'Model "{m}" not found. Run: ollama pull {m}')
                data = await resp.json()
                return data.get("response", "{}")

    async def _analyze(self, event: Event):
        prompt = self._build_prompt(event)
        # BUG 3 FIX: proper scoped variable, no dir() hack
        result_text = None
        try:
            result_text = await self._ollama_infer(prompt)
            # BUG 2 FIX: use robust extractor instead of bare json.loads
            parsed = _extract_json(result_text)

            await event_bus.publish(Event(
                source="ai_reasoning",
                event_type="ai_analysis_result",
                severity=event.severity,
                data={
                    "original_event_id":        event.id,
                    "original_event_type":       event.event_type,
                    "explanation":               parsed.get("explanation", ""),
                    "threat_category":           parsed.get("threat_category", "unknown"),
                    "recommended_actions":       parsed.get("recommended_actions", []),
                    "confidence":                parsed.get("confidence", "low"),
                    "false_positive_likelihood": parsed.get("false_positive_likelihood", "medium"),
                    "original_data":             event.data,
                }
            ))
            logger.info(f"AI analyzed: {event.event_type} -> {parsed.get('threat_category')}")

        except Exception as e:
            logger.error(f"AI analysis failed for {event.event_type}: {e}")
            if result_text:
                logger.debug(f"Raw response was: {result_text[:200]}")

    def _build_prompt(self, event: Event) -> str:
        return (
            f"Analyze this security event detected on a Linux system:\n\n"
            f"Event Type: {event.event_type}\n"
            f"Severity: {event.severity}\n"
            f"Source Module: {event.source}\n"
            f"Timestamp: {event.timestamp}\n"
            f"Event Data:\n{json.dumps(event.data, indent=2)}\n\n"
            f"Provide your security analysis in the specified JSON format."
        )

    async def summarize_threats(self, events: list) -> str:
        if not self._ollama_available:
            return "AI engine offline. Run: ollama serve && ollama pull " + _get_model()

        summary_prompt = (
            f"Summarize the following {len(events)} security events into a concise threat report.\n"
            f"Include: overall risk level, key threats, top 3 priority actions.\n"
            f"Events:\n{json.dumps(events[:20], indent=2)}\n\n"
            f"Respond in plain English, 150 words max."
        )
        try:
            # BUG 1 FIX: use _get_model() not frozen MODULE-level MODEL
            payload = {
                "model": _get_model(),
                "prompt": summary_prompt,
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 300},
            }
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=90)
            ) as session:
                async with session.post(OLLAMA_URL, json=payload) as resp:
                    data = await resp.json()
                    return data.get("response", "Summary unavailable.")
        except Exception as e:
            return f"Summary failed: {e}"
