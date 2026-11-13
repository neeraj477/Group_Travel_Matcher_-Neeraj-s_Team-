// Booking confirmation PDF (A4), built in the browser from data the group page already has.
// jsPDF is imported lazily by the caller, so it only downloads when someone clicks "Download".
// The built-in PDF fonts have no ₹ glyph, so amounts are written as "INR 23,800.00".
import type { jsPDF as JsPDF } from "jspdf";
import { dLong, type Booking, type GroupDetail } from "./api";

const W = 210, H = 297, M = 18;               // A4 in mm, side margin
const INK: RGB = [24, 26, 32], MUTED: RGB = [110, 114, 124], LINE: RGB = [222, 224, 228];
const DARK: RGB = [20, 22, 28], GOLD: RGB = [184, 134, 59], GREEN: RGB = [22, 140, 96], SHADE: RGB = [246, 246, 248];
type RGB = [number, number, number];

const money = (inr: number) => "INR " + inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** bookings.created_at is SQLite datetime('now'): "YYYY-MM-DD HH:MM:SS" in UTC. */
function stamp(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return sqlUtc;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export async function downloadBookingPdf(b: Booking, g: GroupDetail): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const people = new Map(g.members.map((m) => [m.id, m]));
  const nameOf = (id: string) => people.get(id)?.name ?? b.shares.find((s) => s.traveller_id === id)?.name ?? id;
  const userOf = (id: string) => (people.get(id)?.username ? "@" + people.get(id)!.username : "-");
  const nights = b.nights.length;
  const ratePerRoomNight = b.total_inr / (b.rooms * nights);

  doc.setProperties({ title: `Tripmate booking ${b.id}`, subject: "Booking confirmation", creator: "Tripmate" });

  // ---------- header band ----------
  fill(doc, DARK); doc.rect(0, 0, W, 44, "F");
  fill(doc, GOLD); doc.rect(0, 44, W, 1.2, "F");
  text(doc, "TRIPMATE", M, 19, { size: 20, style: "bold", color: [255, 255, 255], spacing: 1.2 });
  text(doc, "Group Travel Matcher", M, 26, { size: 9, color: [190, 192, 200] });
  text(doc, "BOOKING CONFIRMATION", W - M, 15, { size: 8.5, style: "bold", color: GOLD, align: "right" });
  text(doc, "Booking number", W - M, 24, { size: 8, color: [190, 192, 200], align: "right" });
  doc.setFont("courier", "bold"); doc.setFontSize(17); doc.setTextColor(255, 255, 255);
  doc.text(b.id, W - M, 33, { align: "right" });

  // ---------- status strip ----------
  let y = 56;
  fill(doc, GREEN); doc.roundedRect(M, y - 5, 27, 7.5, 1.5, 1.5, "F");
  text(doc, "CONFIRMED", M + 13.5, y + 0.3, { size: 8, style: "bold", color: [255, 255, 255], align: "center", spacing: 0.4 });
  text(doc, "Locked: the room and the cost split can no longer be changed.", M + 31, y, { size: 8.5, color: MUTED });

  y += 10;
  y = keyValues(doc, y, [
    ["Issued", stamp(b.created_at)],
    ["Booked by", `${nameOf(b.booked_by)} (${userOf(b.booked_by)})`],
    ["Group", `${g.name} (${g.id})`],
    ["Destination", `${g.city}, ${g.country}`],
  ]);

  // ---------- stay details ----------
  y = section(doc, y + 2, "Stay details");
  y = keyValues(doc, y, [
    ["Hotel", b.hotel.name],
    ["Area · rating", `${b.hotel.area}, ${g.city} · ${b.hotel.stars}-star`],
    ["Room type", `${b.room.name} (sleeps up to ${b.room.max_adults})`],
    ["Rooms", String(b.rooms)],
    ["Check-in", dLong(g.check_in)],
    ["Check-out", dLong(g.check_out)],
    ["Guests", String(b.shares.length)],
    ["Length of stay", `${nights} night${nights === 1 ? "" : "s"}`],
  ]);

  // ---------- charges ----------
  y = section(doc, y + 2, "Charges");
  y = table(doc, y, [
    { head: "Description", w: 70 }, { head: "Rooms", w: 15, align: "right" }, { head: "Nights", w: 15, align: "right" },
    { head: "Rate / room / night", w: 36, align: "right" }, { head: "Amount", w: W - 2 * M - 136, align: "right" },
  ], [[`${b.room.name}, ${b.hotel.name}`, String(b.rooms), String(nights), money(ratePerRoomNight), money(b.total_inr)]]);
  y = totalRow(doc, y, "Group total", money(b.total_inr));

  // ---------- cost split ----------
  y = section(doc, y + 6, "Cost split per traveller");
  const rows = b.shares.map((s, i) => [
    String(i + 1), s.name, userOf(s.traveller_id), people.has(s.traveller_id) ? "Member" : "Left the group", money(s.amount_paise / 100),
  ]);
  y = table(doc, y, [
    { head: "#", w: 10 }, { head: "Traveller", w: 58 }, { head: "Username", w: 44 }, { head: "Status", w: 30 },
    { head: "Share", w: W - 2 * M - 142, align: "right" },
  ], rows);
  const paid = b.shares.reduce((n, s) => n + s.amount_paise, 0);
  y = totalRow(doc, y, `Total of ${b.shares.length} shares`, money(paid / 100));

  // ---------- notes ----------
  y = section(doc, y + 6, "Notes");
  const notes = [
    `Nights covered: ${b.nights.map((n) => dLong(n).replace(",", "").replace(/ \d{4}$/, "")).join("  ·  ")}.`,
    "Shares are calculated in paise and always add up to the group total. Any leftover paisa goes to the first members in joining order.",
    "A traveller who left the group after booking keeps their share on this booking.",
    "Present this booking number at check-in. Hotel check-in and check-out times follow the hotel's own policy.",
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); color(doc, MUTED);
  for (const n of notes) {
    const lines = doc.splitTextToSize(n, W - 2 * M - 5) as string[];
    y = ensureRoom(doc, y, lines.length * 4.2 + 2);
    doc.text("•", M, y); doc.text(lines, M + 4, y);
    y += lines.length * 4.2 + 1.5;
  }

  footer(doc, b.id);
  doc.save(`Tripmate-Booking-${b.id}.pdf`);
}

