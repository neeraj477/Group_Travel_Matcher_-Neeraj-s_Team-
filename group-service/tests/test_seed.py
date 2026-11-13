import json
import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.db import connect, init_db
from app.seed import DATA_DIR, seed

EXPECTED_COUNTS = {
    "cities": 5,
    "interests": 16,
    "hotels": 49,
    "rooms": 125,
    "availability": 2500,
    "travellers": 24,
    "trip_groups": 12,
}


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    conn = connect(tmp_path / "test.db")
    init_db(conn)
    seed(conn)
    yield conn
    conn.close()


def counts(conn: sqlite3.Connection) -> dict[str, int]:
    # Table names come from the fixed dict above, never from input, so formatting is safe here.
    return {
        table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in EXPECTED_COUNTS
    }


def member_ids(conn: sqlite3.Connection, group_id: str) -> set[str]:
    rows = conn.execute(
        "SELECT traveller_id FROM group_members WHERE group_id = ?", (group_id,)
    ).fetchall()
    return {row["traveller_id"] for row in rows}


def test_seed_loads_every_record(conn: sqlite3.Connection) -> None:
    assert counts(conn) == EXPECTED_COUNTS


def test_g07_has_three_members(conn: sqlite3.Connection) -> None:
    assert len(member_ids(conn, "G-07")) == 3


def test_seeding_twice_keeps_counts(conn: sqlite3.Connection) -> None:
    seed(conn)
    assert counts(conn) == EXPECTED_COUNTS


def test_reseed_keeps_members_added_by_the_app(conn: sqlite3.Connection) -> None:
    # G-01 starts with only its owner, T-001; T-002 joins as if an approval happened.
    assert "T-002" not in member_ids(conn, "G-01")
    conn.execute(
        "INSERT INTO group_members (group_id, traveller_id, joined_at) VALUES (?, ?, ?)",
        ("G-01", "T-002", "2027-01-01T00:00:00+00:00"),
    )
    seed(conn)
    assert "T-002" in member_ids(conn, "G-01")


def test_impossible_stay_raises_instead_of_being_skipped(tmp_path: Path) -> None:
    # Edit a copy of the data pack; the real files under data/ are read-only.
    data_dir = tmp_path / "data"
    shutil.copytree(DATA_DIR, data_dir)
    groups_file = data_dir / "problem-3" / "groups.json"
    groups = json.loads(groups_file.read_text())
    groups[0]["check_out"] = groups[0]["check_in"]
    groups_file.write_text(json.dumps(groups))

    # A fresh DB: in an already-seeded one, G-01 would be a key conflict and never reach the CHECK.
    conn = connect(tmp_path / "bad.db")
    init_db(conn)
    with pytest.raises(sqlite3.IntegrityError, match="check_out > check_in"):
        seed(conn, data_dir)
    # The whole seed rolled back, not just the bad row.
    assert conn.execute("SELECT COUNT(*) FROM trip_groups").fetchone()[0] == 0
    conn.close()
