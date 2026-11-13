# Tripmate: Group Travel Matcher (Neeraj's Team)

Solo travellers either post a group trip or search for one. The app shows only the groups that pass all 6 matching rules, explains why each one matches, and lets the owner approve join requests. Members then compare hotels together, see the cost per person, and lock in a single booking for the group.

## Quick start

Requires Node.js 20+.

```bash
npm install     # installs root, backend/ and frontend/
npm run dev     # API on http://localhost:4000, app on http://localhost:3000
```

Open **http://localhost:3000**.

| Command | What it does |
|---|---|
| `npm test` | Matching-rule tests, including the data-dictionary examples (Priya's search returns exactly G-01 and G-08) |
| `npm run typecheck` | Type-checks the backend and frontend |
| `npm run reset-db` | Deletes `app.db`. On the next start it is re-seeded with the 24 travellers and 12 groups (use this before a demo) |

### Demo tips
- **Act as an existing traveller:** on the sign-up page, click *Already joined? Pick your profile* and choose, for example, Sarah Thomas (T-001) or Priya Shah (T-002).
- **Two users at once:** your identity is stored per browser, so use a normal window for one person and a private window for the other.

## Architecture

```
frontend/  React + Vite + TypeScript (port 3000)  ── /api, /images proxied ──►  backend/  Express + TypeScript (port 4000)
                                                                                   │
                                     data/ (read-only JSON from the data pack) ◄───┤
                                     app.db (SQLite via better-sqlite3)        ◄───┘
```

- **The backend holds all the logic:** the 6 rules, scoring and ranking, near-miss suggestions, approvals, hotel availability, pricing and the cost split. The frontend only calls the API and never reads `data/`.
- **Catalog files stay read-only.** They are loaded into memory at startup. Our own data lives in SQLite (`app.db`): travellers, groups, members, searches, join requests, saved hotel options, bookings and chat messages. The 24 travellers and 12 groups are copied into the database on the first start, so state survives a page refresh and a backend restart.
- **Identity:** name-only (M1). The chosen traveller id is kept in `localStorage` and sent in an `x-traveller-id` header.

| File | Responsibility |
|---|---|
| `backend/src/rules.ts` | Date maths, input validation (5 cities, 1–20 Apr 2027), the 6 rules, score, near-miss fixes |
| `backend/src/hotels.ts` | Rooms needed, availability on every night, totals, the per-member split in paise |
| `backend/src/server.ts` | REST API |
| `backend/src/db.ts` | Schema and seeding |
| `frontend/src/pages/*` | Screens 01–06 from the UI design, plus My groups and traveller profiles |

### Matching (backend/src/rules.ts)
A group is shown only if all 6 rules pass:

1. **Same city.**
2. **At least 2 shared nights.** The check-out day is not a night.
3. **Budget gap at most 40% of the lower budget.** Compared with integers, so exactly 40% passes.
4. **At least 2 interests shared with the owner.**
5. **Gender preference, checked both ways.**
6. **Room in the group:** members + 1 ≤ max size.

Groups the seeker is already in, and groups that have already booked (locked), are not listed.

**Score (0–100)** is a weighted mix of three parts:
- 40%: the share of the seeker's interests that the owner also has.
- 30%: shared nights as a share of the shorter stay.
- 30%: budget closeness, 1 at the same budget and 0 at the 40% limit.

**Ranking:** by score. Ties go to more shared nights, then the earliest check-in, then the group id.

**Near misses:** groups that fail exactly one fixable rule (dates, budget or interests) appear under *Almost a match*, with a one-click fix that re-runs the search.

### Hotels and cost (backend/src/hotels.ts)
- Rooms needed = ceil(members ÷ `max_adults`).
- A room type is bookable only if `rooms_left`, minus the rooms our own bookings have taken, is at least the rooms needed on **every** night.
- Total = price × rooms × nights. Per member = total ÷ members.
- The booking split is calculated in paise, with any leftover paisa going to the first members, so the shares always add up to the total.
- Example from the data dictionary: G-01 with 2 members in the Gion Corner Twin Room costs ₹23,800 in total, ₹11,900 each.

## What's finished

| ID | Feature | Status |
|---|---|---|
| M1 | Sign up, or pick an existing profile; saved on the server | ✅ |
| M2 | Group post form with live preview; city and dates validated against the data, with clear errors | ✅ |
| M3 | Search by home city, destination, dates, budget, interests and gender preference | ✅ |
| M4 | Matches showing all 6 rules with real values, score ring, date-overlap timeline and owner name | ✅ |
| M5 | "I'm interested" request (re-checked on the server). The owner gets a notification badge, sees the same 6-rule check, and approves or declines. When the group fills up, the remaining requests close | ✅ |
| M6 | Common Group Page: stays for the group's city and dates with total and per-person cost, save and compare with group alignment, map from hotel lat/lng, confirm popup, then one locked booking with the cost split | ✅ |
| G1 | Filter results by shared interests and group mix (all women / all men / mixed), plus sort | ✅ |
| G2 | Member profile pages: interests, home city, age and groups | ✅ |
| S1 | Group chat on the group page (polling) | ✅ |

## Known limitations
- No real authentication, by design (M1). Anyone can pick any profile.
- Chat and saves refresh by polling every 4–6 seconds, not over websockets.
- Hotel cards use illustrated scenes from the UI design rather than the photos in `images/`. The photos are still served by the API at `/images/...`.
- Gender values follow the data (`FEMALE` / `MALE`).

## Data
`data/` and `images/` are copied unchanged from the hackathon data pack. `DATA_DICTIONARY.md` explains them. Photo credits are in `images/ATTRIBUTIONS.md`.

---

## Team notes

### Clone and set your identity
```bash
git clone https://github.com/neeraj477/Group_Travel_Matcher_-Neeraj-s_Team-.git
cd Group_Travel_Matcher_-Neeraj-s_Team-
git config user.name "<Your Name>"
git config user.email "<your GitHub email or noreply address>"
```

### Rules
- Keep the repo **private** until submission.
- Run `git pull --rebase` before every push.
- Never commit `node_modules`, `dist`, `.next` or `app.db`.
- Write your own commit messages, because the Git history is judged.
- Push every hour.

### Milestones
- **Gate 1 (14:00):** Priya's search shows exactly `G-01` and `G-08` in the browser. This is covered by `npm test` and verified in the UI.
