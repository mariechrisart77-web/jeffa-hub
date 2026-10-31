// v85 (20): aus chat.js ausgelagert – Verhalten unverändert.
// KI-Agent mit Werkzeugen (Profil/Einstellungen ändern nach Bestätigung).
import { api } from './shared/api.js';
import { isAdult } from './shared/fsk.js';
import { getProfiles, getProfile, getActiveProfile, updateProfile, addProfile } from './profiles.js';
import { capSystem } from './shared/promptapp/chat.js';
import { getPaidAllowed, needsApproval } from './shared/models.js';
import { escapeHtml, settingsGet } from './chat-util.js';

export const TOOL_HINT = /\b(profil|persona|einstell|status|verbrauch|usage|token|kosten|aufgabe|task|kollab|schlüssel|key|tresor|regler|slider|werkzeug)/i;
export function toolsWanted(msgs) {
  const mode = settingsGet().tools || 'auto'; // 'auto' | 'on' | 'off'
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return TOOL_HINT.test(msgs.at(-1)?.content || '');
}
function agentCtx() {
  const s = settingsGet();
  return {
    profiles: getProfiles().map(p => ({ id: p.id, name: p.name, description: (p.description || '').slice(0, 80) })),
    settings: { encrypt: !!s.encrypt, theme: s.theme || 'dark', tools: s.tools || 'auto', textScale: s.textScale || 1, fsk18: isAdult() },
  };
}
function applyClientTool(name, args) {
  if (name === 'change_setting') {
    const allowed = { encrypt: v => v === true || v === 'true' || v === 'an', theme: v => (v === 'light' || v === 'hell') ? 'light' : 'dark' };
    if (!allowed[args.key]) throw new Error('Diese Einstellung ist nicht per KI änderbar');
    const s = settingsGet(); s[args.key] = allowed[args.key](args.value);
    localStorage.setItem('jeffa.settings', JSON.stringify(s));
    if (args.key === 'theme') document.body.classList.toggle('light-theme', s.theme === 'light');
    return { [args.key]: s[args.key] };
  }
  if (name === 'update_profile') {
    const id = String(args.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!id) throw new Error('id fehlt');
    const patch = {};
    for (const k of ['name', 'description', 'traits']) if (typeof args[k] === 'string') patch[k] = args[k].slice(0, 500);
    let p = getProfile(id);
    if (!p) {
      const base = structuredClone(getProfile('seraphina') || getActiveProfile());
      Object.assign(base, { id, name: patch.name || id, avatar: '✨', systemPrompt: '', systemPromptAdult: '', notes: [], adult: false, enabled: true });
      delete base.persona; // fresh persona, editor fills defaults
      if (patch.description) base.description = patch.description;
      if (patch.traits) base.traits = patch.traits;
      addProfile(base);
      p = getProfile(id);
    }
    if (args.look && typeof args.look === 'object') {
      const looks = structuredClone(p.looks || {});
      for (const k of ['kleidung', 'pose', 'umgebung', 'ausdruck', 'stil']) if (typeof args.look[k] === 'string') looks[k] = args.look[k].slice(0, 300);
      patch.looks = looks;
    }
    if (args.sliders && typeof args.sliders === 'object' && p.persona) {
      const persona = structuredClone(p.persona);
      for (const [key, val] of Object.entries(args.sliders)) {
        for (const arr of [persona.temperament || [], persona.gegensaetze || []]) {
          const sl = arr.find(x => x.id === key || x.left === key || x.right === key);
          if (sl) sl.value = Math.max(-5, Math.min(5, Number(val) || 0));
        }
      }
      patch.persona = persona;
    }
    updateProfile(id, patch);
    return { updated: id, fields: Object.keys(patch) };
  }
  throw new Error('Unbekanntes Werkzeug');
}
function confirmTool(c) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>KI möchte etwas ändern</h3><p><b>${escapeHtml(c.name)}</b></p><pre class="tool-args">${escapeHtml(JSON.stringify(c.args, null, 1)).slice(0, 1200)}</pre><div class="edit-actions"><button class="btn-sm secondary" data-x>Ablehnen</button><button class="btn-sm" data-ok>Ausführen</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-x]').onclick = () => { m.remove(); resolve(false); };
    m.querySelector('[data-ok]').onclick = () => { m.remove(); resolve(true); };
  });
}
export async function runAgent(conv, a, profile, system, msgs) {
  const model = (profile.modelChain || []).find(m => /^(gemini|grok|[\w-]+\/)/.test(m) && !m.startsWith('auto:') && (!needsApproval(m) || getPaidAllowed())); // v79: bezahlt nur mit Freigabe
  let toolResults = [];
  for (let step = 0; step < 3; step++) {
    let r;
    try { r = await api('/api/agent', { method: 'POST', body: { model, paidAllowed: getPaidAllowed(), system: capSystem(system, 3000), messages: msgs, ctx: agentCtx(), toolResults } }); }
    catch (e) { a.status = 'error'; a.content = `⚠️ ${e.message}`; return; }
    a.model = (r.model || '') + (r.tools?.length ? ` · 🛠 ${r.tools.join(', ')}` : '');
    if (!r.confirm) { a.content = r.reply || '…'; return; }
    const c = r.confirm;
    if (!(await confirmTool(c))) { toolResults = [...toolResults, { name: c.name, args: c.args, result: { abgelehnt: true } }]; continue; }
    let result;
    try {
      if (c.client) { result = applyClientTool(c.name, c.args); await api('/api/agent/exec', { method: 'POST', body: { name: c.name, args: c.args, clientResult: JSON.stringify(result).slice(0, 300) } }); }
      else result = (await api('/api/agent/exec', { method: 'POST', body: { name: c.name, args: c.args } })).result;
    } catch (e) { result = { error: e.status === 401 || e.status === 403 ? 'Admin-Anmeldung nötig (Hub → Tresor)' : e.message }; }
    toolResults = [...toolResults, { name: c.name, args: c.args, result }];
  }
  a.content = a.content || 'Fertig.';
}

