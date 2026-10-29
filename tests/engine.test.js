import test from "node:test";
import assert from "node:assert/strict";
import {
  formatINR, groupIndian, toPaise, computeBill, settle, rateOn, buildMessage,
  makeHelper, emptyState, addHelper, updateHelper, removeHelper, setDay, addPayment, removePayment,
  normalizeState, monthCSV, backupJSON, csvCell, parseYmd, daysInMonth, shiftMonth, todayYmd, PRESETS,
} from "../engine/index.js";

// October 2026 has 31 days, starts on a Thursday, and has four Sundays (4, 11, 18, 25).
const Y = 2026, M = 10;
const maid = makeHelper({ name: "Sunita", kind: "maid", rate: 3000 });
const tiffin = makeHelper({ name: "Tiffin", kind: "tiffin", rate: 90 });
const milk = makeHelper({ name: "Milk", kind: "milk", rate: 60, qty: 1, unit: "L" });

test("rupees use Indian digit grouping", () => {
  assert.equal(groupIndian("1234567"), "12,34,567");
  assert.equal(groupIndian("999"), "999");
  assert.equal(formatINR(123456700), "₹12,34,567");
  assert.equal(formatINR(280050), "₹2,800.50");
  assert.equal(formatINR(-5000), "-₹50");
  assert.equal(toPaise("62.5"), 6250);
  assert.equal(toPaise("abc"), 0);
});

test("dates behave at month edges", () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(parseYmd("2026-02-30"), null);
  assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.equal(todayYmd(new Date(2026, 9, 30)), "2026-10-30");
});

test("monthly pay with no misses is the full amount", () => {
  const b = computeBill(maid, {}, Y, M);
  assert.equal(b.total, 300000);
  assert.equal(b.counts.expected, 27);
  assert.equal(b.counts.came, 27);
  assert.equal(b.deduction, 0);
});

test("a missed day is deducted at one thirtieth", () => {
  const rec = { "2026-10-12": { s: "missed" }, "2026-10-19": { s: "missed" } };
  const b = computeBill(maid, rec, Y, M);
  assert.equal(b.counts.missed, 2);
  assert.equal(b.deduction, 20000);
  assert.equal(b.total, 280000);
  assert.deepEqual(b.missedDates, ["2026-10-12", "2026-10-19"]);
});

test("an extra visit on a day off is added", () => {
  const b = computeBill(maid, { "2026-10-04": { s: "extra" } }, Y, M);
  assert.equal(b.counts.extra, 1);
  assert.equal(b.total, 310000);
});

test("marking a day off as missed does nothing", () => {
  // Oct 4 is a Sunday, not a working day for the maid.
  const b = computeBill(maid, { "2026-10-04": { s: "missed" } }, Y, M);
  assert.equal(b.total, 300000);
  assert.equal(b.counts.missed, 0);
});

test("a day can be worth the calendar month or the working days instead", () => {
  const rec = { "2026-10-12": { s: "missed" }, "2026-10-19": { s: "missed" } };
  const cal = computeBill({ ...maid, divisor: "calendar" }, rec, Y, M);
  assert.equal(cal.total, 300000 - Math.round((2 * 300000) / 31));
  const sched = computeBill({ ...maid, divisor: "scheduled" }, { "2026-10-12": { s: "missed" } }, Y, M);
  assert.equal(sched.total, 300000 - Math.round(300000 / 27));
});

test("a daily rate is paid only for days they came", () => {
  assert.equal(computeBill(tiffin, {}, Y, M).total, 27 * 9000);
  assert.equal(computeBill(tiffin, { "2026-10-05": { s: "missed" } }, Y, M).total, 26 * 9000);
});

test("milk is rate x litres, with changed quantities and skipped days", () => {
  assert.equal(computeBill(milk, {}, Y, M).total, 31 * 6000);
  const b = computeBill(milk, { "2026-10-05": { q: 2 }, "2026-10-06": { q: 0 } }, Y, M);
  assert.equal(b.total, 31 * 6000 + 6000 - 6000);
  assert.equal(b.units, 31 + 1 - 1);
  assert.equal(b.counts.missed, 1);
});

