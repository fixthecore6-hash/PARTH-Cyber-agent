"""
PARTH — Proactive Autonomous Real-Time Host-defender
Backend Entry Point
"""

import asyncio
import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager

# Load .env from project root if present
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from api.websocket import ws_router
from core.event_bus import event_bus
from core.monitor_manager import MonitorManager
from db.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("parth")

monitor_manager = MonitorManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("PARTH starting up...")
    await init_db()
    await monitor_manager.start_all()
    yield
    logger.info("PARTH shutting down...")
    await monitor_manager.stop_all()


app = FastAPI(
    title="PARTH Cybersecurity AI",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok", "system": "PARTH", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    _host = os.environ.get("PARTH_HOST", "0.0.0.0")
    _port = int(os.environ.get("PARTH_PORT", "8000"))
    uvicorn.run("main:app", host=_host, port=_port, reload=False, log_level="info")
