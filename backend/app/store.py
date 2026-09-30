"""
Server-side storage for published projects - the only data Routing Slip keeps.

There are no accounts: publishing returns an unguessable project id and a secret
key. Only a SHA-256 hash of the key is stored, so a leaked database can't be used
to call anyone's endpoint. Webhook calls are logged briefly for the connect panel
(last 100 per project, at most 30 days, text truncated) and deleted with the project.
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.environ.get(
    "STUDIO_DB",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "studio.db"),
)
KEEP_RUNS = 100
KEEP_DAYS = 30
LOGGED_TEXT_CHARS = 500

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,
    spec TEXT NOT NULL,
    workflow TEXT NOT NULL,
    created REAL NOT NULL,
    updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS hook_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ts REAL NOT NULL,
    text TEXT NOT NULL,
    outcome TEXT NOT NULL,
    result TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hook_runs_project_ts ON hook_runs(project_id, ts);
"""


@contextmanager
def _db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create_project(spec: dict, workflow: dict) -> tuple[str, str]:
    project_id = secrets.token_urlsafe(9)
    key = "rs_" + secrets.token_urlsafe(24)
    now = time.time()
    with _db() as db:
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, _hash(key), json.dumps(spec), json.dumps(workflow), now, now),
        )
    return project_id, key


def get_project(project_id: str, key: str | None) -> dict | None:
    """The project, only if the key matches."""
    with _db() as db:
        row = db.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
    if row is None or not key or not hmac.compare_digest(row["key_hash"], _hash(key)):
        return None
    return {
        "id": row["id"],
        "spec": json.loads(row["spec"]),
        "workflow": json.loads(row["workflow"]),
        "created": row["created"],
        "updated": row["updated"],
    }


def update_project(project_id: str, spec: dict, workflow: dict) -> None:
    with _db() as db:
        db.execute(
            "UPDATE projects SET spec = ?, workflow = ?, updated = ? WHERE id = ?",
            (json.dumps(spec), json.dumps(workflow), time.time(), project_id),
        )


def delete_project(project_id: str) -> None:
    with _db() as db:
        db.execute("DELETE FROM hook_runs WHERE project_id = ?", (project_id,))
        db.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def log_run(project_id: str, text: str, result: dict) -> None:
    now = time.time()
    with _db() as db:
        db.execute(
            "INSERT INTO hook_runs (project_id, ts, text, outcome, result) VALUES (?, ?, ?, ?, ?)",
            (
                project_id,
                now,
                text[:LOGGED_TEXT_CHARS],
                result["outcome"],
                json.dumps(result),
            ),
        )
        db.execute(
            "DELETE FROM hook_runs WHERE project_id = ? AND (ts < ? OR id NOT IN ("
            "SELECT id FROM hook_runs WHERE project_id = ? ORDER BY ts DESC LIMIT ?))",
            (project_id, now - KEEP_DAYS * 86400, project_id, KEEP_RUNS),
        )


def recent_runs(project_id: str, limit: int = 20) -> list[dict]:
    with _db() as db:
        rows = db.execute(
            "SELECT ts, text, outcome, result FROM hook_runs WHERE project_id = ? "
            "ORDER BY ts DESC LIMIT ?",
            (project_id, limit),
        ).fetchall()
    return [
        {
            "ts": r["ts"],
            "text": r["text"],
            "outcome": r["outcome"],
            "result": json.loads(r["result"]),
        }
        for r in rows
    ]


def runs_since(project_id: str, since: float) -> int:
    with _db() as db:
        return db.execute(
            "SELECT COUNT(*) FROM hook_runs WHERE project_id = ? AND ts >= ?",
            (project_id, since),
        ).fetchone()[0]
