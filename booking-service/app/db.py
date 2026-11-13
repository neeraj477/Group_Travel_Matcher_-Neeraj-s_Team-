"""SQLite connections for booking-service.

Owns: opening app.db and handing one connection to each request.
Request path: route → deps (current_traveller, load_group) → pricing → SQL. This module is the
"SQL" end: every dependency and route that touches the database gets its connection from get_db().

This service never creates or changes the schema. backend/src/db.ts owns every table, so there is
no schema or seed code here on purpose.
"""

import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

# Resolved from this file, not the current directory, so `uvicorn` and `pytest` find the same
# app.db whichever folder they are started from. Mirrors db.ts line 7: path.resolve(__dirname, "../../app.db").
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = REPO_ROOT / "app.db"


def db_path() -> Path:
    """Return the database path: env DB_PATH, else <repo root>/app.db (as db.ts line 7).

    Read on every call, not at import, so tests can point DB_PATH at a temporary file.
    """
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    """Return an open connection to an EXISTING app.db; raise sqlite3.OperationalError if it is missing.

    Mirrors CLAUDE.md "Database rules": foreign_keys, busy_timeout, autocommit, Row results.
    """
    path = db_path() if path is None else Path(path)
    # mode=rw: open read-write but never create. A plain connect() would silently make an empty
    # app.db if Express hasn't started yet, and every query would then fail with "no such table".
    # Failing at connect time points straight at the real cause.
    conn = sqlite3.connect(
        f"file:{path}?mode=rw",
        uri=True,
        # None = autocommit: Python's sqlite3 won't open hidden transactions, so the booking
        # slice controls its own BEGIN IMMEDIATE ... COMMIT exactly.
        isolation_level=None,
        # FastAPI runs sync dependencies and sync routes in a thread pool, so the thread that
        # opens a connection may not be the one that uses it. One request still uses it at a time.
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    # SQLite turns foreign keys off for every new connection unless asked; db.ts turns them on too.
    conn.execute("PRAGMA foreign_keys = ON")
    # Express writes to the same file. Wait up to 5 s for its lock instead of failing with
    # "database is locked" straight away.
    conn.execute("PRAGMA busy_timeout = 5000")
    # No journal_mode change: db.ts already set WAL, and WAL is stored in the file itself.
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: yield one connection for this request and always close it.

    FastAPI caches a dependency within a request, so current_traveller, load_group and the route
    all share this single connection.
    """
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
