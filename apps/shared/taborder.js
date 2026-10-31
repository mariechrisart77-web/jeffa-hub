// v84b: reine Helfer für die Kachel-Reihenfolge (ohne DOM/localStorage – Node-testbar).

export const TAB_ORDER_KEY = 'jeffa.tabOrder';

export function applyTabOrder(ids, saved) {
  const all = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  const known = new Set(all);
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(saved) ? saved : []) {
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of all) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function moveId(list, fromIdx, toIdx) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const n = arr.length;
  if (!n) return arr;
  let from = Number.isInteger(fromIdx) ? fromIdx : -1;
  let to = Number.isInteger(toIdx) ? toIdx : -1;
  if (from < 0 || from >= n) return arr;
  if (to < 0) to = 0;
  if (to >= n) to = n - 1;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
}
