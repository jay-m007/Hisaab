// The message you send the helper (or keep for yourself) at the end of the month.
import { formatINR } from "./money.js";
import { MONTHS_EN, MONTHS_HI, parseYmd } from "./dates.js";

export const LANGS = { en: "English", hinglish: "Hinglish", hi: "हिन्दी" };

const T = {
  en: {
    hello: (n) => `Hi ${n},`,
    title: (mo) => `Hisaab for ${mo}:`,
    came: (n) => `Came: ${n} ${n === 1 ? "day" : "days"}`,
    missed: (n, ds) => `Missed: ${n} ${n === 1 ? "day" : "days"} (${ds})`,
    extra: (n, ds) => `Extra: ${n} ${n === 1 ? "day" : "days"} (${ds})`,
    units: (u, unit) => `Total ${u} ${unit}`,
    base: (a) => `Monthly pay: ${a}`,
    deduct: (a) => `Deduction for missed days: -${a}`,
    plus: (a) => `Added for extra days: +${a}`,
    total: (a) => `Total: ${a}`,
    paid: (a) => `Paid so far: ${a}`,
    due: (a) => `Balance to pay: ${a}`,
    clear: "All settled.",
    advance: (a) => `Paid in advance: ${a}`,
    thanks: "Thank you!",
    month: (m, y) => `${MONTHS_EN[m - 1]} ${y}`,
    dayWord: (p) => `${p.d} ${MONTHS_EN[p.m - 1].slice(0, 3)}`,
  },
  hinglish: {
    hello: (n) => `Namaste ${n},`,
    title: (mo) => `${mo} ka hisaab:`,
    came: (n) => `Aaye: ${n} din`,
    missed: (n, ds) => `Nahi aaye: ${n} din (${ds})`,
    extra: (n, ds) => `Extra din: ${n} (${ds})`,
    units: (u, unit) => `Kul ${u} ${unit}`,
    base: (a) => `Mahine ki tankhwah: ${a}`,
    deduct: (a) => `Chhutti ka katauti: -${a}`,
    plus: (a) => `Extra din ka jodh: +${a}`,
    total: (a) => `Kul: ${a}`,
    paid: (a) => `Ab tak diye: ${a}`,
    due: (a) => `Baaki dena hai: ${a}`,
    clear: "Hisaab barabar.",
    advance: (a) => `Advance diya hua: ${a}`,
    thanks: "Dhanyavaad!",
    month: (m, y) => `${MONTHS_EN[m - 1]} ${y}`,
    dayWord: (p) => `${p.d} ${MONTHS_EN[p.m - 1].slice(0, 3)}`,
  },
  hi: {
    hello: (n) => `नमस्ते ${n},`,
    title: (mo) => `${mo} का हिसाब:`,
    came: (n) => `आए: ${n} दिन`,
    missed: (n, ds) => `नहीं आए: ${n} दिन (${ds})`,
    extra: (n, ds) => `अतिरिक्त दिन: ${n} (${ds})`,
    units: (u, unit) => `कुल ${u} ${unit}`,
    base: (a) => `महीने की तनख़्वाह: ${a}`,
    deduct: (a) => `छुट्टी की कटौती: -${a}`,
    plus: (a) => `अतिरिक्त दिन का जोड़: +${a}`,
    total: (a) => `कुल: ${a}`,
    paid: (a) => `अब तक दिए: ${a}`,
    due: (a) => `बाकी देना है: ${a}`,
    clear: "हिसाब बराबर।",
    advance: (a) => `अग्रिम दिया हुआ: ${a}`,
    thanks: "धन्यवाद!",
    month: (m, y) => `${MONTHS_HI[m - 1]} ${y}`,
    dayWord: (p) => `${p.d} ${MONTHS_HI[p.m - 1]}`,
  },
};

function dateList(dates, t) {
  const parts = dates.map(parseYmd).filter(Boolean);
  if (parts.length === 0) return "";
  // Same month: "12, 19 Oct" rather than "12 Oct, 19 Oct"
  const last = parts[parts.length - 1];
  const tail = t.dayWord(last).replace(/^\d+\s*/, "");
  return parts.map((p) => p.d).join(", ") + " " + tail;
}

/**
 * buildMessage({ helper, y, m, bill, paid, lang }) -> text
 * `bill` comes from computeBill; `paid` is in paise.
 */
export function buildMessage({ helper, y, m, bill, paid = 0, lang = "en" }) {
  const t = T[lang] || T.en;
  const lines = [t.hello(helper.name || ""), t.title(t.month(m, y))];
  lines.push("• " + t.came(bill.counts.came));
  if (bill.counts.missed) lines.push("• " + t.missed(bill.counts.missed, dateList(bill.missedDates, t)));
  if (bill.counts.extra) lines.push("• " + t.extra(bill.counts.extra, dateList(bill.extraDates, t)));
  if (helper.model === "unit") lines.push("• " + t.units(trimNum(bill.units), helper.unit || "units"));
  lines.push("");
  if (helper.model === "monthly") {
    lines.push(t.base(formatINR(bill.base)));
    if (bill.deduction) lines.push(t.deduct(formatINR(bill.deduction)));
    if (bill.extra) lines.push(t.plus(formatINR(bill.extra)));
  }
  lines.push(t.total(formatINR(bill.total)));
  if (paid) lines.push(t.paid(formatINR(paid)));
  const due = bill.total - paid;
  if (due > 0) lines.push(t.due(formatINR(due)));
  else if (due < 0) lines.push(t.advance(formatINR(-due)));
  else lines.push(t.clear);
  lines.push("", t.thanks);
  return lines.join("\n");
}

function trimNum(n) {
  return String(Math.round(n * 100) / 100);
}
