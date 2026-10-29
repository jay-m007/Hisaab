// A small made-up household so a first-time visitor can see how it works.
import { emptyState, addHelper, setDay, addPayment, daysInMonth, ymd } from "./engine/index.js";

export function sampleState(y, m) {
  let s = emptyState();
  const dim = daysInMonth(y, m);
  const day = (d) => ymd(y, m, Math.min(d, dim));

  const maid = addHelper(s, { kind: "maid", name: "Sunita", rate: 3000 });
  s = maid.state;
  s = setDay(s, maid.helper.id, day(5), { s: "missed" });
  s = setDay(s, maid.helper.id, day(12), { s: "missed" });
  s = addPayment(s, maid.helper.id, { date: day(10), amount: 1000, note: "advance" });

  const milk = addHelper(s, { kind: "milk", name: "Ramesh", rate: 56, qty: 1, unit: "L" });
  s = milk.state;
  s = setDay(s, milk.helper.id, day(8), { q: 2 });
  s = setDay(s, milk.helper.id, day(9), { q: 2 });
  s = setDay(s, milk.helper.id, day(15), { q: 0 });

  const tiffin = addHelper(s, { kind: "tiffin", name: "Anita", rate: 85 });
  s = tiffin.state;
  s = setDay(s, tiffin.helper.id, day(3), { s: "missed" });

  const paper = addHelper(s, { kind: "newspaper", name: "Newspaper", rate: 6 });
  s = paper.state;
  return s;
}
