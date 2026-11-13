from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import connect, db_path, init_db
from app.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Schema and seed run before the first request, so routes can assume the tables exist.
    conn = connect(db_path())
    try:
        init_db(conn)
        seed(conn)
    finally:
        conn.close()
    yield


app = FastAPI(title="group-service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
