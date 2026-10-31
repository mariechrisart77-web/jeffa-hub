import { api, getSession, setSession, faceIdEnabled } from './api.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function registerWebAuthn() {
  const options = await api('/api/auth/webauthn/register/options', { method: 'POST' });
  options.challenge = b64urlDecode(options.challenge);
  options.user.id = b64urlDecode(options.user.id);
  const credential = await navigator.credentials.create({ publicKey: options });
  await api('/api/auth/webauthn/register/verify', {
    method: 'POST',
    body: {
      id: credential.id,
      rawId: b64urlEncode(credential.rawId),
      response: {
        clientDataJSON: b64urlEncode(credential.response.clientDataJSON),
        attestationObject: b64urlEncode(credential.response.attestationObject),
      },
    },
  });
}

export async function loginWebAuthn() {
  const options = await api('/api/auth/webauthn/login/options', { method: 'POST' });
  options.challenge = b64urlDecode(options.challenge);
  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map(c => ({ ...c, id: b64urlDecode(c.id) }));
  }
  const assertion = await navigator.credentials.get({ publicKey: options });
  const result = await api('/api/auth/webauthn/login/verify', {
    method: 'POST',
    body: {
      id: assertion.id,
      response: {
        clientDataJSON: b64urlEncode(assertion.response.clientDataJSON),
        authenticatorData: b64urlEncode(assertion.response.authenticatorData),
        signature: b64urlEncode(assertion.response.signature),
      },
    },
  });
  setSession(result.token);
  return result;
}

export async function setupPin(pin) {
  await api('/api/auth/pin/setup', { method: 'POST', body: { pin } });
}

export async function loginPin(pin) {
  const result = await api('/api/auth/pin/login', { method: 'POST', body: { pin } });
  setSession(result.token);
  return result;
}

export async function authState() {
  return api('/api/auth/state');
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  setSession(null);
}

let adminModalInjected = false;
function injectAdminModalStyles() {
  if (adminModalInjected) return;
  adminModalInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.jf-modal{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px)}