test("a rate change applies from its date", () => {
  const h = { ...milk, rateChanges: [{ from: "2026-10-16", rate: 70 }] };
  assert.equal(rateOn(h, "2026-10-15"), 6000);
  assert.equal(rateOn(h, "2026-10-16"), 7000);
  assert.equal(computeBill(h, {}, Y, M).total, 15 * 6000 + 16 * 7000);
});

test("a monthly rate change is prorated by day", () => {
  const h = { ...maid, rateChanges: [{ from: "2026-10-16", rate: 3100 }] };
  // 15 days at 3000/31 and 16 days at 3100/31
  const expected = Math.round((15 * 300000 + 16 * 310000) / 31);
  assert.equal(computeBill(h, {}, Y, M).total, expected);
});

test("days before the start date are not billed", () => {
  const h = { ...tiffin, startDate: "2026-10-20" };
  assert.equal(computeBill(h, {}, Y, M).total, 11 * 9000);
});

test("so-far only counts days up to today", () => {
  const b = computeBill(tiffin, {}, Y, M, "2026-10-10");
  assert.equal(b.sofar, 9 * 9000);
  assert.equal(b.total, 27 * 9000);
  assert.equal(b.counts.upcoming, 18);
  const rec = { "2026-10-05": { s: "missed" }, "2026-10-20": { s: "missed" } };
  const m = computeBill(maid, rec, Y, M, "2026-10-10");
  assert.equal(m.sofar, 300000 - 10000);
  assert.equal(m.total, 300000 - 20000);
});

test("February in a leap year", () => {
  const b = computeBill({ ...tiffin, days: [0, 1, 2, 3, 4, 5, 6] }, {}, 2028, 2);
  assert.equal(b.days.length, 29);
  assert.equal(b.total, 29 * 9000);
});

test("payments reduce what is due, other months are ignored, advance goes negative", () => {
  const bill = computeBill(maid, {}, Y, M);
  const pays = [
    { date: "2026-10-05", amount: 1000 },
    { date: "2026-09-28", amount: 500 },
  ];
  assert.deepEqual(settle(bill, pays, "2026-10"), { paid: 100000, due: 200000 });
  assert.deepEqual(settle(bill, [{ date: "2026-10-31", amount: 3500 }], "2026-10"), { paid: 350000, due: -50000 });
});

test("the message lists what happened and what is owed", () => {
  const rec = { "2026-10-12": { s: "missed" }, "2026-10-19": { s: "missed" } };
  const bill = computeBill(maid, rec, Y, M);
  const text = buildMessage({ helper: maid, y: Y, m: M, bill, paid: 100000, lang: "en" });
  assert.match(text, /Hi Sunita,/);
  assert.match(text, /Hisaab for October 2026/);
  assert.match(text, /Missed: 2 days \(12, 19 Oct\)/);
  assert.match(text, /Monthly pay: ₹3,000/);
  assert.match(text, /Deduction for missed days: -₹200/);
  assert.match(text, /Total: ₹2,800/);
  assert.match(text, /Balance to pay: ₹1,800/);
});

test("the message works in Hinglish and Hindi, and for milk and settled bills", () => {
  const bill = computeBill(milk, {}, Y, M);
  const hing = buildMessage({ helper: milk, y: Y, m: M, bill, paid: bill.total, lang: "hinglish" });
  assert.match(hing, /Namaste Milk,/);
  assert.match(hing, /Kul 31 L/);
  assert.match(hing, /Hisaab barabar\./);
  const hi = buildMessage({ helper: maid, y: Y, m: M, bill: computeBill(maid, {}, Y, M), lang: "hi" });
  assert.match(hi, /अक्टूबर 2026 का हिसाब/);
  assert.match(hi, /बाकी देना है: ₹3,000/);
});

test("adding, editing and removing a helper", () => {
  let s = emptyState();
  const added = addHelper(s, { kind: "milk", name: "  Ramesh  ", rate: "-5" });
  s = added.state;
  assert.equal(s.helpers.length, 1);
  assert.equal(added.helper.name, "Ramesh");
  assert.equal(added.helper.rate, 0); // a negative rate is clamped, not trusted
  s = updateHelper(s, added.helper.id, { rate: 62.5 });
  assert.equal(s.helpers[0].rate, 62.5);
  assert.equal(s.helpers[0].model, "unit");
  s = setDay(s, added.helper.id, "2026-10-03", { s: "missed" });
  s = addPayment(s, added.helper.id, { date: "2026-10-04", amount: 100 });
  s = removeHelper(s, added.helper.id);
  assert.deepEqual(s.records, {});
  assert.deepEqual(s.payments, {});
});

