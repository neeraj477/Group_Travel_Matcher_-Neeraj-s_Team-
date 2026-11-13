# API Contract: Common Group Page (M6)

Source of truth for the three M6 endpoints. Copied from Neeraj's Express backend at `main` 4079631 (`backend/src/server.ts` lines 243–315, `backend/src/hotels.ts`). The FastAPI version on :8000 must return the **same status codes and the same JSON** (compared as parsed JSON) for the same database state. Changed only when Abhay and Neeraj both agree.

## Ownership

| Endpoint | Today | Target |
|---|---|---|
| `GET /api/groups/:id/hotels` | Express :4000 | FastAPI :8000 |
| `POST /api/groups/:id/saved` | Express :4000 | FastAPI :8000 |
| `POST /api/groups/:id/booking` | Express :4000 | FastAPI :8000 |

- Vite proxies only these three paths to :8000; everything else under `/api` and `/images` stays on :4000. The Express versions stay until the FastAPI versions pass the smoke test.
- FastAPI is the only writer to `saved_options` and `bookings`. One exception: the booking transaction also sets the group's `PENDING` join requests to `CLOSED`, so booking and closing are atomic. Express's request and approve endpoints refuse once a booking exists (`server.ts` 180, 222).
- **Schema owner: `backend/src/db.ts`.** FastAPI creates, alters and seeds no tables. It reads and writes the existing tables exactly as `db.ts` defines them. Express must start first so `app.db` exists.
- **Catalog:** FastAPI reads `data/catalog/hotels.json`, `rooms.json` and `availability.json` read-only at startup, as `catalog.ts` does. The catalog is not in the database.

## Shared conventions (same as the rest of the Express API)

- **Identity:** request header `x-traveller-id: T-001`. A missing header or an unknown traveller → `401 {"error": "Sign up or pick your profile first."}`.
- **Error body:** `{"error": "<message for the user>"}` with no other fields on these three endpoints. The frontend shows `error` as-is, so the messages below are part of the contract, character for character.
- **Unexpected failure:** `500 {"error": "Something went wrong on our side."}`. Details go to the server log, never to the client.
- **Success status:** always `200`, including the booking (Express default; not 201).
- **Checks run in this order**, and the first failure wins:
  1. identity (401)
  2. group exists (404 `"Group not found."`)
  3. caller is a member (403 `"Only group members can do this."`)
  4. endpoint-specific checks, below
- **Members:** `group_members` ordered by `position`. `guests` = number of members.
- **Nights:** `check_in` up to the day before `check_out`, as `YYYY-MM-DD` strings.

## Pricing rules (shared by all three endpoints)

For one room type and one group:

| Field | Rule |
|---|---|
| `rooms_needed` | `ceil(members / max_adults)` |
| `nights` | number of nights |
| `total_inr` | `price_per_night × rooms_needed × nights` (integer) |
| `per_member_inr` | `total_inr / members`, **not rounded** (e.g. `7933.333…`); the frontend rounds for display |
| rooms left on a night | catalog `rooms_left` for that room and date (`0` if the date is missing) **minus** the sum of `bookings.rooms` over every booking of that room (any group) whose `nights` list contains that date |
| `available` | true if rooms left ≥ `rooms_needed` on every night |
| `min_rooms_left` | `max(0, smallest rooms left over the nights)` |
| `full_on` | the first night (in date order) where rooms left < `rooms_needed`, else `null` |

**Shares** (used by booking): split `total_inr × 100` paise equally across members in `position` order. The first `(total_paise mod members)` members get one extra paisa, so the shares always add up to the total.

---

## 1. `GET /api/groups/:id/hotels?sort=&max_pp=`

**Query**
- `sort`: `rating` | `stars` | anything else, including missing, means per-person price.
- `max_pp`: a number. If it's missing, `0` or not a number, there's no filter.

**Response 200**
```json
{
  "guests": 2,
  "nights": 5,
  "lowest_budget": 60000,
  "results": [HotelResult],
  "saves": {"RM-KYO-001-A": ["T-001", "T-002"]},
  "booking": Booking | null
}
```
- `lowest_budget`: the smallest of the group's `budget_inr` and the `budget_inr` of the saved search behind every `APPROVED` join request of this group. Seeded members have no search, so they don't count.
- `saves`: for this group, each `room_id` → traveller IDs who saved it, ordered by `saved_options.created_at`. Rooms nobody saved are absent.
- `booking`: the group's booking as in section 3, else `null`.

**HotelResult**: one per hotel in the group's city, starting from `hotels.json` file order.
```json
{
  "hotel": {"hotel_id": "HTL-KYO-001", "name": "Gion Corner Hotel", "area": "Gion", "stars": 3,
            "rating": 7.8, "lat": 35.0037, "lng": 135.7788, "image": "images/hotels/HOTEL-BUSINESS-1.jpg"},
  "best": RoomOption | null,
  "options": [RoomOption],
  "unavailable_reason": null
}
```
- `options`: every room type of the hotel (`rooms.json` order), then stable-sorted: available first, then `total_inr` ascending.
- `best`: the first available option, else `null`.
- `unavailable_reason`: `null` when `best` exists. Otherwise `"Full on 12 Apr — not bookable for your dates"`, where the date is the earliest `full_on` across the options, formatted as the day number without a leading zero plus a 3-letter month. Note the em dash. If no option has a `full_on`, the text is `"Full on your dates — not bookable for your dates"`.

