// v62: sidebar row info from the conversation already in memory (no fetches)
const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
export function relTime(ts, now = new Date()) {
  const d = new Date(ts); if (!ts || isNaN(d)) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff <= 0) return 'heute ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (diff === 1) return 'gestern';
  if (diff < 7) return WD[d.getDay()];
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + (d.getFullYear() !== now.getFullYear() ? String(d.getFullYear()).slice(2) : '');
}
export function convMeta(c) {
  const ms = Array.isArray(c?.messages) ? c.messages : [];
  let last = null; for (let i = ms.length - 1; i >= 0; i--) { const t = String(ms[i]?.content || '').replace(/\[(?:FOTO|BILD|PHOTO)[^\]]*\]?/gi, '').replace(/\s+/g, ' ').trim(); if (t) { last = { ...ms[i], text: t }; break; } }
  const lastTs = ms.length ? (ms[ms.length - 1].ts || c.updatedAt) : c?.updatedAt;
  const preview = last ? (last.role === 'user' ? 'Du: ' : '') + last.text.slice(0, 90) : '';
  return { count: ms.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).length, hasImages: ms.some((m) => m?.imageUrl || m?.videoUrl), preview, lastTs };
}
