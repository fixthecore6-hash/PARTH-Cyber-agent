"""
PARTH AI Reasoning Engine
Local LLM via Ollama for threat analysis, explanation, and summarization.
All inference runs locally — no external API calls.
"""

import asyncio
import logging
import json
import aiohttp
from datetime import datetime
from core.event_bus import event_bus, Event

logger = logging.getLogger("parth.ai_reasoning")

import os as _os
OLLAMA_URL = _os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL = _os.environ.get("PARTH_MODEL", "mistral")  # set via env: PARTH_MODEL=phi3 bash scripts/start.sh
POLL_INTERVAL = 10  # check queue less often
MAX_QUEUE_SIZE = 20  # smaller queue
MIN_INFERENCE_GAP = 8  # seconds between inferences — prevents Ollama from pegging CPU

SYSTEM_PROMPT = """You are PARTH, a local cybersecurity AI assistant. 
Your job is to analyze security events on a Linux system and provide:
1. A brief, clear explanation of what happened (2-3 sentences)
2. The likely threat category (malware, intrusion, misconfiguration, false_positive, etc.)
3. Specific recommended defensive actions (commands or steps)
4. Confidence level: high / medium / low

Respond ONLY in this JSON format (no markdown, no extra text):
{
  "explanation": "...",
  "threat_category": "...",
  "recommended_actions": ["action1", "action2"],
  "confidence": "high|medium|low",
  "false_positive_likelihood": "high|medium|low"
}"""


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

        # Subscribe to events that need AI analysis
        event_bus.subscribe("suspicious_process", self._enqueue)
        event_bus.subscribe("privilege_escalation", self._enqueue)
        event_bus.subscribe("file_integrity_violation", self._enqueue)
        event_bus.subscribe("brute_force_detected", self._enqueue)
        event_bus.subscribe("suspicious_connection", self._enqueue)
        event_bus.subscribe("process_in_tmp", self._enqueue)
        event_bus.subscribe("new_user_created", self._enqueue)
        event_bus.subscribe("root_login", self._enqueue)

        # Check Ollama availability
        self._ollama_available = await self._check_ollama()
        if not self._ollama_available:
            logger.warning("Ollama not available — AI analysis will be skipped. Start Ollama with: ollama serve")

        while self._running:
            try:
                if not self._queue.empty() and self._ollama_available:
                    event = await self._queue.get()
                    await self._analyze(event)
                    self._queue.task_done()
                    await asyncio.sleep(MIN_INFERENCE_GAP)  # cool-down between inferences
            except Exception as e:
                logger.error(f"ai_reasoning error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    async def _enqueue(self, event: Event):
        if event.data.get("ai_analyze"):
            try:
                self._queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("AI analysis queue full — dropping event")

    async def _check_ollama(self) -> bool:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as session:
                async with session.get("http://127.0.0.1:11434/api/tags") as r:
                    return r.status == 200
        except Exception:
            return False

    async def _analyze(self, event: Event):
        prompt = self._build_prompt(event)
        try:
            result = await self._ollama_infer(prompt)
            parsed = json.loads(result)

            # Publish AI analysis result as a new event
            await event_bus.publish(Event(
                source="ai_reasoning",
                event_type="ai_analysis_result",
                severity=event.severity,
                data={
                    "original_event_id": event.id,
                    "original_event_type": event.event_type,
                    "explanation": parsed.get("explanation", ""),
                    "threat_category": parsed.get("threat_category", "unknown"),
                    "recommended_actions": parsed.get("recommended_actions", []),
                    "confidence": parsed.get("confidence", "low"),
                    "false_positive_likelihood": parsed.get("false_positive_likelihood", "medium"),
                    "original_data": event.data,
                }
            ))
            logger.info(f"AI analyzed: {event.event_type} -> {parsed.get('threat_category')}")

        except json.JSONDecodeError:
            logger.warning(f"AI returned non-JSON response for {event.event_type}")
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")

    def _build_prompt(self, event: Event) -> str:
        return f"""Analyze this security event detected on a Linux system:

Event Type: {event.event_type}
Severity: {event.severity}
Source Module: {event.source}
Timestamp: {event.timestamp}
Event Data:
{json.dumps(event.data, indent=2)}

Provide your security analysis in the specified JSON format."""

    async def _ollama_infer(self, prompt: str) -> str:
        payload = {
            "model": MODEL,
            "prompt": f"{SYSTEM_PROMPT}\n\n{prompt}",
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 512,
            }
        }
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
            async with session.post(OLLAMA_URL, json=payload) as resp:
                data = await resp.json()
                return data.get("response", "{}")

    async def summarize_threats(self, events: list) -> str:
        """Generate a human-readable threat summary for the dashboard."""
        if not self._ollama_available:
            return "AI engine offline. Start Ollama: ollama serve && ollama pull mistral"

        summary_prompt = f"""Summarize the following {len(events)} security events from the last hour into a concise threat report for a system administrator.
Include: overall risk level, key threats detected, and top 3 priority actions.

Events:
{json.dumps(events[:20], indent=2)}

Respond in plain English, 150 words max."""

        try:
            payload = {
                "model": MODEL,
                "prompt": summary_prompt,
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 300}
            }
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as session:
                async with session.post(OLLAMA_URL, json=payload) as resp:
                    data = await resp.json()
                    return data.get("response", "Summary unavailable.")
        except Exception as e:
            return f"Summary failed: {e}"
