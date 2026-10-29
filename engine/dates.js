// Calendar dates are plain "YYYY-MM-DD" strings, so there are no time zone surprises.

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Sunday ... 6 = Saturday */
export function dowOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function monthKey(y, m) {
  return `${y}-${pad(m)}`;
}

export function shiftMonth(y, m, delta) {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

/** Today in the device's own time zone. */
export function todayYmd(now = new Date()) {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
export const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-12" -> "12 Oct" */
export function shortDate(s) {
  const p = parseYmd(s);
  return p ? `${p.d} ${MONTHS_EN[p.m - 1].slice(0, 3)}` : String(s);
}
