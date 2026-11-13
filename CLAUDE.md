# Tripmate: Group Travel Matcher (Embark Hackathon, Problem 3)

## Layout
- backend/          Express + TypeScript :4000. Owner: Neeraj. Owns the DB schema (src/db.ts) and every API
                    endpoint except the three below.
- booking-service/  Python FastAPI :8000. Owner: Abhay. Owns GET /api/groups/:id/hotels,
                    POST /api/groups/:id/saved and POST /api/groups/:id/booking.
- frontend/         React + Vite :3000. Owner: Neeraj. Vite proxies those three paths to :8000, the rest of /api to :4000.
- data/, images/    Read-only data pack. Never modify.
- app.db            One SQLite file (WAL). Schema created only by backend/src/db.ts.

## Rules
- CONTRACT.md is the source of truth for the three M6 endpoints. Change it only when both owners agree.
- Schema changes happen only in backend/src/db.ts, and only after both owners agree.
- booking-service writes only saved_options and bookings, plus closing PENDING join_requests inside the
  booking transaction. backend never writes those two tables once booking-service owns them.
- The two backends never call each other.
- The app must not call any AI or LLM model.
- Stay inside your own folder; each service folder has its own CLAUDE.md.
- Log design decisions as one line in DECISIONS.md: what · options · why · who.
- Never commit node_modules, .venv, dist, app.db* or .env.
