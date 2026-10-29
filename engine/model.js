// The saved data: helpers, the days that differ from normal, and payments.
// Every function returns a new state; nothing is changed in place.
import { parseYmd } from "./dates.js";

export const PRESETS = {
  maid: { label: "Maid", model: "monthly", rate: 3000, days: [1, 2, 3, 4, 5, 6], divisor: "30", unit: "", qty: 1 },
  cook: { label: "Cook", model: "monthly", rate: 4000, days: [1, 2, 3, 4, 5, 6], divisor: "30", unit: "", qty: 1 },
  driver: { label: "Driver", model: "monthly", rate: 8000, days: [1, 2, 3, 4, 5, 6], divisor: "30", unit: "", qty: 1 },
  milk: { label: "Milkman", model: "unit", rate: 60, days: [0, 1, 2, 3, 4, 5, 6], divisor: "30", unit: "L", qty: 1 },
  newspaper: { label: "Newspaper", model: "daily", rate: 6, days: [0, 1, 2, 3, 4, 5, 6], divisor: "30", unit: "", qty: 1 },
  tiffin: { label: "Tiffin", model: "daily", rate: 90, days: [1, 2, 3, 4, 5, 6], divisor: "30", unit: "", qty: 1 },
  other: { label: "Other", model: "daily", rate: 100, days: [1, 2, 3, 4, 5], divisor: "30", unit: "", qty: 1 },
};

export const emptyState = () => ({ v: 1, helpers: [], records: {}, payments: {}, settings: { lang: "en" } });

let counter = 0;
export function newId(prefix = "h") {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function cleanNumber(v, fallback = 0, { min = 0, max = 1e7 } = {}) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Make a helper out of loose form input, always producing a valid helper. */
export function makeHelper(input = {}, kind = "maid") {
  const p = PRESETS[input.kind] || PRESETS[kind] || PRESETS.maid;
  const model = ["monthly", "daily", "unit"].includes(input.model) ? input.model : p.model;
  const days = Array.isArray(input.days) ? [...new Set(input.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [...p.days];
  return {
    id: input.id || newId("h"),
    name: String(input.name ?? p.label).trim().slice(0, 40) || p.label,
    kind: PRESETS[input.kind] ? input.kind : kind,
    model,
    rate: cleanNumber(input.rate, p.rate),
    qty: cleanNumber(input.qty, p.qty, { max: 1000 }),
    unit: String(input.unit ?? p.unit).slice(0, 12),
    days,
    startDate: parseYmd(input.startDate) ? input.startDate : "",
    divisor: ["30", "calendar", "scheduled"].includes(input.divisor) ? input.divisor : p.divisor,
    rateChanges: (Array.isArray(input.rateChanges) ? input.rateChanges : [])
      .filter((c) => c && parseYmd(c.from))
      .map((c) => ({ from: c.from, rate: cleanNumber(c.rate, 0) })),
    note: String(input.note ?? "").slice(0, 200),
  };
}

export function addHelper(state, input) {
  const helper = makeHelper(input, input && input.kind);
  return { state: { ...state, helpers: [...state.helpers, helper] }, helper };
}

export function updateHelper(state, id, patch) {
  return { ...state, helpers: state.helpers.map((h) => (h.id === id ? makeHelper({ ...h, ...patch, id }, h.kind) : h)) };
}

export function removeHelper(state, id) {
  const records = { ...state.records }, payments = { ...state.payments };
  delete records[id];
  delete payments[id];
  return { ...state, helpers: state.helpers.filter((h) => h.id !== id), records, payments };
}

/**
 * Change one day. patch: { s: "missed" | "extra" | null, q: number | null }.
 * null clears the field; a day with nothing left is dropped so the data stays small.
 */
export function setDay(state, helperId, date, patch) {
  if (!parseYmd(date)) return state;
  const mine = { ...(state.records[helperId] || {}) };
  const rec = { ...(mine[date] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete rec[k];
    else if (k === "s" && (v === "missed" || v === "extra")) rec.s = v;
    else if (k === "q" && Number.isFinite(Number(v)) && Number(v) >= 0) rec.q = cleanNumber(v, 0, { max: 1000 });
    else if (k === "n") rec.n = String(v).slice(0, 120);
  }
  if (Object.keys(rec).length === 0) delete mine[date];
  else mine[date] = rec;
  return { ...state, records: { ...state.records, [helperId]: mine } };
}

export function addPayment(state, helperId, { date, amount, note = "" }) {
  if (!parseYmd(date)) return state;
  const amt = cleanNumber(amount, 0, { min: 0, max: 1e8 });
  if (amt <= 0) return state;
  const list = [...(state.payments[helperId] || []), { id: newId("p"), date, amount: amt, note: String(note).slice(0, 80) }];
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ...state, payments: { ...state.payments, [helperId]: list } };
}

export function removePayment(state, helperId, paymentId) {
  const list = (state.payments[helperId] || []).filter((p) => p.id !== paymentId);
  return { ...state, payments: { ...state.payments, [helperId]: list } };
}

export function setLang(state, lang) {
  return { ...state, settings: { ...state.settings, lang } };
}

/** Read a backup file (or saved data) and keep only what is valid. Returns null if it is not a Hisaab file. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.helpers)) return null;
  const state = emptyState();
  for (const h of raw.helpers.slice(0, 100)) {
    if (!h || typeof h !== "object") continue;
    state.helpers.push(makeHelper(h, h.kind));
  }
  const ids = new Set(state.helpers.map((h) => h.id));
  for (const [id, days] of Object.entries(raw.records || {})) {
    if (!ids.has(id) || !days || typeof days !== "object") continue;
    let st = state;
    for (const [date, rec] of Object.entries(days)) {
      if (rec && typeof rec === "object") st = setDay(st, id, date, { s: rec.s, q: rec.q, n: rec.n });
    }
    state.records = st.records;
  }
  for (const [id, list] of Object.entries(raw.payments || {})) {
    if (!ids.has(id) || !Array.isArray(list)) continue;
    let st = state;
    for (const p of list.slice(0, 2000)) if (p) st = addPayment(st, id, p);
    state.payments = st.payments;
  }
  if (raw.settings && ["en", "hinglish", "hi"].includes(raw.settings.lang)) state.settings.lang = raw.settings.lang;
  return state;
}