// ---------- drawing helpers ----------
function fill(doc: JsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function color(doc: JsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }
/** Trims text to fit a width (in the current font), ending with "..." so a cut is visible. */
function fit(doc: JsPDF, s: string, maxW: number): string {
  if (doc.getTextWidth(s) <= maxW) return s;
  while (s.length > 1 && doc.getTextWidth(s + "...") > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "...";
}
function text(doc: JsPDF, s: string, x: number, y: number, o: { size?: number; style?: string; color?: RGB; align?: "left" | "right" | "center"; spacing?: number; maxW?: number } = {}) {
  doc.setFont("helvetica", o.style ?? "normal"); doc.setFontSize(o.size ?? 9.5); color(doc, o.color ?? INK);
  if (o.maxW) s = fit(doc, s, o.maxW);
  // jsPDF measures alignment without letter spacing, so spacing is only applied to left-aligned text.
  doc.text(s, x, y, { align: o.align ?? "left", charSpace: (o.align ?? "left") === "left" ? o.spacing ?? 0 : 0 });
}
/** Starts a new page when the next block wouldn't fit above the footer. */
function ensureRoom(doc: JsPDF, y: number, need: number): number {
  if (y + need <= H - 21) return y;
  doc.addPage();
  return 22;
}
function section(doc: JsPDF, y: number, title: string): number {
  y = ensureRoom(doc, y, 20);
  text(doc, title.toUpperCase(), M, y, { size: 8.5, style: "bold", color: GOLD, spacing: 0.8 });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, y + 2.5, W - M, y + 2.5);
  return y + 9;
}
/** Two-column label/value list. */
function keyValues(doc: JsPDF, y: number, pairs: [string, string][]): number {
  const colW = (W - 2 * M) / 2;
  pairs.forEach(([k, v], i) => {
    const x = M + (i % 2) * colW, row = y + Math.floor(i / 2) * 10;
    text(doc, k, x, row, { size: 7.5, color: MUTED });
    text(doc, v, x, row + 4.6, { size: 9.5, style: "bold", maxW: colW - 4 });
  });
  return y + Math.ceil(pairs.length / 2) * 10;
}
type Col = { head: string; w: number; align?: "left" | "right" };
function table(doc: JsPDF, y: number, cols: Col[], rows: string[][]): number {
  const cell = (c: Col, x: number) => (c.align === "right" ? x + c.w - 2 : x + 2);
  const head = (yy: number) => {
    fill(doc, SHADE); doc.rect(M, yy - 4.8, W - 2 * M, 7.5, "F");
    let x = M;
    for (const c of cols) { text(doc, c.head, cell(c, x), yy, { size: 7.5, style: "bold", color: MUTED, align: c.align }); x += c.w; }
    return yy + 8;
  };
  y = head(ensureRoom(doc, y, 16));
  for (const r of rows) {
    if (y + 7 > H - 21) { doc.addPage(); y = head(22); }
    let x = M;
    cols.forEach((c, i) => {
      text(doc, r[i], cell(c, x), y, { size: 9, align: c.align, maxW: c.w - 4 });   // one line per cell keeps rows aligned
      x += c.w;
    });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y + 2.8, W - M, y + 2.8);
    y += 7.5;
  }
  return y;
}
function totalRow(doc: JsPDF, y: number, label: string, value: string): number {
  y = ensureRoom(doc, y, 10);
  text(doc, label, W - M - 60, y + 1.5, { size: 9, style: "bold", color: MUTED, align: "right" });
  text(doc, value, W - M - 2, y + 1.5, { size: 11, style: "bold", align: "right" });
  return y + 6;
}
function footer(doc: JsPDF, id: string) {
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, H - 16, W - M, H - 16);
    text(doc, `Tripmate  ·  Booking ${id}  ·  Generated ${generated}`, M, H - 10.5, { size: 7.5, color: MUTED });
    text(doc, `Page ${p} of ${pages}`, W - M, H - 10.5, { size: 7.5, color: MUTED, align: "right" });
    text(doc, "This is a system-generated confirmation and does not need a signature.", M, H - 6.5, { size: 7, color: MUTED });
  }
}
