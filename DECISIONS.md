# Decisions

One line per decision: what · options · why · who

- M6 backend (hotels, saved, booking) rebuilt in FastAPI on :8000 with the same URLs and JSON; the Express version stays until parity passes · keep Express only vs move M6 · Abhay owns and can explain the money and concurrency logic in Python; the frontend is unchanged · Abhay + Neeraj
- backend/src/db.ts is the only schema owner; booking-service creates and seeds nothing · two schemas vs one owner · two definitions of the same tables drift · Abhay + Neeraj
- Booking closes PENDING join requests in the same transaction · Express does it vs booking-service does it · booking and closing must be atomic, or a crash leaves a booked group with live pending badges · Abhay + Neeraj
- Booking check-and-insert runs inside BEGIN IMMEDIATE · plain inserts vs a write lock · two groups booking the last room at once must not both succeed · Abhay
- Catalog stays in data/ JSON, loaded read-only at startup by both backends · copy into SQLite vs read JSON · matches catalog.ts; the data files are never written · Abhay + Neeraj
- Python service folder named booking-service · group-service vs booking-service · it owns the Common Group Page booking flow, not groups · Abhay
- Search cost preview reuses one pure pricing module (pricing.ts) shared with /hotels, priced on the group's dates, per_member_inr left unrounded as in CONTRACT.md · separate preview maths vs shared function · the match card must always equal the group page · Neeraj
- Members can leave a group before booking (not the owner); bell notes stored in a new notifications table; a leaver's saved_options rows are kept but hidden by reading saves and budgets for current members only · delete their saves vs filter on read · Express must not write saved_options (CONTRACT.md); the new table is additive and booking-service never touches it · Neeraj (Abhay to confirm the schema addition and the /hotels saves filter)
- A member may also leave after booking; the booking row (room, total, shares) is left exactly as booked and the leaver's share is shown as "left the group" · block leaving vs re-split shares vs keep booking unchanged · re-splitting would mean Express writing bookings, which CONTRACT.md gives to booking-service · Neeraj
