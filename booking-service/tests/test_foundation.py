"""Tests for the shared foundation: health, error shape, request IDs, deps, connect() and the catalog.

Owns: proof that the plumbing under every M6 route matches Express before any route exists.
Request path: covers each layer on its own: middleware and handlers (via HTTP), deps and SQL
(called directly with a connection), and the catalog. Expected messages are written out as literals
copied from CONTRACT.md, so a typo in a constant in app/ fails here.
"""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.catalog import get_catalog
from app.db import connect
from app.deps import current_traveller, load_group, require_member
from app.errors import ApiError, install_error_handlers
from app.main import app, request_id_middleware


@pytest.fixture
def client() -> Iterator[TestClient]:
    """Yield a client for the real app; `with` runs the lifespan, so startup is tested too."""
    with TestClient(app) as client:
        yield client


def assert_api_error(exc: pytest.ExceptionInfo[ApiError], status: int, message: str) -> None:
    """Check an ApiError carries the contract's status and exact message."""
    assert (exc.value.status, exc.value.message) == (status, message)


# ---------- HTTP: health, 404, request IDs, 500 ----------

def test_health_matches_express(client: TestClient) -> None:
    """GET /api/health returns Express's {"ok": true} (server.ts:63)."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_unknown_route_is_express_404_with_request_id(client: TestClient) -> None:
    """An unknown path gets Express's catch-all 404 body (server.ts:336) and a request ID."""
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json() == {"error": "Not found."}
    assert response.headers["x-request-id"]


def test_wrong_method_is_404_not_405(client: TestClient) -> None:
    """A wrong method on a known path is 404, never FastAPI's 405 (server.ts:336)."""
    # Express has no 405: a POST to a GET-only path falls through to its catch-all 404.
    response = client.post("/api/health")
    assert response.status_code == 404
    assert response.json() == {"error": "Not found."}


def test_safe_request_id_is_echoed(client: TestClient) -> None:
    """A short, plain X-Request-ID from the caller is echoed back unchanged."""
    response = client.get("/api/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["x-request-id"] == "abc-123"


def test_unsafe_request_id_is_replaced(client: TestClient) -> None:
    """An ID that is too long to log safely is replaced with a generated one."""
    response = client.get("/api/health", headers={"X-Request-ID": "x" * 65})
    assert response.headers["x-request-id"] != "x" * 65


def test_unexpected_error_is_generic_500_with_request_id() -> None:
    """A crash returns the contract's generic 500, hides the detail, and still has a request ID."""
    # A small app with the real handlers and middleware, plus a route that crashes.
    crash_app = FastAPI()
    install_error_handlers(crash_app)
    crash_app.middleware("http")(request_id_middleware)

    @crash_app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret detail that must not reach the client")

    response = TestClient(crash_app, raise_server_exceptions=False).get("/boom")
    assert response.status_code == 500
    assert response.json() == {"error": "Something went wrong on our side."}
    assert response.headers["x-request-id"]


# ---------- deps: identity (401), group (404), membership (403) ----------

def test_missing_traveller_header_is_401(conn: sqlite3.Connection) -> None:
    """No x-traveller-id header is a 401 (CONTRACT.md check 1)."""
    with pytest.raises(ApiError) as exc:
        current_traveller(None, conn)
    assert_api_error(exc, 401, "Sign up or pick your profile first.")


def test_unknown_traveller_is_401(conn: sqlite3.Connection) -> None:
    """An ID that is not in travellers is the same 401 (CONTRACT.md check 1)."""
    with pytest.raises(ApiError) as exc:
        current_traveller("T-999", conn)
    assert_api_error(exc, 401, "Sign up or pick your profile first.")


def test_known_traveller_returns_their_row(conn: sqlite3.Connection) -> None:
    """A known ID returns that traveller's row from travellers."""
    row = current_traveller("T-001", conn)
    assert (row["id"], row["name"]) == ("T-001", "Sarah Thomas")


def test_unknown_group_is_404(conn: sqlite3.Connection) -> None:
    """A group ID that does not exist is a 404 (CONTRACT.md check 2)."""
    with pytest.raises(ApiError) as exc:
        load_group("G-99", conn)
    assert_api_error(exc, 404, "Group not found.")


def test_group_members_follow_position(conn: sqlite3.Connection) -> None:
    """member_ids come back in group_members.position order (CONTRACT.md "Members")."""
    group = load_group("G-01", conn)
    assert group["id"] == "G-01"
    assert group["member_ids"] == ["T-001", "T-002"]


def test_non_member_is_403(conn: sqlite3.Connection) -> None:
    """A traveller outside the group is a 403 (CONTRACT.md check 3)."""
    group = load_group("G-01", conn)
    with pytest.raises(ApiError) as exc:
        require_member(group, current_traveller("T-003", conn))
    assert_api_error(exc, 403, "Only group members can do this.")


def test_member_passes(conn: sqlite3.Connection) -> None:
    """A member passes the membership check (CONTRACT.md check 3)."""
    group = load_group("G-01", conn)
    assert require_member(group, current_traveller("T-002", conn)) is None


# ---------- connect() and the catalog ----------

def test_connect_never_creates_a_missing_db(tmp_path: Path) -> None:
    """connect() raises on a missing file and leaves no empty app.db behind (mode=rw)."""
    missing = tmp_path / "app.db"
    with pytest.raises(sqlite3.OperationalError):
        connect(missing)
    assert not missing.exists()


def test_catalog_counts() -> None:
    """The catalog loads every hotel, room and night from the data pack."""
    get_catalog.cache_clear()
    catalog = get_catalog()
    assert len(catalog.hotels) == 49
    assert len(catalog.rooms) == 125
    assert len(catalog.rooms_left) == 2500