.jf-modal-box{background:#0F131C;border:1px solid #1E2636;border-radius:16px;padding:32px;width:90%;max-width:340px;text-align:center}
.jf-modal h2{margin:0 0 24px;font-size:20px;font-weight:600;color:#fff}
.jf-modal button{width:100%;padding:14px;border:none;border-radius:999px;font-size:15px;font-weight:500;cursor:pointer;margin-bottom:12px;transition:.2s}
.jf-modal .primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.jf-modal .primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,.4)}
.jf-modal .secondary{background:#1E2636;color:#fff}
.jf-modal .secondary:hover{background:#252d3f}
.jf-pin{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}
.jf-pin button{aspect-ratio:1;padding:0;font-size:24px;border-radius:12px;background:#1E2636;color:#fff;border:1px solid #252d3f}
.jf-pin button:hover{background:#252d3f;border-color:#38BDF8}
.jf-pin button:active{transform:scale(.95)}
.jf-pin-display{background:#0A0D12;border:1px solid #1E2636;border-radius:12px;padding:16px;font-size:32px;letter-spacing:8px;margin-bottom:16px;height:68px;box-sizing:border-box;line-height:1;overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:monospace}
.jf-modal .error{color:#ef4444;margin-top:16px;font-size:14px}
`;
  document.head.appendChild(style);
}

export async function ensureAdmin() {
  injectAdminModalStyles();
  const state = await authState();
  if (state.session?.role === 'admin') return state.session;

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'jf-modal';
    modal.innerHTML = `
<div class="jf-modal-box">
  <h2>Admin-Zugriff erforderlich</h2>
  ${faceIdEnabled() || !state.pinSet ? '<button class="primary webauthn-btn">🔐 Face ID / Touch ID</button>' : ''}
  ${state.pinSet ? '<button class="primary pin-btn">🔢 PIN eingeben</button>' : ''}
  <button class="secondary cancel-btn">Abbrechen</button>
  <div class="error" style="display:none"></div>
</div>`;
    document.body.appendChild(modal);

    const showError = (msg) => {
      const err = modal.querySelector('.error');
      err.textContent = msg;
      err.style.display = 'block';
      setTimeout(() => err.style.display = 'none', 3000);
    };

    modal.querySelector('.webauthn-btn').onclick = async () => {
      try {
        await loginWebAuthn();
        const session = await authState();
        modal.remove();
        resolve(session.session);
      } catch (e) {
        showError(e.message || 'Face ID fehlgeschlagen');
      }
    };

    const pinBtn = modal.querySelector('.pin-btn');
    if (pinBtn) {
      pinBtn.onclick = () => {
        modal.querySelector('.jf-modal-box').innerHTML = `
<h2>PIN eingeben</h2>
<div class="jf-pin-display"></div>
<div class="jf-pin">
  <button data-digit="1">1</button>
  <button data-digit="2">2</button>
  <button data-digit="3">3</button>
  <button data-digit="4">4</button>
  <button data-digit="5">5</button>
  <button data-digit="6">6</button>
  <button data-digit="7">7</button>
  <button data-digit="8">8</button>
  <button data-digit="9">9</button>
  <button data-digit="back">←</button>
  <button data-digit="0">0</button>
  <button data-digit="ok">✓</button>
</div>
<button class="secondary" style="margin-top:12px">Zurück</button>
<div class="error" style="display:none"></div>`;

        let pin = '';
        const display = modal.querySelector('.jf-pin-display');
        const updateDisplay = () => {
          display.textContent = '●'.repeat(pin.length);
        };

        modal.querySelectorAll('[data-digit]').forEach(btn => {
          btn.onclick = async () => {
            const digit = btn.dataset.digit;
            if (digit === 'back') {
              pin = pin.slice(0, -1);
              updateDisplay();
            } else if (digit === 'ok' && pin.length === 4) {
              try {
                await loginPin(pin);
                const session = await authState();
                modal.remove();
                resolve(session.session);
              } catch (e) {
                showError(e.message || 'Falscher PIN');
                pin = '';
                updateDisplay();
              }
            } else if (digit !== 'ok' && pin.length < 4) {
              pin += digit;
              updateDisplay();
              if (pin.length === 4) {
                btn.closest('.jf-pin').querySelector('[data-digit="ok"]').focus();
              }
            }
          };
        });
        const onKey = (ev) => {
          if (!document.contains(modal)) { document.removeEventListener('keydown', onKey); return; }
          const d = /^[0-9]$/.test(ev.key) ? ev.key : ev.key === 'Backspace' ? 'back' : ev.key === 'Enter' ? 'ok' : null;
          if (!d || ev.target?.tagName === 'INPUT' || ev.target?.tagName === 'TEXTAREA') return;
          ev.preventDefault(); modal.querySelector(`[data-digit="${d}"]`)?.click();
        };
        if (modal._onKey) document.removeEventListener('keydown', modal._onKey); modal._onKey = onKey;
        document.addEventListener('keydown', onKey);

        modal.querySelector('.secondary').onclick = () => {
          modal.remove();
          ensureAdmin().then(resolve);
        };
      };
    }

    modal.querySelector('.cancel-btn').onclick = () => {
      modal.remove();
      resolve(null);
    };
  });
}

export async function lockScreen() {
  injectAdminModalStyles();
  const state = await authState();
  const hasAuth = state.pinSet || state.passkeys > 0;

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'jf-modal';
    modal.innerHTML = `
<div class="jf-modal-box">
  <h2>Jeffa entsperren</h2>
  ${state.passkeys > 0 && (faceIdEnabled() || !state.pinSet) ? '<button class="primary webauthn-btn">🔐 Face ID / Touch ID</button>' : ''}
  ${state.pinSet ? '<button class="primary pin-btn">🔢 PIN eingeben</button>' : ''}
  ${!hasAuth ? '<button class="primary setup-btn">Einrichten</button><button class="secondary skip-btn">Später</button>' : ''}
  <div class="error" style="display:none"></div>
</div>`;
    document.body.appendChild(modal);

    const showError = (msg) => {
      const err = modal.querySelector('.error');
      err.textContent = msg;
      err.style.display = 'block';
      setTimeout(() => err.style.display = 'none', 3000);
    };

    const webauthnBtn = modal.querySelector('.webauthn-btn');
    if (webauthnBtn) {
      webauthnBtn.onclick = async () => {
        try {
          await loginWebAuthn();
          modal.remove();
          resolve(true);
        } catch (e) {
          showError(e.message || 'Face ID fehlgeschlagen');
        }
      };
    }

    const pinBtn = modal.querySelector('.pin-btn');
    if (pinBtn) {
      pinBtn.onclick = () => {
        modal.querySelector('.jf-modal-box').innerHTML = `
<h2>PIN eingeben</h2>
<div class="jf-pin-display"></div>
<div class="jf-pin">
  <button data-digit="1">1</button>
  <button data-digit="2">2</button>
  <button data-digit="3">3</button>
  <button data-digit="4">4</button>
  <button data-digit="5">5</button>
  <button data-digit="6">6</button>
  <button data-digit="7">7</button>
  <button data-digit="8">8</button>
  <button data-digit="9">9</button>
  <button data-digit="back">←</button>
  <button data-digit="0">0</button>
  <button data-digit="ok">✓</button>
</div>
<button class="secondary back-btn">Zurück</button>
<div class="error" style="display:none"></div>`;

        let pin = '';
        const display = modal.querySelector('.jf-pin-display');
        const updateDisplay = () => {
          display.textContent = '●'.repeat(pin.length);
        };

        modal.querySelectorAll('[data-digit]').forEach(btn => {
          btn.onclick = async () => {
            const digit = btn.dataset.digit;
            if (digit === 'back') {
              pin = pin.slice(0, -1);
              updateDisplay();
            } else if (digit === 'ok' && pin.length === 4) {
              try {
                await loginPin(pin);
                modal.remove();
                resolve(true);
              } catch (e) {
                showError(e.message || 'Falscher PIN');
                pin = '';
                updateDisplay();
              }
            } else if (digit !== 'ok' && pin.length < 4) {
              pin += digit;
              updateDisplay();
            }
          };
        });
        const onKey = (ev) => {
          if (!document.contains(modal)) { document.removeEventListener('keydown', onKey); return; }
          const d = /^[0-9]$/.test(ev.key) ? ev.key : ev.key === 'Backspace' ? 'back' : ev.key === 'Enter' ? 'ok' : null;
          if (!d || ev.target?.tagName === 'INPUT' || ev.target?.tagName === 'TEXTAREA') return;
          ev.preventDefault(); modal.querySelector(`[data-digit="${d}"]`)?.click();
        };
        if (modal._onKey) document.removeEventListener('keydown', modal._onKey); modal._onKey = onKey;
        document.addEventListener('keydown', onKey);

        modal.querySelector('.back-btn').onclick = () => {
          modal.remove();
          lockScreen().then(resolve);
        };
      };
    }

    const setupBtn = modal.querySelector('.setup-btn');
    if (setupBtn) {
      setupBtn.onclick = () => {
        modal.querySelector('.jf-modal-box').innerHTML = `
<h2>Schutz einrichten</h2>
<button class="primary webauthn-setup">🔐 Face ID / Touch ID</button>
<button class="secondary pin-setup">🔢 PIN erstellen</button>
<button class="secondary back-btn">Zurück</button>
<div class="error" style="display:none"></div>`;

        modal.querySelector('.webauthn-setup').onclick = async () => {
          try {
            await registerWebAuthn();
            await loginWebAuthn();
            modal.remove();
            resolve(true);
          } catch (e) {
            showError(e.message || 'Setup fehlgeschlagen');
          }
        };

        modal.querySelector('.pin-setup').onclick = () => {
          modal.querySelector('.jf-modal-box').innerHTML = `
<h2>PIN erstellen (4 Ziffern)</h2>
<div class="jf-pin-display"></div>
<div class="jf-pin">
  <button data-digit="1">1</button>
  <button data-digit="2">2</button>
  <button data-digit="3">3</button>
  <button data-digit="4">4</button>
  <button data-digit="5">5</button>
  <button data-digit="6">6</button>
  <button data-digit="7">7</button>
  <button data-digit="8">8</button>
  <button data-digit="9">9</button>
  <button data-digit="back">←</button>
  <button data-digit="0">0</button>
  <button data-digit="ok">✓</button>
</div>
<button class="secondary back-btn">Zurück</button>
<div class="error" style="display:none"></div>`;

          let pin = '';
          const display = modal.querySelector('.jf-pin-display');
          const updateDisplay = () => {
            display.textContent = '●'.repeat(pin.length);
          };

          modal.querySelectorAll('[data-digit]').forEach(btn => {
            btn.onclick = async () => {
              const digit = btn.dataset.digit;
              if (digit === 'back') {
                pin = pin.slice(0, -1);
                updateDisplay();
              } else if (digit === 'ok' && pin.length === 4) {
                try {
                  await setupPin(pin);
                  await loginPin(pin);
                  modal.remove();
                  resolve(true);
                } catch (e) {
                  showError(e.message || 'Setup fehlgeschlagen');
                  pin = '';
                  updateDisplay();
                }
              } else if (digit !== 'ok' && pin.length < 4) {
                pin += digit;
                updateDisplay();
              }
            };
          });
          const onKey = (ev) => {
            if (!document.contains(modal)) { document.removeEventListener('keydown', onKey); return; }
            const d = /^[0-9]$/.test(ev.key) ? ev.key : ev.key === 'Backspace' ? 'back' : ev.key === 'Enter' ? 'ok' : null;
            if (!d || ev.target?.tagName === 'INPUT' || ev.target?.tagName === 'TEXTAREA') return;
            ev.preventDefault(); modal.querySelector(`[data-digit="${d}"]`)?.click();
          };
          if (modal._onKey) document.removeEventListener('keydown', modal._onKey); modal._onKey = onKey;
          document.addEventListener('keydown', onKey);

          modal.querySelector('.back-btn').onclick = () => {
            modal.remove();
            lockScreen().then(resolve);
          };
        };

        modal.querySelector('.back-btn').onclick = () => {
          modal.remove();
          lockScreen().then(resolve);
        };
      };
    }

    const skipBtn = modal.querySelector('.skip-btn');
    if (skipBtn) {
      skipBtn.onclick = () => {
        modal.remove();
        resolve(true);
      };
    }
  });
}
