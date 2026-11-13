"""The hotel catalog from the read-only data pack.

Owns: hotels.json, rooms.json and availability.json, loaded once into lookup dicts.
Request path: route → deps → pricing → SQL. Routes and pricing read the catalog alongside SQL; the
catalog is not in the database (CONTRACT.md "Ownership"), exactly like backend/src/catalog.ts.

The files are only ever read. Nothing here writes to data/.
"""

import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from app.db import REPO_ROOT

DEFAULT_DATA_DIR = REPO_ROOT / "data"

Hotel = dict[str, Any]
Room = dict[str, Any]


@dataclass(frozen=True)
class Catalog:
    """Everything M6 needs from the catalog, shared by every request.

    frozen=True only stops a field being reassigned; the dicts and lists inside can still be
    mutated, so callers must treat them as read-only.

    Every list and dict keeps the JSON file order (Python dicts keep insertion order). The contract's
    stable sorts must start from file order to match JavaScript's Array.sort.
    """

    hotels: list[Hotel]
    hotel_by_id: dict[str, Hotel]
    rooms: list[Room]
    rooms_by_hotel: dict[str, list[Room]]
    room_by_id: dict[str, Room]
    # (room_id, date) -> catalog rooms left that night, before our own bookings. A missing key
    # means 0 (CONTRACT.md pricing rules); the pricing slice applies that default.
    rooms_left: dict[tuple[str, str], int]


def data_dir() -> Path:
    """Return the data pack folder: env DATA_DIR, else <repo root>/data (as catalog.ts line 5)."""
    return Path(os.environ.get("DATA_DIR", DEFAULT_DATA_DIR))


def _read(relative: str) -> Any:
    """Return one parsed JSON file from the data pack, like load() in catalog.ts line 8."""
    with open(data_dir() / relative, encoding="utf-8") as f:
        return json.load(f)


@cache
def get_catalog() -> Catalog:
    """Return the catalog, loading the three files on the first call only.

    Mirrors catalog.ts lines 41–61 (hotels, rooms, availability, hotelById, roomById).
    @cache makes it load once per process. Tests set DATA_DIR and call get_catalog.cache_clear().
    """
    hotels: list[Hotel] = _read("catalog/hotels.json")
    rooms: list[Room] = _read("catalog/rooms.json")
    availability: list[dict[str, Any]] = _read("catalog/availability.json")

    rooms_by_hotel: dict[str, list[Room]] = {}
    for room in rooms:
        rooms_by_hotel.setdefault(room["hotel_id"], []).append(room)

    return Catalog(
        hotels=hotels,
        hotel_by_id={h["hotel_id"]: h for h in hotels},
        rooms=rooms,
        rooms_by_hotel=rooms_by_hotel,
        room_by_id={r["room_id"]: r for r in rooms},
        rooms_left={(a["room_id"], a["date"]): a["rooms_left"] for a in availability},
    )