**RoomOption**
```json
{"room_id": "RM-KYO-001-A", "room_name": "Twin Room", "room_type": "TWIN", "max_adults": 2,
 "price_per_night": 4760, "refundable": true, "rooms_needed": 1, "nights": 5,
 "total_inr": 23800, "per_member_inr": 11900, "available": true, "min_rooms_left": 2, "full_on": null}
```

**Ordering of `results`** (stable, so ties keep the previous order):
1. Hotels with a `best` come before hotels without one.
2. Then by `sort`:
   - `rating`: `hotel.rating` descending.
   - `stars`: `hotel.stars` descending, then `best.per_member_inr` ascending.
   - default: `best.per_member_inr` ascending.
   - Hotels without `best` count as infinitely expensive.
3. Then `max_pp` filtering: drop hotels whose `best.per_member_inr > max_pp`. Hotels without `best` are kept.

**Errors:** 401, 404, 403 as above.

---

## 2. `POST /api/groups/:id/saved`

**Body:** `{"room_id": "RM-KYO-001-A"}`

It's a **toggle**. If this traveller already saved this room for this group, the save is removed; otherwise it's added.

When adding, insert into `saved_options`: `group_id`, `traveller_id`, `room_id`, plus `rooms`, `total_inr` and `per_member_inr` priced for the group right now. `created_at` takes the table default. Availability is **not** checked; an unavailable room can be saved.

**Response 200:**
```json
{"saved": true, "saves": {"RM-KYO-001-A": ["T-001"]}}
```
- `saved` is true if the room is saved after this call.
- `saves` has the same shape as in section 1.

**Errors, after the shared checks:**

| Status | Body | When |
|---|---|---|
| 409 | `{"error": "The booking is locked."}` | the group has a booking |
| 400 | `{"error": "Pick a room in the group's city."}` | `room_id` is missing, unknown, or in another city |

---

## 3. `POST /api/groups/:id/booking`

**Body:** `{"room_id": "RM-KYO-001-A"}`

**Behaviour**, all in one transaction:
1. Price the room for the group as in the pricing rules, with rooms left including every existing booking.
2. Insert into `bookings`:
   - `id`: `TM-XXXX-XXXX`, where each X is a cryptographically random character from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
   - `group_id`, `hotel_id`, `room_id`, `rooms` = `rooms_needed`.
   - `nights` = JSON text of the night list, e.g. `["2027-04-10", …, "2027-04-14"]`.
   - `total_inr`.
   - `shares` = JSON text `[{"traveller_id": "T-001", "amount_paise": 1190000}, …]`.
   - `booked_by` = caller.
   - `created_at` takes the table default (`datetime('now')`, format `YYYY-MM-DD HH:MM:SS`, UTC). **Don't write it yourself**: the frontend parses this exact format.
3. Set every `PENDING` join request of this group to `CLOSED`, with `decided_at = datetime('now')`, in the same transaction.

**Response 200: Booking**
```json
{
  "id": "TM-7QK2-M9XA",
  "hotel": {"hotel_id": "HTL-KYO-001", "name": "Gion Corner Hotel", "area": "Gion", "stars": 3,
            "image": "images/hotels/HOTEL-BUSINESS-1.jpg"},
  "room": {"room_id": "RM-KYO-001-A", "name": "Twin Room", "max_adults": 2},
  "rooms": 1,
  "nights": ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14"],
  "total_inr": 23800,
  "created_at": "2026-11-13 15:10:00",
  "booked_by": "T-002",
  "shares": [{"traveller_id": "T-001", "amount_paise": 1190000, "name": "Sarah Thomas"},
             {"traveller_id": "T-002", "amount_paise": 1190000, "name": "Priya Shah"}]
}
```

**Errors, after the shared checks:**

| Status | Body | When |
|---|---|---|
| 409 | `{"error": "This group already has a booking. It's locked and can't be changed."}` | the group has a booking |
| 400 | `{"error": "Pick a room in the group's city."}` | `room_id` is missing, unknown, or in another city |
| 409 | `{"error": "Not enough rooms are free on every night of your stay any more."}` | `available` is false |

**Must hold under concurrency.** Two booking requests at the same moment must not double-book a group or push any night's rooms left below 0. The loser gets the matching 409 above, never a 500. FastAPI does the availability check and the insert inside `BEGIN IMMEDIATE`. `bookings.group_id` is UNIQUE, so a conflict must map to the "already has a booking" 409.

---

## Decisions

1. **Booking closes pending requests in the same transaction** (agreed 13 Nov). If booking and closing were separate, a crash between them would leave a booked group showing live pending badges. This is the single exception to FastAPI writing only `saved_options` and `bookings`.

## Smoke test (parity)

Use the same DB state, run each case against :4000 and :8000, and compare the parsed JSON and status codes. Remember the booking ID and `created_at` differ by design.
1. A non-member reads hotels → 403.
2. G-01 with 1 member: hotels with `sort` default, `rating`, `stars`, and `max_pp=5000`.
3. Save, then save the same room again (the toggle goes back).
4. Save a room in another city → 400.
5. Book an available room → 200, with shares summing to `total_inr × 100`.
6. Book again → 409 "already has a booking".
7. Save after booking → 409 "The booking is locked."

## Change log

- 13 Nov: copied from Express at 4079631 (Abhay). Decision 1 agreed by Abhay; Neeraj to confirm.
