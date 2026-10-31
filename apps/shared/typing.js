// Typing-friendly text fields (v29).
// Touch devices: Enter = newline, only the send button sends. Desktop with a physical keyboard: Enter sends, Shift+Enter = newline.
// Never sends while an IME / autocorrect composition is active (isComposing / keyCode 229) – that sent half-corrected words before.
export function isTouchDevice() {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches, fine = matchMedia('(any-pointer: fine)').matches, hover = matchMedia('(hover: hover)').matches;
    return coarse && !(fine && hover) || (navigator.maxTouchPoints > 0 && !hover);
  } catch { return false; }
}

export function enterShouldSend(e, touch = isTouchDevice()) {
  if (e.key !== 'Enter' || e.shiftKey || e.altKey) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  return !touch;
}

/** ta: textarea; onSend: () => void (optional); opts: { maxPx } */
export function setupTyping(ta, onSend, { maxPx = 220, minPx = 48 } = {}) {
  if (!ta || ta.dataset.typing) return ta;
  ta.dataset.typing = '1';
  ta.setAttribute('autocorrect', 'on'); ta.setAttribute('autocapitalize', 'sentences'); ta.setAttribute('spellcheck', 'true');
  ta.setAttribute('lang', 'de'); ta.setAttribute('enterkeyhint', 'enter'); ta.setAttribute('autocomplete', 'on');
  ta.classList.add('typing-field');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(minPx, Math.min(ta.scrollHeight + 2, maxPx)) + 'px'; };
  ta.addEventListener('input', grow);
  if (onSend) ta.addEventListener('keydown', (e) => { if (enterShouldSend(e)) { e.preventDefault(); onSend(); } });
  ta._grow = grow; grow();
  return ta;
}
