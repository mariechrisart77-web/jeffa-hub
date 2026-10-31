// v78: Bild-Kontext kürzen (Token sparen): nur die letzten relevanten Nachrichten, gekürzt.
export const IMG_CTX = { count: 4, last: 1200, other: 400 };
export function imageContext(messages, o = IMG_CTX) {
  const list = (messages || []).filter((m) => m && !m.generated && m.content && !/^\s*\[(bild|image|foto)[^\]]*\]\s*$/i.test(String(m.content)));
  return list.slice(-o.count).map((m, i, a) => ({ role: m.role, content: String(m.content).replace(/\s+/g, ' ').trim().slice(0, i === a.length - 1 ? o.last : o.other) }));
}
