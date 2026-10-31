// v85 (20): aus chat.js ausgelagert – Verhalten unverändert.
// Kleine Helfer ohne Chat-Zustand.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function toast(msg) {
  const c = document.getElementById('toast-container');
  if (!c) return alert(msg);
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
export function settingsGet() { try { return JSON.parse(localStorage.getItem('jeffa.settings') || '{}'); } catch { return {}; } }
export function fileToB64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}
export async function resizeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
