import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.db import REPO_ROOT

DATA_DIR = REPO_ROOT / "data"

Data = dict[str, Any]


class SeedError(Exception):
    """The data pack is inconsistent; the service must not start on bad data."""


def load_data(data_dir: Path = DATA_DIR) -> Data:
    def read(relative: str) -> Any:
        with open(data_dir / relative, encoding="utf-8") as f:
            return json.load(f)

    return {
        "destinations": read("catalog/destinations.json"),
        "hotels": read("catalog/hotels.json"),
        "rooms": read("catalog/rooms.json"),
        "availability": read("catalog/availability.json"),
        "interests": read("problem-3/interests.json"),
        "travellers": read("problem-3/travellers.json"),
        "groups": read("problem-3/groups.json"),
    }


def city_rows(destinations: Data) -> list[tuple[str, str, str, str]]:
    return [
        (city["name"], country["name"], country["code"], country["timezone"])
        for country in destinations["countries"]
        for city in country["cities"]
    ]


def validate(data: Data) -> None:
    cities = {row[0] for row in city_rows(data["destinations"])}
    interests = {i["interest"] for i in data["interests"]}
    travellers = {t["traveller_id"] for t in data["travellers"]}
    hotels = {h["hotel_id"] for h in data["hotels"]}
    rooms = {r["room_id"] for r in data["rooms"]}
    problems: list[str] = []

    for t in data["travellers"]:
        for interest in t["interests"]:
            if interest not in interests:
                problems.append(f"traveller {t['traveller_id']}: unknown interest {interest}")
    for g in data["groups"]:
        gid = g["group_id"]
        if g["owner_id"] not in g["member_ids"]:
            problems.append(f"group {gid}: owner {g['owner_id']} is not in member_ids")
        for member in g["member_ids"]:
            if member not in travellers:
                problems.append(f"group {gid}: unknown member {member}")
        if g["city"] not in cities:
            problems.append(f"group {gid}: unknown city {g['city']}")
    for h in data["hotels"]:
        if h["city"] not in cities:
            problems.append(f"hotel {h['hotel_id']}: unknown city {h['city']}")
    for r in data["rooms"]:
        if r["hotel_id"] not in hotels:
            problems.append(f"room {r['room_id']}: unknown hotel {r['hotel_id']}")
        if r["price_per_night"]["currency"] != "INR":
            problems.append(f"room {r['room_id']}: price is not in INR")
    for a in data["availability"]:
        if a["room_id"] not in rooms:
            problems.append(f"availability {a['date']}: unknown room {a['room_id']}")

    if problems:
        raise SeedError("Data pack failed validation:\n  " + "\n  ".join(problems))


# Every seed insert uses ON CONFLICT DO NOTHING, not INSERT OR IGNORE. Both skip rows whose
# primary key already exists, which is what makes re-seeding safe. But OR IGNORE also
# silently skips rows that fail a CHECK or NOT NULL, so bad data would vanish without an
# error. ON CONFLICT only covers key conflicts, so a CHECK failure still raises.


def insert_catalog(conn: sqlite3.Connection, data: Data) -> None:
    conn.executemany(
        "INSERT INTO cities (name, country, country_code, timezone) VALUES (?, ?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        city_rows(data["destinations"]),
    )
    conn.executemany(
        "INSERT INTO interests (interest, label, category) VALUES (?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(i["interest"], i["label"], i["category"]) for i in data["interests"]],
    )
    conn.executemany(
        "INSERT INTO hotels (hotel_id, name, city, area, rating, stars, image)"
        " VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
        [(h["hotel_id"], h["name"], h["city"], h["area"], h["rating"], h["stars"], h["image"])
         for h in data["hotels"]],
    )
    conn.executemany(
        "INSERT INTO rooms (room_id, hotel_id, room_type, name, max_adults,"
        " price_per_night_inr, refundable) VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(r["room_id"], r["hotel_id"], r["room_type"], r["name"], r["max_adults"],
          r["price_per_night"]["amount"], int(r["refundable"])) for r in data["rooms"]],
    )
    conn.executemany(
        "INSERT INTO availability (room_id, date, rooms_left) VALUES (?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(a["room_id"], a["date"], a["rooms_left"]) for a in data["availability"]],
    )


def insert_travellers(conn: sqlite3.Connection, data: Data, now: str) -> None:
    conn.executemany(
        "INSERT INTO travellers (traveller_id, name, age, gender, home_city,"
        " gender_preference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(t["traveller_id"], t["name"], t["age"], t["gender"], t["home_city"],
          t["gender_preference"], now) for t in data["travellers"]],
    )
    conn.executemany(
        "INSERT INTO traveller_interests (traveller_id, interest) VALUES (?, ?)"
        " ON CONFLICT DO NOTHING",
        [(t["traveller_id"], i) for t in data["travellers"] for i in t["interests"]],
    )


def insert_groups(conn: sqlite3.Connection, data: Data, now: str) -> None:
    conn.executemany(
        "INSERT INTO trip_groups (group_id, name, owner_id, city, check_in, check_out,"
        " max_size, budget_inr, itinerary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(g["group_id"], g["name"], g["owner_id"], g["city"], g["check_in"], g["check_out"],
          g["max_size"], g["budget_inr"], g["itinerary"], now) for g in data["groups"]],
    )
    conn.executemany(
        "INSERT INTO group_members (group_id, traveller_id, joined_at) VALUES (?, ?, ?)"
        " ON CONFLICT DO NOTHING",
        [(g["group_id"], m, now) for g in data["groups"] for m in g["member_ids"]],
    )


def seed(conn: sqlite3.Connection, data_dir: Path = DATA_DIR) -> None:
    """Idempotent: runs on every startup and only adds rows that are missing.

    ON CONFLICT DO NOTHING never deletes or overwrites, so approvals and new groups survive
    restarts, and seeded rows keep the created_at from their first seed. Any error rolls
    back the whole seed, so the DB never holds half a data pack.
    """
    data = load_data(data_dir)
    validate(data)
    now = datetime.now(UTC).isoformat(timespec="seconds")
    conn.execute("BEGIN")
    try:
        insert_catalog(conn, data)
        insert_travellers(conn, data, now)
        insert_groups(conn, data, now)
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
