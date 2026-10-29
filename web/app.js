import {
  PRESETS, LANGS, MONTHS_EN, DAYS_EN, formatINR, toPaise, computeBill, settle, buildMessage,
  emptyState, addHelper, updateHelper, removeHelper, setDay, addPayment, removePayment, setLang,
  normalizeState, monthCSV, backupJSON, monthKey, shiftMonth, todayYmd, dowOf, ymd, parseYmd,
} from "./engine/index.js";
import { sampleState } from "./sample.js";

const KEY = "hisaab:v1";
const $ = (id) => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";

/* ---------- small DOM helper (text is always set as text, never as HTML) ---------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function mark(kind, seed = 0) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 26 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    tick: ["M3.5 13.5C6 15 8 17.5 9.5 20.5 12.5 12.5 17 6.5 22.5 3"],
    cross: ["M5 4.5C10 9 16 15 21 19.5", "M21 4C16 9 10 15 5.5 20"],
    plus: ["M13 4.5C13 9 13.2 15 13 19.5", "M5 12.3C10 12 16 12.4 21 12"],
    dash: ["M7 12.2C10 12 15 12.4 19 12"],
  }[kind];
  const g = document.createElementNS(SVG, "g");
  g.setAttribute("transform", `rotate(${((seed * 37) % 9) - 4} 13 12)`);
  for (const d of paths) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", kind === "tick" ? "3" : "2.8");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    g.append(p);
  }
  svg.append(g);
  return svg;
}

/* ---------- saved data ---------- */
let state = emptyState();
let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = normalizeState(JSON.parse(raw));
      if (s) state = s;
    }
  } catch { storageOk = false; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { storageOk = false; }
  $("saveNote").textContent = storageOk ? "" : "This browser is not letting Hisaab save (private window?). Use “Save a backup” before you close the tab.";
}
function commit(next, { keepScroll = true } = {}) {
  state = next;
  save();
  render(keepScroll);
}

/* ---------- view state ---------- */
const now = new Date();
const ui = { y: now.getFullYear(), m: now.getMonth() + 1, id: null, date: null };

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function describe(hp) {
  const rate = formatINR(toPaise(hp.rate));
  const days = hp.days.length === 7 ? "every day" : hp.days.length === 6 && !hp.days.includes(0) ? "Mon–Sat"
    : hp.days.length === 5 && !hp.days.includes(0) && !hp.days.includes(6) ? "Mon–Fri" : hp.days.map((d) => DAYS_EN[d]).join(", ");
  if (hp.model === "monthly") return `${rate} a month · ${days}`;
  if (hp.model === "unit") return `${rate} per ${hp.unit || "unit"} · ${hp.qty} a day · ${days}`;
  return `${rate} a day · ${days}`;
}

/* ---------- render ---------- */
function render(keepScroll = true) {
  const y0 = window.scrollY;
  const { y, m } = ui;
  const asOf = todayYmd();
  const key = monthKey(y, m);
  const isCurrent = key === asOf.slice(0, 7);
  $("monthLabel").textContent = `${MONTHS_EN[m - 1]} ${y}`;

  const bills = new Map();
  let total = 0, paid = 0;
  for (const hp of state.helpers) {
    const bill = computeBill(hp, state.records[hp.id], y, m, asOf);
    const st = settle(bill, state.payments[hp.id], key);
    bills.set(hp.id, { bill, st });
    total += bill.total;
    paid += st.paid;
  }
  if (!state.helpers.some((x) => x.id === ui.id)) ui.id = state.helpers[0] ? state.helpers[0].id : null;

  renderSummary(total, paid);
  renderChips(bills);
  const detail = $("detail");
  detail.replaceChildren();
  if (state.helpers.length === 0) detail.append(welcome());
  else detail.append(...helperView(state.helpers.find((x) => x.id === ui.id), bills.get(ui.id), isCurrent, asOf));
  if (keepScroll) window.scrollTo(0, y0);
}

function renderSummary(total, paid) {
  const s = $("summary");
  s.replaceChildren();
  if (state.helpers.length === 0) { s.hidden = true; return; }
  s.hidden = false;
  const due = total - paid;
  s.append(
    h("div", { class: "stat" }, h("span", {}, "Total this month"), h("b", {}, formatINR(total))),
    h("div", { class: "stat" }, h("span", {}, "Paid"), h("b", {}, formatINR(paid))),
    h("div", { class: "stat " + (due > 0 ? "due" : "settled") }, h("span", {}, due >= 0 ? "Still to pay" : "Paid in advance"), h("b", {}, due === 0 ? "Settled" : formatINR(Math.abs(due)))),
  );
}

