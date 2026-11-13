import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

# Resolved from this file so the service finds the same DB whatever the current directory is.
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = REPO_ROOT / "app.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


def connect(path: Path | str) -> sqlite3.Connection:
    # isolation_level=None: we issue BEGIN/COMMIT ourselves, so transactions are explicit.
    # check_same_thread=False: FastAPI may run a sync dependency and its route on different threads.
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect(db_path())
    try:
        yield conn
    finally:
        conn.close()


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text())
