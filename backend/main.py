"""
PARTH — Proactive Autonomous Real-Time Host-defender
Backend Entry Point
created_by:pushkar | helped_by:claude | parth-host-defender
PARTH_AUTHOR_FINGERPRINT: pushkar-dutt|parth-host-defender|2024
"""

import asyncio
import logging
import os
import argparse
from pathlib import Path
from contextlib import asynccontextmanager

# Load .env from project root if present
_env_file = Path(__file__).resolve().parent.parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ[_k.strip()] = _v.strip()

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
    allow_origins=["*"],   # Vite proxy handles origin; wildcard safe for local LAN use
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "system": "PARTH",
        "version": "1.0.0",
        "model": os.environ.get("PARTH_MODEL", ""),
    }


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="PARTH backend")
    parser.add_argument("--ssl-keyfile",  default=None, help="Path to TLS key")
    parser.add_argument("--ssl-certfile", default=None, help="Path to TLS cert")
    args = parser.parse_args()

    _host = os.environ.get("PARTH_HOST", "0.0.0.0")
    _port = int(os.environ.get("PARTH_PORT", "8000"))

    # Use SSL if certs provided AND files exist
    _ssl_key  = args.ssl_keyfile  if args.ssl_keyfile  and Path(args.ssl_keyfile).exists()  else None
    _ssl_cert = args.ssl_certfile if args.ssl_certfile and Path(args.ssl_certfile).exists() else None

    if _ssl_key and _ssl_cert:
        logger.info(f"Starting PARTH backend HTTPS on {_host}:{_port}")
    else:
        logger.info(f"Starting PARTH backend HTTP on {_host}:{_port} (no certs found)")

    uvicorn.run(
        "main:app",
        host=_host,
        port=_port,
        reload=False,
        log_level="info",
        ssl_keyfile=_ssl_key,
        ssl_certfile=_ssl_cert,
    )
