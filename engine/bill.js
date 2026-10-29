// The bill for one helper for one month.
//
// helper: {
//   model: "monthly" | "daily" | "unit",
//     monthly = fixed monthly pay, a missed day is deducted (maid, cook, driver)
//     daily   = a flat amount for each day they come (tiffin, newspaper)
//     unit    = rate x quantity for each day (milk by the litre)
//   rate (rupees; per month, per day or per unit), qty (default units per day, "unit" only),
//   days: [0..6] weekdays they normally come (0 = Sunday),
//   startDate: "YYYY-MM-DD" or "", rateChanges: [{from, rate}],
//   divisor: "30" | "calendar" | "scheduled"   (monthly only: what one day is worth)
// }
// records: { "2026-10-12": { s: "missed" | "extra", q: number } }  (no entry = came as usual)

import { toPaise } from "./money.js";
import { daysInMonth, dowOf, ymd } from "./dates.js";

/** The rate (in paise) that applies on a given date. */
export function rateOn(helper, date) {
  let rate = helper.rate;
  const changes = [...(helper.rateChanges || [])].filter((c) => c && c.from).sort((a, b) => (a.from < b.from ? -1 : 1));
  for (const c of changes) if (c.from <= date) rate = c.rate;
  return toPaise(rate);
}

function dayValueDivisor(helper, y, m) {
  const dim = daysInMonth(y, m);
  if (helper.divisor === "calendar") return dim;
  if (helper.divisor === "scheduled") {
    let n = 0;
    for (let d = 1; d <= dim; d++) if ((helper.days || []).includes(dowOf(y, m, d))) n++;
    return Math.max(1, n);
  }
  return 30;
}

/**
 * computeBill(helper, records, y, m, asOf) ->
 *   { days, counts, base, deduction, extra, total, sofar, missedDates, extraDates, units }
 * All money is in paise. `total` assumes the rest of the month goes as scheduled;
 * `sofar` only counts days up to and including `asOf`.
 */
export function computeBill(helper, records = {}, y, m, asOf = "9999-12-31") {
  const dim = daysInMonth(y, m);
  const divisor = dayValueDivisor(helper, y, m);
  const start = helper.startDate || "";
  const days = [];
  const counts = { expected: 0, came: 0, missed: 0, extra: 0, upcoming: 0 };
  const missedDates = [], extraDates = [];
  let base = 0, deduction = 0, extra = 0, units = 0;
  let dedSoFar = 0, extraSoFar = 0, dailySoFar = 0, daily = 0;

  for (let d = 1; d <= dim; d++) {
    const date = ymd(y, m, d);
    const dow = dowOf(y, m, d);
    const rec = (records && records[date]) || {};
    const active = !start || date >= start;
    const scheduled = (helper.days || []).includes(dow);
    const upcoming = date > asOf;
    const rate = rateOn(helper, date);
    const qty = typeof rec.q === "number" && rec.q >= 0 ? rec.q : (helper.qty ?? 1);
    let status = "off";
    let amount = 0;

    if (!active) status = "before";
    else if (scheduled) status = rec.s === "missed" || (helper.model === "unit" && rec.q === 0) ? "missed" : "came";
    else if (rec.s === "extra") status = "extra";

    if (active && helper.model === "monthly") {
      const share = rate / dim; // the day's slice of the monthly pay
      base += share;
      const dayValue = rate / divisor;
      if (status === "missed") { amount = -dayValue; deduction += dayValue; if (!upcoming) dedSoFar += dayValue; }
      if (status === "extra") { amount = dayValue; extra += dayValue; if (!upcoming) extraSoFar += dayValue; }
    } else if (active && (status === "came" || status === "extra")) {
      amount = helper.model === "unit" ? rate * qty : rate;
      if (helper.model === "unit") units += qty;
      daily += amount;
      if (!upcoming) dailySoFar += amount;
    }

    if (status === "came" || status === "missed") counts.expected++;
    if (status === "came") counts.came++;
    if (status === "missed") { counts.missed++; missedDates.push(date); }
    if (status === "extra") { counts.extra++; extraDates.push(date); }
    if (upcoming && active && scheduled) counts.upcoming++;
    days.push({ date, dow, scheduled, status, upcoming, qty: status === "came" || status === "extra" ? qty : 0, amount: Math.round(amount) });
  }

  let total, sofar;
  if (helper.model === "monthly") {
    total = Math.round(base) - Math.round(deduction) + Math.round(extra);
    sofar = Math.round(base) - Math.round(dedSoFar) + Math.round(extraSoFar);
    base = Math.round(base);
  } else {
    total = Math.round(daily);
    sofar = Math.round(dailySoFar);
    base = Math.round(daily);
  }
  return {
    days, counts,
    base,
    deduction: Math.round(deduction),
    extra: Math.round(extra),
    total: Math.max(0, total),
    sofar: Math.max(0, sofar),
    missedDates, extraDates,
    units,
  };
}

/** What has been paid in the month and what is still due. A negative `due` means paid in advance. */
export function settle(bill, payments = [], monthPrefix) {
  const paid = payments
    .filter((p) => !monthPrefix || String(p.date).startsWith(monthPrefix))
    .reduce((sum, p) => sum + toPaise(p.amount), 0);
  return { paid, due: bill.total - paid };
}