function renderChips(bills) {
  const box = $("helpers");
  box.replaceChildren();
  if (state.helpers.length === 0) { box.hidden = true; return; }
  box.hidden = false;
  for (const hp of state.helpers) {
    const { st } = bills.get(hp.id);
    box.append(h("button", { class: "chip", "aria-pressed": String(hp.id === ui.id), onclick: () => { ui.id = hp.id; ui.date = null; render(false); } },
      h("b", {}, hp.name), h("span", {}, `${(PRESETS[hp.kind] || PRESETS.other).label} · ` + (st.due > 0 ? `${formatINR(st.due)} to pay` : st.due < 0 ? "advance paid" : "settled"))));
  }
  box.append(h("button", { class: "chip add", onclick: () => openDialog(null, "maid") }, "+ Add helper"));
}

function welcome() {
  const quick = ["maid", "milk", "newspaper", "tiffin", "cook"].map((k) =>
    h("button", { class: "btn", onclick: () => openDialog(null, k) }, "+ " + PRESETS[k].label));
  return h("div", { class: "welcome" },
    h("h1", {}, "Who comes to your home every day?"),
    h("p", {}, "Add your maid, milkman, newspaper or tiffin. Tick the days they miss, and Hisaab works out the month’s bill, so there is no more arguing over how many days it was."),
    h("div", { class: "quick" }, quick),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: () => commit(sampleState(ui.y, ui.m)) }, "See an example first")),
    h("details", { class: "how" }, h("summary", {}, "How is a missed day counted?"),
      h("p", {}, "For a fixed monthly salary, each missed day is deducted at one thirtieth of the pay (you can change this to the days in the month or the working days). For milk and tiffin, you only pay for the days it came, at that day’s quantity.")));
}

