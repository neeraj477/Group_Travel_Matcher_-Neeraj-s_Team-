"""Error responses in Express's exact shape.

Owns: ApiError and every exception handler. The frontend shows {"error": "..."} to the user as-is,
so the body must be exactly that one field, never FastAPI's {"detail": ...}.
Request path: route → deps → pricing → SQL. Any of those steps can raise ApiError; the handlers
here turn it into the response. Mirrors server.ts lines 17 (HttpError) and 335–342 (error handlers).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("booking")

NOT_FOUND_MESSAGE = "Not found."
INTERNAL_ERROR_MESSAGE = "Something went wrong on our side."


class ApiError(Exception):
    """An expected failure with a contract status and user-facing message (Express's HttpError, server.ts:17)."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def error_response(status: int, message: str) -> JSONResponse:
    """Return the contract's error body: exactly {"error": message}, no other fields."""
    return JSONResponse(status_code=status, content={"error": message})


def internal_error_response() -> JSONResponse:
    """Return the contract's 500. Details stay in the server log, never in the body (server.ts:340–341)."""
    return error_response(500, INTERNAL_ERROR_MESSAGE)


async def handle_api_error(_request: Request, exc: Exception) -> JSONResponse:
    """Return an ApiError's status and message (server.ts:339)."""
    assert isinstance(exc, ApiError)
    return error_response(exc.status, exc.message)


async def handle_http_exception(_request: Request, exc: Exception) -> JSONResponse:
    """Return 404 "Not found." for an unknown path or method, as Express's catch-all does (server.ts:336).

    Starlette answers a known path with the wrong method with 405. Express has no 405: the request
    simply matches no route and falls through to the 404, so we do the same.
    """
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code in (404, 405):
        return error_response(404, NOT_FOUND_MESSAGE)
    # No other HTTPException is expected from our routes; treat one as a bug, not a client error.
    logger.error("unexpected HTTPException %s: %s", exc.status_code, exc.detail)
    return internal_error_response()


async def handle_validation_error(_request: Request, exc: Exception) -> JSONResponse:
    """Return the contract's 500 instead of FastAPI's 422.

    Routes declare every input as an optional raw string and read the JSON body themselves, the way
    Express treats req.body ?? {}, so FastAPI's validation can only fail if a route declares a typed
    parameter by mistake. That is our bug, so it is logged and answered like any other bug.
    """
    logger.error("request validation failed (a route declared a typed parameter?): %s", exc)
    return internal_error_response()


async def handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
    """Return the contract's 500 with the traceback logged (server.ts:340–341).

    Fallback only: the request-ID middleware in main.py normally catches the exception first, so the
    500 still carries an X-Request-ID.
    """
    logger.error("unhandled error", exc_info=exc)
    return internal_error_response()


def install_error_handlers(app: FastAPI) -> None:
    """Register every handler above on the app. A function so tests can build a small app with the same handlers."""
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected)
