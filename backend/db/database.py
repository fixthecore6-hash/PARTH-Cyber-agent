"""
PARTH Database
SQLite event storage and query layer.
"""

import aiosqlite
import json
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger("parth.db")

import pathlib as _pathlib
DB_PATH = str(_pathlib.Path(__file__).resolve().parent / "parth.db")


async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                source TEXT NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                data TEXT NOT NULL,
                processed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity)
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS approved_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT,
                action TEXT NOT NULL,
                approved_by TEXT DEFAULT 'user',
                executed_at TEXT,
                result TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS ai_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_event_id TEXT NOT NULL,
                original_event_type TEXT,
                explanation TEXT,
                threat_category TEXT,
                recommended_actions TEXT,
                confidence TEXT,
                false_positive_likelihood TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.commit()
    logger.info(f"Database initialized at {DB_PATH}")


async def save_event(event_dict: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO events (id, timestamp, source, event_type, severity, data) VALUES (?,?,?,?,?,?)",
            (
                event_dict["id"],
                event_dict["timestamp"],
                event_dict["source"],
                event_dict["event_type"],
                event_dict["severity"],
                json.dumps(event_dict["data"]),
            )
        )
        await db.commit()


async def get_events(
    limit: int = 100,
    severity: str = None,
    event_type: str = None,
    since_hours: int = 24,
) -> list:
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    conditions = ["timestamp > ?"]
    params = [since]

    if severity:
        conditions.append("severity = ?")
        params.append(severity)
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)

    where = " AND ".join(conditions)
    params.append(limit)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"SELECT * FROM events WHERE {where} ORDER BY timestamp DESC LIMIT ?",
            params
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_event_counts_by_severity(since_hours: int = 24) -> dict:
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT severity, COUNT(*) as count FROM events WHERE timestamp > ? GROUP BY severity",
            (since,)
        ) as cursor:
            rows = await cursor.fetchall()
            return {row[0]: row[1] for row in rows}


async def save_ai_analysis(data: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO ai_analyses
               (original_event_id, original_event_type, explanation, threat_category,
                recommended_actions, confidence, false_positive_likelihood)
               VALUES (?,?,?,?,?,?,?)""",
            (
                data.get("original_event_id"),
                data.get("original_event_type"),
                data.get("explanation"),
                data.get("threat_category"),
                json.dumps(data.get("recommended_actions", [])),
                data.get("confidence"),
                data.get("false_positive_likelihood"),
            )
        )
        await db.commit()


async def save_approved_action(event_id: str, action: str, result: str = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO approved_actions (event_id, action, executed_at, result) VALUES (?,?,?,?)",
            (event_id, action, datetime.utcnow().isoformat(), result)
        )
        await db.commit()
