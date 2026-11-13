# Decisions

One line per decision: what · options · why · who

- M6 backend (hotels, saved, booking) rebuilt in FastAPI on :8000 with the same URLs and JSON; the Express version stays until parity passes · keep Express only vs move M6 · Abhay owns and can explain the money and concurrency logic in Python; the frontend is unchanged · Abhay + Neeraj
- backend/src/db.ts is the only schema owner; booking-service creates and seeds nothing · two schemas vs one owner · two definitions of the same tables drift · Abhay + Neeraj
- Booking closes PENDING join requests in the same transaction · Express does it vs booking-service does it · booking and closing must be atomic, or a crash leaves a booked group with live pending badges · Abhay + Neeraj
- Booking check-and-insert runs inside BEGIN IMMEDIATE · plain inserts vs a write lock · two groups booking the last room at once must not both succeed · Abhay
- Catalog stays in data/ JSON, loaded read-only at startup by both backends · copy into SQLite vs read JSON · matches catalog.ts; the data files are never written · Abhay + Neeraj
- Python service folder named booking-service · group-service vs booking-service · it owns the Common Group Page booking flow, not groups · Abhay
