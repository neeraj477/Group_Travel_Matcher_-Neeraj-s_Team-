# booking-service (Owner: Abhay)

Python FastAPI service on :8000. Owns exactly three endpoints, defined in ../CONTRACT.md:
GET /api/groups/:id/hotels, POST /api/groups/:id/saved, POST /api/groups/:id/booking.
Goal 1 is PARITY: the same status codes and the same JSON (as parsed JSON) as the Express versions in
../backend/src/server.ts (lines 243–315) and ../backend/src/hotels.ts, for the same DB state.
Read ../CLAUDE.md, ../CONTRACT.md and those two Express files before planning.

## Stack
- Python 3.12, FastAPI, uvicorn, pytest, httpx. sqlite3 and json from the standard library. Raw SQL, no ORM.
- No new libraries without asking me first.

## Run
- Setup: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
- Start: .venv/bin/uvicorn app.main:app --port 8000   (start the Express backend first: it creates app.db)
- Test:  .venv/bin/pytest -q
- DB_PATH defaults to <repo root>/app.db; DATA_DIR defaults to <repo root>/data. Resolve both from __file__.

## Layout (flat)
- app/main.py     FastAPI app, the three routes, error handlers, request-ID middleware
- app/db.py       connect(), get_db dependency (one connection per request)
- app/catalog.py  loads hotels.json, rooms.json and availability.json once, read-only, into dicts
- app/pricing.py  pure functions: rooms_needed, booked_rooms, price_room, split_shares, hotel ordering
- tests/          pytest; tests/schema_from_db_ts.sql is copied verbatim from ../backend/src/db.ts

## Database rules
- NEVER create, alter, drop or seed tables. backend/src/db.ts owns the schema. Use its table and column
  names exactly: travellers.id, groups.id, group_members.position, join_requests.seeker_id, and so on.
- Connection: foreign_keys=ON, busy_timeout=5000, isolation_level=None, row_factory=sqlite3.Row,
  check_same_thread=False.
- Booking (check availability → insert booking → close PENDING requests) runs inside one BEGIN IMMEDIATE.
  Every exit after BEGIN commits or rolls back. A UNIQUE(group_id) conflict becomes the contract's 409, never a 500.
- Never write created_at or saved_options.created_at yourself: the table defaults produce the
  'YYYY-MM-DD HH:MM:SS' format the frontend parses.
- bookings.nights and bookings.shares are JSON text, exactly as Express writes them.
- Always ? parameters. Never build SQL with f-strings.

## Contract rules that are easy to get wrong
- Identity: header x-traveller-id, looked up in travellers. Missing or unknown → 401 with the contract message.
- Error body is {"error": "<message>"}: no codes, no "detail". Messages match CONTRACT.md character for character.
- Override FastAPI's defaults: no 422 validation responses (a missing room_id is the contract's 400), and
  unexpected errors return 500 {"error": "Something went wrong on our side."}.
- Success is always 200. per_member_inr is total / members, NOT rounded.
- Rooms left = catalog rooms_left (0 if the date is missing) minus rooms from every booking, any group, on that night.
- Sorting must be stable and start from hotels.json / rooms.json order, to match JavaScript's stable sort.

## Errors and logs
- Every request gets an X-Request-ID (taken from the header or generated), logged with method, path, status and
  duration. No names or other personal data in logs.

## Code style
- Readable, senior-grade. Plain functions under ~30 lines, type hints, comments explain why. No clever one-liners.
- Business rules live only in pricing.py; routes call it and run SQL.

## How to work with me
- Before writing code, give a plan in 5 bullets and wait for my OK.
- One slice at a time, about 100 lines at most.
- Write tests for a rule before or with its code, including boundaries and the error cases in CONTRACT.md.
- Match CONTRACT.md exactly. If it's unclear, read the Express code; if that's unclear too, ask me.
- Touch only booking-service/ unless I say otherwise.
- Done means pytest passes and the curl in my prompt matches the Express response.
