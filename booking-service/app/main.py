"""The FastAPI app for booking-service.

Owns: the app object, startup, request-ID logging and (in later slices) the three M6 routes.
Request path: middleware → route → deps → pricing → SQL. This module is the outer edge: every
request enters through request_id_middleware and leaves with an X-Request-ID header.
"""

import logging
import re
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response

from app.catalog import get_catalog
from app.errors import install_error_handlers, internal_error_response

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("booking")

# A client-supplied ID is logged verbatim, so only short, plain IDs are trusted. Anything else
# (newlines, spaces, huge values) could forge or flood log lines, and is replaced.
SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Load the catalog before the first request, so a missing data pack fails at startup (as catalog.ts does)."""
    get_catalog()
    yield


def request_id_for(header_value: str | None) -> str:
    """Return the caller's X-Request-ID if it is safe to log, else a fresh random one."""
    if header_value and SAFE_REQUEST_ID.fullmatch(header_value):
        return header_value
    return uuid.uuid4().hex


async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Return the response with X-Request-ID set, logging method, path, status and duration.

    CLAUDE.md "Errors and logs". Only the path is logged: no query string, headers or names.
    """
    request_id = request_id_for(request.headers.get("x-request-id"))
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # Starlette runs the catch-all Exception handler OUTSIDE user middleware, so without this
        # catch a 500 would skip this function: no X-Request-ID header and no log line.
        logger.exception("unhandled error request_id=%s", request_id)
        response = internal_error_response()
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "%s %s %d %.1fms request_id=%s",
        request.method, request.url.path, response.status_code, elapsed_ms, request_id,
    )
    return response


# docs/redoc/openapi off: Express has no such routes, so /docs must be the same 404 as any unknown path.
app = FastAPI(
    title="booking-service", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
)
install_error_handlers(app)
app.middleware("http")(request_id_middleware)


@app.get("/api/health")
def health() -> dict[str, bool]:
    """Return {"ok": true}, the same as Express (server.ts:63)."""
    return {"ok": True}
