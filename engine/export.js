// Month sheet as CSV (opens in Excel / Google Sheets) and a full backup as JSON.
import { computeBill, settle } from "./bill.js";
import { monthKey } from "./dates.js";

/** Cells starting with = + - @ are read as formulas by spreadsheets, so they get a leading quote. */
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const rupees = (paise) => (paise / 100).toFixed(2);

export function monthCSV(state, y, m, asOf) {
  const key = monthKey(y, m);
  const rows = [["Helper", "Type", "Days came", "Days missed", "Extra days", "Total (INR)", "Paid (INR)", "Due (INR)"]];
  let total = 0, paid = 0;
  for (const h of state.helpers) {
    const bill = computeBill(h, state.records[h.id], y, m, asOf);
    const s = settle(bill, state.payments[h.id], key);
    total += bill.total;
    paid += s.paid;
    rows.push([h.name, h.model, bill.counts.came, bill.counts.missed, bill.counts.extra, rupees(bill.total), rupees(s.paid), rupees(s.due)]);
  }
  rows.push(["All helpers", "", "", "", "", rupees(total), rupees(paid), rupees(total - paid)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function backupJSON(state) {
  return JSON.stringify({ app: "hisaab", ...state }, null, 2);
}