function helperView(hp, data, isCurrent, asOf) {
  const { bill, st } = data;
  const { y, m } = ui;
  const key = monthKey(y, m);
  const out = [];

  /* the calendar */
  const cal = h("div", { class: "cal", role: "group", "aria-label": `${hp.name}, ${MONTHS_EN[m - 1]} ${y}` });
  for (const d of DAYS_EN) cal.append(h("div", { class: "dow", "aria-hidden": "true" }, d));
  for (let i = 0; i < dowOf(y, m, 1); i++) cal.append(h("div", { class: "day blank" }));
  for (const day of bill.days) {
    const n = Number(day.date.slice(8));
    const label = `${n} ${MONTHS_EN[m - 1]}, ${DAYS_EN[day.dow]}: ` + ({ came: "came", missed: "missed", extra: "extra visit", off: "day off", before: "before start" }[day.status]);
    const rec = (state.records[hp.id] || {})[day.date];
    const qty = hp.model === "unit" && (day.status === "came" || day.status === "extra") && day.qty !== hp.qty ? String(day.qty) : "";
    const kind = { came: "tick", missed: "cross", extra: "plus", off: "dash", before: null }[day.status];
    cal.append(h("button", {
      class: ["day", day.status, day.upcoming ? "upcoming" : "", day.date === asOf ? "today" : "", day.date === ui.date ? "sel" : ""].join(" ").replace(/\s+/g, " ").trim(),
      "aria-label": label + (rec && rec.n ? `. Note: ${rec.n}` : ""), "aria-pressed": String(day.date === ui.date),
      onclick: () => { ui.date = ui.date === day.date ? null : day.date; render(); },
    }, h("span", { class: "n" }, n), kind ? mark(kind, n) : null, qty ? h("span", { class: "q" }, qty) : null));
  }

  const legend = h("p", { class: "legend" },
    h("span", {}, mark("tick"), "came"), h("span", {}, mark("cross"), "missed"), h("span", {}, mark("plus"), "extra visit"), h("span", {}, mark("dash"), "day off"),
    h("span", {}, "Tap a day to change it"));

  const head = h("div", { class: "head" },
    h("div", {}, h("h3", {}, hp.name), h("p", { class: "sub" }, describe(hp))),
    h("button", { class: "btn small", onclick: () => openDialog(hp) }, "Edit"));
  const page1 = h("div", { class: "page" }, head, cal, legend);
  if (ui.date && ui.date.startsWith(key)) page1.append(dayForm(hp, bill.days.find((d) => d.date === ui.date)));
  out.push(page1);

  /* the bill */
  const rows = [];
  const money = (p, cls = "") => h("td", { class: cls }, formatINR(p));
  if (hp.model === "monthly") {
    rows.push(h("tr", {}, h("td", {}, "Monthly pay"), money(bill.base)));
    if (bill.counts.missed) rows.push(h("tr", {}, h("td", {}, `Missed ${bill.counts.missed} ${bill.counts.missed === 1 ? "day" : "days"}`), h("td", { class: "minus" }, "-" + formatINR(bill.deduction))));
    if (bill.counts.extra) rows.push(h("tr", {}, h("td", {}, `Extra ${bill.counts.extra} ${bill.counts.extra === 1 ? "day" : "days"}`), h("td", { class: "plus" }, "+" + formatINR(bill.extra))));
  } else if (hp.model === "unit") {
    rows.push(h("tr", {}, h("td", {}, `${bill.counts.came + bill.counts.extra} deliveries, ${Math.round(bill.units * 100) / 100} ${hp.unit || "units"}`), money(bill.total)));
  } else {
    rows.push(h("tr", {}, h("td", {}, `${bill.counts.came + bill.counts.extra} days counted`), money(bill.total)));
    if (bill.counts.missed) rows.push(h("tr", {}, h("td", { class: "muted" }, `${bill.counts.missed} missed, not charged`), h("td", {})));
  }
  rows.push(h("tr", { class: "total" }, h("td", {}, "Total"), money(bill.total)));
  if (isCurrent && bill.sofar !== bill.total) rows.push(h("tr", {}, h("td", { class: "muted" }, "Earned up to today"), h("td", { class: "muted" }, formatINR(bill.sofar))));
  if (st.paid) rows.push(h("tr", {}, h("td", {}, "Paid"), h("td", { class: "minus" }, "-" + formatINR(st.paid))));
  rows.push(st.due > 0 ? h("tr", { class: "due" }, h("td", {}, "Still to pay"), money(st.due))
    : st.due < 0 ? h("tr", { class: "ok" }, h("td", {}, "Paid in advance"), money(-st.due))
    : h("tr", { class: "ok" }, h("td", {}, "Settled"), h("td", {}, "✓")));

  const pays = (state.payments[hp.id] || []).filter((p) => p.date.startsWith(key));
  const payList = pays.map((p) => h("div", { class: "pay" },
    h("span", {}, `${p.date.slice(8)} ${MONTHS_EN[m - 1].slice(0, 3)} · ${formatINR(toPaise(p.amount))}${p.note ? " · " + p.note : ""}`),
    h("button", { "aria-label": "Remove this payment", onclick: () => commit(removePayment(state, hp.id, p.id)) }, "×")));
  const today = todayYmd();
  const defDate = today.startsWith(key) ? today : ymd(y, m, 1);
  const amt = h("input", { id: "payAmt", type: "number", inputmode: "decimal", min: "1", step: "any", placeholder: "500", "aria-label": "Amount paid" });
  const dt = h("input", { id: "payDate", type: "date", value: defDate, "aria-label": "Date paid" });
  const note = h("input", { id: "payNote", type: "text", maxlength: "40", placeholder: "advance, UPI…", "aria-label": "Note" });
  const payForm = h("form", { class: "payform", onsubmit: (e) => {
    e.preventDefault();
    const next = addPayment(state, hp.id, { date: dt.value, amount: amt.value, note: note.value });
    if (next === state) return toast("Enter an amount and a date");
    commit(next); toast("Payment added");
  } },
    h("label", { class: "field" }, "Paid ₹", amt), h("label", { class: "field" }, "On", dt), h("label", { class: "field" }, "Note", note),
    h("button", { class: "btn primary", type: "submit" }, "Add payment"));

  out.push(h("div", { class: "page" }, h("h3", {}, "The bill"), h("table", { class: "bill" }, h("tbody", {}, rows)),
    h("p", { class: "sub" }, pays.length ? "Payments" : "Payments made this month"), payList, payForm));

  /* the message */
  const text = buildMessage({ helper: hp, y, m, bill, paid: st.paid, lang: state.settings.lang });
  const ta = h("textarea", { id: "msg", rows: String(text.split("\n").length + 1), readonly: true, "aria-label": "Message to send" });
  ta.value = text;
  const sel = h("select", { id: "lang", "aria-label": "Language", onchange: (e) => commit(setLang(state, e.target.value)) },
    Object.entries(LANGS).map(([k, v]) => h("option", { value: k, selected: k === state.settings.lang }, v)));
  const bar = h("div", { class: "msgbar" }, sel,
    h("button", { class: "btn primary", onclick: () => copyText(text) }, "Copy"),
    h("a", { class: "btn", href: "https://wa.me/?text=" + encodeURIComponent(text), target: "_blank", rel: "noopener noreferrer" }, "WhatsApp"),
    navigator.share ? h("button", { class: "btn", onclick: () => navigator.share({ text }).catch(() => {}) }, "Share") : null);
  out.push(h("div", { class: "page plain" }, h("h3", {}, "Message for " + hp.name), h("p", { class: "muted small" }, "Ready to send. Pick a language, then copy it or open WhatsApp."), bar, ta));
  return out;
}

