"""
PARTH Event Bus
Central async pub/sub system connecting all modules.
"""

import asyncio
import logging
from typing import Any, Callable, Dict, List
from dataclasses import dataclass, field
from datetime import datetime
import uuid

logger = logging.getLogger("parth.event_bus")


@dataclass
class Event:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    source: str = ""
    event_type: str = ""
    severity: str = "info"   # info | low | medium | high | critical
    data: Dict[str, Any] = field(default_factory=dict)
    processed: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "source": self.source,
            "event_type": self.event_type,
            "severity": self.severity,
            "data": self.data,
            "processed": self.processed,
        }


class EventBus:
    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=10000)
        self._running = False
        self._ws_clients: List[asyncio.Queue] = []

    def subscribe(self, event_type: str, handler: Callable):
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.debug(f"Subscribed {handler.__name__} to {event_type}")

    async def publish(self, event: Event):
        await self._queue.put(event)

    def add_ws_client(self, q: asyncio.Queue):
        self._ws_clients.append(q)

    def remove_ws_client(self, q: asyncio.Queue):
        if q in self._ws_clients:
            self._ws_clients.remove(q)

    async def _dispatch(self, event: Event):
        # Dispatch to specific subscribers
        handlers = self._subscribers.get(event.event_type, []) + \
                   self._subscribers.get("*", [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"Handler {handler.__name__} error: {e}")

        # Push to all WebSocket clients
        dead = []
        for q in self._ws_clients:
            try:
                q.put_nowait(event.to_dict())
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._ws_clients.remove(q)

    async def run(self):
        self._running = True
        logger.info("Event bus running")
        while self._running:
            try:
                event = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await self._dispatch(event)
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Event bus error: {e}")

    def stop(self):
        self._running = False


# Singleton
event_bus = EventBus()