test("setDay merges fields and drops empty days", () => {
  let s = addHelper(emptyState(), { kind: "maid" }).state;
  const id = s.helpers[0].id;
  s = setDay(s, id, "2026-10-12", { s: "missed" });
  s = setDay(s, id, "2026-10-12", { n: "was ill" });
  assert.deepEqual(s.records[id]["2026-10-12"], { s: "missed", n: "was ill" });
  s = setDay(s, id, "2026-10-12", { s: null, n: null });
  assert.equal(s.records[id]["2026-10-12"], undefined);
  assert.equal(setDay(s, id, "not-a-date", { s: "missed" }), s);
});

test("payments are kept in date order and can be removed", () => {
  let s = addHelper(emptyState(), { kind: "maid" }).state;
  const id = s.helpers[0].id;
  s = addPayment(s, id, { date: "2026-10-20", amount: 500 });
  s = addPayment(s, id, { date: "2026-10-05", amount: 1000 });
  s = addPayment(s, id, { date: "2026-10-06", amount: 0 }); // ignored
  assert.deepEqual(s.payments[id].map((p) => p.date), ["2026-10-05", "2026-10-20"]);
  s = removePayment(s, id, s.payments[id][0].id);
  assert.equal(s.payments[id].length, 1);
});

test("a backup round-trips, and bad data is cleaned out", () => {
  let s = addHelper(emptyState(), { kind: "tiffin", name: "Anita", rate: 80 }).state;
  const id = s.helpers[0].id;
  s = setDay(s, id, "2026-10-09", { s: "missed" });
  s = addPayment(s, id, { date: "2026-10-10", amount: 400 });
  const back = normalizeState(JSON.parse(backupJSON(s)));
  assert.deepEqual(back.helpers, s.helpers);
  assert.deepEqual(back.records, s.records);
  assert.deepEqual(back.payments[id].map((p) => p.amount), [400]);

  assert.equal(normalizeState({ nope: 1 }), null);
  assert.equal(normalizeState(null), null);
  const dirty = normalizeState({
    helpers: [{ id: "a", name: "X", kind: "maid", rate: "oops", days: [1, 9, "x"] }, null, 5],
    records: { a: { "2026-13-40": { s: "missed" }, "2026-10-01": { s: "bogus", q: -4 } }, ghost: { "2026-10-01": { s: "missed" } } },
    payments: { a: [{ date: "2026-10-01", amount: -5 }, { date: "bad", amount: 5 }], ghost: [] },
  });
  assert.equal(dirty.helpers.length, 1);
  assert.equal(dirty.helpers[0].rate, PRESETS.maid.rate);
  assert.deepEqual(dirty.helpers[0].days, [1]);
  assert.equal(dirty.records.ghost, undefined);
  assert.equal(dirty.records.a["2026-13-40"], undefined);
  assert.equal((dirty.payments.a || []).length, 0);
  assert.equal(dirty.records.a["2026-10-01"], undefined); // bogus status and negative quantity are dropped
});

test("the CSV sheet totals every helper and guards against formulas", () => {
  let s = emptyState();
  s = addHelper(s, { kind: "maid", name: "=HYPERLINK(\"http://x\")", rate: 3000 }).state;
  s = addHelper(s, { kind: "tiffin", name: "Anita, Mumbai", rate: 90 }).state;
  s = addPayment(s, s.helpers[0].id, { date: "2026-10-05", amount: 1000 });
  const csv = monthCSV(s, Y, M);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].startsWith(csvCell('=HYPERLINK("http://x")') + ",monthly"));
  assert.ok(lines[2].startsWith('"Anita, Mumbai",daily'));
  assert.ok(lines[3].startsWith("All helpers,,,,,5430.00,1000.00,4430.00"));
  assert.equal(csvCell("+91 98"), "'+91 98");
  assert.equal(csvCell("plain"), "plain");
});