function dayForm(hp, day) {
  const rec = (state.records[hp.id] || {})[day.date] || {};
  const n = Number(day.date.slice(8));
  const title = `${n} ${MONTHS_EN[ui.m - 1]}, ${DAYS_EN[day.dow]}`;
  const set = (patch) => commit(setDay(state, hp.id, day.date, patch));
  const pressed = (v) => String(v);
  const box = h("div", { class: "dayform" }, h("h4", {}, title));
  if (day.status === "before") { box.append(h("p", { class: "muted small" }, "This is before the start date, so it is not billed.")); return box; }
  const scheduled = day.scheduled;
  const isMissed = day.status === "missed";
  const isExtra = day.status === "extra";
  const seg = scheduled
    ? h("div", { class: "seg", role: "group", "aria-label": "Did they come?" },
        h("button", { "aria-pressed": pressed(!isMissed), onclick: () => set({ s: null, q: hp.model === "unit" && rec.q === 0 ? null : rec.q }) }, "Came"),
        h("button", { "aria-pressed": pressed(isMissed), onclick: () => set({ s: "missed" }) }, "Missed"))
    : h("div", { class: "seg", role: "group", "aria-label": "Did they come?" },
        h("button", { "aria-pressed": pressed(!isExtra), onclick: () => set({ s: null }) }, "Day off"),
        h("button", { "aria-pressed": pressed(isExtra), onclick: () => set({ s: "extra" }) }, "Extra visit"));
  box.append(seg);
  if (hp.model === "unit" && (day.status === "came" || day.status === "extra")) {
    const q = h("input", { type: "number", inputmode: "decimal", min: "0", step: "0.25", value: String(day.qty), class: "w90", "aria-label": `Quantity in ${hp.unit || "units"}`,
      onchange: (e) => { const v = Number(e.target.value); set({ q: !Number.isFinite(v) || v === hp.qty ? null : v }); } });
    box.append(h("div", { class: "row mt" }, h("label", { class: "field" }, `Quantity (${hp.unit || "units"})`, q),
      h("span", { class: "hint" }, `Usual: ${hp.qty}. Enter 0 if nothing came.`)));
  }
  const noteIn = h("input", { type: "text", maxlength: "120", value: rec.n || "", placeholder: "Optional, e.g. was ill", "aria-label": "Note for this day",
    onchange: (e) => set({ n: e.target.value.trim() || null }) });
  box.append(h("label", { class: "field mt" }, "Note", noteIn));
  return box;
}

