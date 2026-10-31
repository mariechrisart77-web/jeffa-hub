// v85 (20): aus chat.js ausgelagert – Verhalten unverändert.
// Leseansicht: Pinch-Zoom, Höhe an iOS-Tastatur anpassen, Leisten beim Scrollen ausblenden.
import { settingsGet } from './chat-util.js';

// ---- Pinch-to-zoom for chat text (persisted)
function applyTextScale(v) { document.documentElement.style.setProperty('--chat-scale', String(v)); }
export function initPinchZoom(el) {
  let start = 0, base = 1;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  base = Number(settingsGet().textScale) || 1; applyTextScale(base);
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { start = dist(e.touches); base = Number(settingsGet().textScale) || 1; } }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !start) return;
    e.preventDefault();
    const v = Math.max(0.8, Math.min(1.8, Math.round(base * dist(e.touches) / start * 20) / 20));
    applyTextScale(v); el.dataset.scale = v;
  }, { passive: false });
  el.addEventListener('touchend', (e) => {
    if (start && e.touches.length < 2) { start = 0; const v = Number(el.dataset.scale) || base; const s = settingsGet(); s.textScale = v; localStorage.setItem('jeffa.settings', JSON.stringify(s)); }
  });
  // Desktop: ctrl+wheel (trackpad pinch)
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; e.preventDefault();
    const s = settingsGet(); const v = Math.max(0.8, Math.min(1.8, Math.round(((Number(s.textScale) || 1) - e.deltaY * 0.01) * 20) / 20));
    s.textScale = v; localStorage.setItem('jeffa.settings', JSON.stringify(s)); applyTextScale(v);
  }, { passive: false });
}


// ---- v30: reading area (hide bars on scroll, ⋯ menu, fit 100dvh, 📸 sheet) ----
function fitChat() {
  const p = document.getElementById('tab-chat'); if (!p || !p.classList.contains('active')) return;
  // v54 iOS keyboard: the layout viewport keeps its height while the keyboard is open and Safari scrolls the page,
  // so the input floated to the top with empty space below. Shrink the app to the visual viewport and undo the page scroll.
  const vv = window.visualViewport, vh = vv?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(vh) + 'px');
  if ((vv && vv.offsetTop > 0) || window.scrollY > 0) window.scrollTo(0, 0);
  const top = Math.max(0, p.getBoundingClientRect().top);
  p.style.height = Math.max(240, Math.round(vh - top)) + 'px';
}
let fitRaf = 0;
export const scheduleFit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitChat); };
export function setImmersive(on) {
  if (document.body.classList.contains('chat-immersive') === on) return;
  document.body.classList.toggle('chat-immersive', on); scheduleFit();
}
export function wireReadingArea(root, { currentConv, chooseChatModel, openPhotoSheet }) {
  const msgs = root.querySelector('#messages'), menu = root.querySelector('#hdr-menu'), more = root.querySelector('#more-btn');
  let lastY = 0;
  msgs.addEventListener('scroll', () => {
    const y = msgs.scrollTop, d = y - lastY; lastY = y;
    if (Math.abs(d) < 8) return;
    if (d > 0 && y > 60 && msgs.scrollHeight - msgs.clientHeight - y > 4) setImmersive(true);
    else if (d < 0) setImmersive(false);
  }, { passive: true });
  msgs.addEventListener('click', (e) => { if (!e.target.closest('button,a,img,video,input,select,textarea,summary')) setImmersive(false); });
  more.onclick = (e) => { e.stopPropagation(); const open = menu.classList.toggle('hidden') === false; more.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', (e) => { if (!menu.classList.contains('hidden') && !e.target.closest('#hdr-menu')) { menu.classList.add('hidden'); more.setAttribute('aria-expanded', 'false'); } });
  root.querySelector('#cast-btn').addEventListener('click', () => menu.classList.add('hidden'));
  root.querySelector('#menu-model').onclick = () => { menu.classList.add('hidden'); const c = currentConv(); if (c) chooseChatModel(c); };
  root.querySelector('#photo-btn').onclick = () => openPhotoSheet();
  if (!window.__jeffaFit) {
    window.__jeffaFit = true;
    addEventListener('resize', scheduleFit); window.visualViewport?.addEventListener('resize', scheduleFit); window.visualViewport?.addEventListener('scroll', scheduleFit);
    document.addEventListener('focusin', (e) => { if (e.target.matches?.('textarea,input')) { scheduleFit(); setTimeout(scheduleFit, 350); } });
    document.addEventListener('focusout', () => setTimeout(scheduleFit, 100));
    const p = document.getElementById('tab-chat');
    if (p) new MutationObserver(() => { if (!p.classList.contains('active')) document.body.classList.remove('chat-immersive'); scheduleFit(); }).observe(p, { attributes: true, attributeFilter: ['class'] });
    const ro = window.ResizeObserver ? new ResizeObserver(scheduleFit) : null;
    document.querySelectorAll('.app-header, nav.tabs-nav, #install-banner').forEach(el => ro?.observe(el));
  }
  scheduleFit(); setTimeout(fitChat, 300);
}

