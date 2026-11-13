"""Shared test fixtures: a throwaway app.db with Express's real schema and a tiny seed.

Owns: the temporary database every DB test uses. It is built from schema_from_db_ts.sql (copied
verbatim from backend/src/db.ts) and filled the way db.ts seeds: interests as JSON text, members by position.
Request path: tests stand in for Express here. They create the file so app.db.connect() (mode=rw) can open it.
"""

import json
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.db import connect

SCHEMA_SQL = Path(__file__).parent / "schema_from_db_ts.sql"

# Real rows from data/problem-3/travellers.json; T-003 Meera is deliberately NOT in G-01.
TRAVELLERS = [
    ("T-001", "Sarah Thomas", 27, "FEMALE", "Bengaluru", "BLR",
     ["TEMPLES", "STREET_FOOD", "PHOTOGRAPHY", "BUDGET_STAYS"], "SAME_GENDER"),
    ("T-002", "Priya Shah", 26, "FEMALE", "Mumbai", "BOM",
     ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "SAME_GENDER"),
    ("T-003", "Meera Iyer", 29, "FEMALE", "Chennai", "MAA",
     ["STREET_FOOD", "TEMPLES", "NATURE"], "SAME_GENDER"),
]


def seed(conn: sqlite3.Connection) -> None:
    """Insert the three travellers and G-01 (Sarah owner at position 0, Priya at 1), as db.ts lines 63–72 would."""
    conn.executemany(
        "INSERT INTO travellers (id, name, age, gender, home_city, home_airport, interests,"
        " gender_preference, is_seed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
        # JSON text, exactly as db.ts writes it with JSON.stringify(t.interests).
        [(*t[:6], json.dumps(t[6]), t[7]) for t in TRAVELLERS],
    )
    conn.execute(
        "INSERT INTO groups (id, name, owner_id, city, check_in, check_out, max_size, budget_inr, itinerary)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("G-01", "Kyoto Spring Temples", "T-001", "Kyoto", "2027-04-10", "2027-04-15", 3, 60000,
         "Fushimi Inari at sunrise, Nishiki Market lunch, Gion walk, photo day in Arashiyama."),
    )
    conn.executemany(
        "INSERT INTO group_members (group_id, traveller_id, position) VALUES (?, ?, ?)",
        [("G-01", "T-001", 0), ("G-01", "T-002", 1)],
    )


@pytest.fixture
def db_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Return the path of a fresh seeded DB, with DB_PATH pointing at it for this test only."""
    path = tmp_path / "app.db"
    conn = sqlite3.connect(path)
    # Same journal mode Express sets (db.ts line 9), so tests see the same locking behaviour.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA_SQL.read_text())
    seed(conn)
    conn.commit()
    conn.close()
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def conn(db_file: Path) -> Iterator[sqlite3.Connection]:
    """Yield a connection opened the way the app opens it (app.db.connect), closed after the test."""
    conn = connect()
    yield conn
    conn.close()