/* ---------- clipboard, downloads ---------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); return; } catch { /* fall back below */ }
  const ta = $("msg");
  if (ta) { ta.removeAttribute("readonly"); ta.select(); try { document.execCommand("copy"); toast("Copied"); } catch { toast("Press and hold to copy"); } ta.setAttribute("readonly", ""); }
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- add / edit helper ---------- */
function openDialog(existing, kind = "maid") {
  const dlg = $("helperDialog");
  const p = existing || { ...PRESETS[kind], kind, name: PRESETS[kind].label, startDate: "", rateChanges: [], note: "" };
  const draftDays = new Set(p.days);
  const rcBox = h("div", {});
  const rcs = (p.rateChanges || []).map((c) => ({ ...c }));
  const err = h("p", { class: "err", role: "alert" });

  const kindSel = h("select", { id: "fKind" }, Object.entries(PRESETS).map(([k, v]) => h("option", { value: k, selected: k === (p.kind || kind) }, v.label)));
  const name = h("input", { id: "fName", type: "text", maxlength: "40", value: p.name, autocomplete: "off" });
  const model = h("select", { id: "fModel" },
    h("option", { value: "monthly", selected: p.model === "monthly" }, "Fixed monthly pay"),
    h("option", { value: "daily", selected: p.model === "daily" }, "Same amount each day they come"),
    h("option", { value: "unit", selected: p.model === "unit" }, "Rate × quantity each day (milk)"));
  const rateLabel = h("span", {});
  const rate = h("input", { id: "fRate", type: "number", inputmode: "decimal", min: "0", step: "any", value: String(p.rate) });
  const qty = h("input", { id: "fQty", type: "number", inputmode: "decimal", min: "0", step: "any", value: String(p.qty ?? 1) });
  const unit = h("input", { id: "fUnit", type: "text", maxlength: "12", value: p.unit || "" });
  const unitRow = h("div", { class: "grid2" }, h("label", { class: "field" }, "Usual quantity per day", qty), h("label", { class: "field" }, "Unit (L, kg, copies)", unit));
  const divisor = h("select", { id: "fDiv" },
    h("option", { value: "30", selected: p.divisor === "30" }, "Monthly pay ÷ 30"),
    h("option", { value: "calendar", selected: p.divisor === "calendar" }, "Monthly pay ÷ days in that month"),
    h("option", { value: "scheduled", selected: p.divisor === "scheduled" }, "Monthly pay ÷ days they should come"));
  const divRow = h("label", { class: "field" }, "What is one missed day worth?", divisor);
  const start = h("input", { id: "fStart", type: "date", value: p.startDate || "" });

  const daysBox = h("div", { class: "dayspick" }, [1, 2, 3, 4, 5, 6, 0].map((d) =>
    h("label", {}, h("input", { type: "checkbox", checked: draftDays.has(d), onchange: (e) => (e.target.checked ? draftDays.add(d) : draftDays.delete(d)) }), DAYS_EN[d])));

  function syncModel() {
    const mdl = model.value;
    rateLabel.textContent = mdl === "monthly" ? "Monthly pay (₹)" : mdl === "daily" ? "Amount per day (₹)" : "Rate per unit (₹)";
    unitRow.hidden = mdl !== "unit";
    divRow.hidden = mdl !== "monthly";
  }
  function paintRc() {
    rcBox.replaceChildren(...rcs.map((c, i) => h("div", { class: "rc" },
      h("label", { class: "field" }, "From", h("input", { type: "date", value: c.from, onchange: (e) => { c.from = e.target.value; } })),
      h("label", { class: "field" }, "New rate (₹)", h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", value: String(c.rate), class: "w110", onchange: (e) => { c.rate = e.target.value; } })),
      h("button", { type: "button", class: "btn small", "aria-label": "Remove this rate change", onclick: () => { rcs.splice(i, 1); paintRc(); } }, "×"))));
  }
  kindSel.addEventListener("change", () => {
    if (existing) return;
    const pr = PRESETS[kindSel.value];
    name.value = pr.label; model.value = pr.model; rate.value = pr.rate; qty.value = pr.qty; unit.value = pr.unit; divisor.value = pr.divisor;
    draftDays.clear(); pr.days.forEach((d) => draftDays.add(d));
    daysBox.querySelectorAll("input").forEach((box, i) => { box.checked = draftDays.has([1, 2, 3, 4, 5, 6, 0][i]); });
    syncModel();
  });
  model.addEventListener("change", syncModel);

  let armed = false;
  const del = existing ? h("button", { type: "button", class: "btn danger", onclick: (e) => {
    if (!armed) { armed = true; e.target.textContent = "Tap again to delete"; e.target.classList.add("armed"); setTimeout(() => { armed = false; e.target.textContent = "Delete helper"; e.target.classList.remove("armed"); }, 4000); return; }
    dlg.close(); commit(removeHelper(state, existing.id)); toast("Helper deleted");
  } }, "Delete helper") : h("span", {});

  const form = h("form", { onsubmit: (e) => {
    e.preventDefault();
    const rt = Number(rate.value);
    if (!name.value.trim()) return void (err.textContent = "Give them a name.");
    if (!Number.isFinite(rt) || rt <= 0) return void (err.textContent = "Enter the pay amount.");
    if (draftDays.size === 0) return void (err.textContent = "Pick at least one day they come.");
    const input = {
      kind: kindSel.value, name: name.value, model: model.value, rate: rt, qty: Number(qty.value) || 1, unit: unit.value,
      days: [...draftDays], startDate: start.value, divisor: divisor.value,
      rateChanges: rcs.filter((c) => parseYmd(c.from) && Number(c.rate) > 0).map((c) => ({ from: c.from, rate: Number(c.rate) })),
    };
    if (existing) commit(updateHelper(state, existing.id, input));
    else { const r = addHelper(state, input); ui.id = r.helper.id; commit(r.state); }
    dlg.close();
    toast(existing ? "Saved" : "Added");
  } },
    h("h2", { id: "dlgTitle" }, existing ? "Edit " + existing.name : "Add a helper"),
    h("div", { class: "grid2" }, h("label", { class: "field" }, "Type", kindSel), h("label", { class: "field" }, "Name", name)),
    h("div", { class: "fieldset" }, h("label", { class: "field" }, "How are they paid?", model)),
    h("div", { class: "grid2" }, h("label", { class: "field" }, rateLabel, rate), divRow),
    unitRow,
    h("fieldset", { class: "fieldset" }, h("legend", {}, "Days they usually come"), daysBox),
    h("div", { class: "grid2" }, h("label", { class: "field" }, "Started on (optional)", start)),
    h("fieldset", { class: "fieldset" }, h("legend", {}, "Rate changes"), rcBox,
      h("button", { type: "button", class: "btn small", onclick: () => { rcs.push({ from: ymd(ui.y, ui.m, 1), rate: rate.value }); paintRc(); } }, "+ Add a rate change"),
      h("p", { class: "hint" }, "For example, milk goes up on the 16th. Days before that keep the old rate.")),
    err,
    h("div", { class: "dlgfoot" }, del, h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancel"), h("button", { type: "submit", class: "btn primary" }, "Save"))));
  $("dlgBody").replaceChildren(form);
  syncModel();
  paintRc();
  dlg.showModal();
  name.focus();
  name.select();
}

/* ---------- footer, months ---------- */
function go(delta) { const s = shiftMonth(ui.y, ui.m, delta); ui.y = s.y; ui.m = s.m; ui.date = null; render(false); }
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
$("today").addEventListener("click", () => { const n = new Date(); ui.y = n.getFullYear(); ui.m = n.getMonth() + 1; ui.date = null; render(false); });
$("printBtn").addEventListener("click", () => window.print());
$("csvBtn").addEventListener("click", () => {
  if (!state.helpers.length) return toast("Add a helper first");
  download(`hisaab-${monthKey(ui.y, ui.m)}.csv`, monthCSV(state, ui.y, ui.m, todayYmd()), "text/csv");
});
$("exportBtn").addEventListener("click", () => {
  if (!state.helpers.length) return toast("Nothing to back up yet");
  download(`hisaab-backup-${todayYmd()}.json`, backupJSON(state), "application/json");
  toast("Backup saved to your downloads");
});
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let next = null;
  try { if (file.size < 5e6) next = normalizeState(JSON.parse(await file.text())); } catch { /* handled below */ }
  if (!next) return toast("That is not a Hisaab backup");
  if (state.helpers.length && !window.confirm("Replace what is on this device with the backup?")) return;
  commit(next);
  toast(`Restored ${next.helpers.length} ${next.helpers.length === 1 ? "helper" : "helpers"}`);
});
let eraseArmed = false;
$("eraseBtn").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (!eraseArmed) { eraseArmed = true; b.textContent = "Tap again to erase"; b.classList.add("armed"); setTimeout(() => { eraseArmed = false; b.textContent = "Erase everything"; b.classList.remove("armed"); }, 4000); return; }
  eraseArmed = false; b.textContent = "Erase everything"; b.classList.remove("armed");
  ui.date = null;
  commit(emptyState());
  toast("Everything erased");
});

load();
render(false);
