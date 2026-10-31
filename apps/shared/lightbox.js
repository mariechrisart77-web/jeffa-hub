// Dependency-free zoom lightbox: tap/click any content photo to open.
// Mobile: pinch-zoom, drag to pan, double-tap to zoom. Desktop: wheel, drag, +/− buttons, Esc.
const MIN = 1, MAX = 6;
let box, img, s = 1, x = 0, y = 0;
const pts = new Map(); let pinch = null, drag = null, lastTap = 0, moved = false;

function apply() { img.style.transform = `translate(${x}px,${y}px) scale(${s})`; }
function clampPan() {
  const r = img.getBoundingClientRect(), w = r.width / s, h = r.height / s;
  const mx = Math.max(0, (w * s - innerWidth) / 2), my = Math.max(0, (h * s - innerHeight) / 2);
  x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
}
function zoomAt(ns, cx, cy) {
  ns = Math.max(MIN, Math.min(MAX, ns));
  const ox = cx - innerWidth / 2, oy = cy - innerHeight / 2;
  x = ox - (ox - x) * ns / s; y = oy - (oy - y) * ns / s; s = ns;
  if (s === 1) { x = 0; y = 0; } else clampPan();
  apply();
}
function close() { box.hidden = true; img.removeAttribute('src'); document.body.style.overflow = ''; }
export function openLightbox(src, alt = '') {
  build(); s = 1; x = 0; y = 0; img.style.transition = ''; apply();
  img.src = src; img.alt = alt; box.hidden = false; document.body.style.overflow = 'hidden';
}
function build() {
  if (box) return;
  box = document.createElement('div'); box.className = 'jl-box'; box.hidden = true;
  box.innerHTML = `<img class="jl-img" draggable="false"><div class="jl-bar"><button data-z="out" aria-label="Verkleinern">−</button><button data-z="in" aria-label="Vergrößern">+</button><button data-z="x" aria-label="Schließen">✕</button></div>`;
  const st = document.createElement('style');
  st.textContent = `.jl-box{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);touch-action:none;overflow:hidden;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
.jl-box[hidden]{display:none}.jl-img{max-width:100vw;max-height:100vh;object-fit:contain;transform-origin:center;will-change:transform;touch-action:none;cursor:grab}
.jl-bar{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);right:10px;display:flex;gap:8px}
.jl-bar button{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer}`;
  document.head.appendChild(st); document.body.appendChild(box); img = box.querySelector('.jl-img');
  box.querySelector('.jl-bar').addEventListener('click', (e) => {
    const z = e.target.closest('button')?.dataset.z; if (!z) return; e.stopPropagation();
    if (z === 'x') return close();
    img.style.transition = 'transform .15s'; zoomAt(s * (z === 'in' ? 1.6 : 1 / 1.6), innerWidth / 2, innerHeight / 2);
  });
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.jl-bar')) return;
    img.style.transition = ''; box.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; }
    else if (pts.size === 1) drag = { x: e.clientX - x, y: e.clientY - y, sx: e.clientX, sy: e.clientY };
  });
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; moved = true; zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, pinch.cx, pinch.cy); }
    else if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) moved = true;
      if (s > 1) { x = e.clientX - drag.x; y = e.clientY - drag.y; clampPan(); apply(); }
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const p = [...pts.values()][0]; drag = { x: p.x - x, y: p.y - y, sx: p.x, sy: p.y }; moved = true; return; }
    if (pts.size) return; drag = null;
    if (moved || e.type === 'pointercancel') return;
    const now = Date.now();
    if (now - lastTap < 300) { lastTap = 0; img.style.transition = 'transform .2s'; zoomAt(s > 1 ? 1 : 2.5, e.clientX, e.clientY); return; }
    lastTap = now;
    if (e.target !== img) setTimeout(() => { if (lastTap === now && s === 1) close(); }, 300); // tap outside closes
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', (e) => { e.preventDefault(); img.style.transition = ''; zoomAt(s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY); }, { passive: false });
  addEventListener('keydown', (e) => { if (box.hidden) return; if (e.key === 'Escape') close(); if (e.key === '+' || e.key === '=') zoomAt(s * 1.6, innerWidth / 2, innerHeight / 2); if (e.key === '-') zoomAt(s / 1.6, innerWidth / 2, innerHeight / 2); });
}
// Delegated: any content <img> (not icons, not inside buttons/links/lightbox) opens the viewer.
export function initLightbox() {
  document.addEventListener('click', (e) => {
    const t = e.target; if (!(t instanceof HTMLImageElement)) return;
    if (t.closest('.jl-box, button, a, [data-no-zoom]') || t.naturalWidth < 48 || t.getBoundingClientRect().width < 32) return;
    e.preventDefault(); e.stopPropagation(); openLightbox(t.currentSrc || t.src, t.alt);
  }, true);
}
