"""
PARTH WebSocket Router
Real-time event streaming to the dashboard.
"""

import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.event_bus import event_bus
from db.database import save_event, save_ai_analysis

logger = logging.getLogger("parth.websocket")
ws_router = APIRouter()


# Subscribe to ALL events and persist to DB
async def _persist_handler(event):
    try:
        await save_event(event.to_dict())
        if event.event_type == "ai_analysis_result":
            await save_ai_analysis(event.data)
    except Exception as e:
        logger.error(f"Persist error: {e}")


event_bus.subscribe("*", _persist_handler)


@ws_router.websocket("/ws/events")
async def events_websocket(websocket: WebSocket):
    await websocket.accept()
    client_queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    event_bus.add_ws_client(client_queue)
    logger.info(f"WebSocket client connected")

    try:
        while True:
            try:
                event_data = await asyncio.wait_for(client_queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps(event_data))
            except asyncio.TimeoutError:
                # Send keepalive ping
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        event_bus.remove_ws_client(client_queue)
