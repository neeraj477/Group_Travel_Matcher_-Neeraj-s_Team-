"""The checks every M6 endpoint runs before its own work.

Owns: identity (401), group lookup (404) and membership (403), in CONTRACT.md's order.
Request path: route → deps → pricing → SQL. A route declares current_traveller first and load_group
second (FastAPI resolves dependencies in parameter order), then calls require_member in its body.
Mirrors me(), groupOr404() and requireMember() in server.ts lines 23–36.
"""

import sqlite3
from typing import Any

from fastapi import Depends, Header

from app.db import get_db
from app.errors import ApiError

# Messages are part of the contract, character for character (CONTRACT.md "Shared conventions").
NO_IDENTITY_MESSAGE = "Sign up or pick your profile first."
GROUP_NOT_FOUND_MESSAGE = "Group not found."
NOT_A_MEMBER_MESSAGE = "Only group members can do this."

Group = dict[str, Any]


def current_traveller(
    x_traveller_id: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    """Return the caller's travellers row, or raise 401 (CONTRACT.md check 1; server.ts:23–28).

    FastAPI maps x_traveller_id to the "x-traveller-id" header. It is the only source of identity.
    """
    # An empty header counts as missing, as `id ? getTraveller(id) : undefined` does in Express.
    if not x_traveller_id:
        raise ApiError(401, NO_IDENTITY_MESSAGE)
    row = conn.execute("SELECT * FROM travellers WHERE id = ?", (x_traveller_id,)).fetchone()
    if row is None:
        raise ApiError(401, NO_IDENTITY_MESSAGE)
    return row


def load_group(group_id: str, conn: sqlite3.Connection = Depends(get_db)) -> Group:
    """Return the groups row plus member_ids, or raise 404 (CONTRACT.md check 2; db.ts getGroup, server.ts:29–33).

    member_ids follow group_members.position, the order the contract uses for members and shares.
    """
    row = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if row is None:
        raise ApiError(404, GROUP_NOT_FOUND_MESSAGE)
    members = conn.execute(
        "SELECT traveller_id FROM group_members WHERE group_id = ? ORDER BY position",
        (group_id,),
    ).fetchall()
    return dict(row) | {"member_ids": [m["traveller_id"] for m in members]}


def require_member(group: Group, traveller: sqlite3.Row) -> None:
    """Return None if the traveller is in the group, else raise 403 (CONTRACT.md check 3; server.ts:34–36)."""
    if traveller["id"] not in group["member_ids"]:
        raise ApiError(403, NOT_A_MEMBER_MESSAGE)
