// v86: Aufgaben an Claude (nur Vorschläge). Rein und Node-testbar.
export const CLAUDE_PRICE = { in: 3 / 1e6, out: 15 / 1e6 };

export const APP_BRIEF = 'Jeffa Hub: PWA auf Cloudflare Pages. Vanilla-JS-ES-Module ohne Bundler in apps/chat, apps/hub, apps/bild, apps/waechter; Server-Code in src/ und functions/ (Pages Functions, TypeScript). D1 als DB, KV als KV, R2 für Dateien. Build: scripts/build.mjs kopiert flach nach dist/hub. Tests: node --test tests/*.test.mjs; Typprüfung: npx tsc --noEmit.';

export function redactSecrets(s) {
  let out = String(s == null ? '' : s);
  out = out.replace(/sk-[A-Za-z0-9_-]{16,}/g, '[entfernt]');
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[entfernt]');
  out = out.replace(/Bearer\s+\S+/gi, '[entfernt]');
  out = out.replace(/jft_\S+/g, '[entfernt]');
  // QA v86: nur echte Token-Zeichenketten (Ziffern + Groß- + Kleinbuchstaben, ohne „/“) – vorher wurden lange Dateipfade
  // wie apps/shared/promptapp/reconcile-identity entfernt.
  out = out.replace(/[A-Za-z0-9+_=-]{32,}/g, (m) => (/\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m)) || /^[a-f0-9]{40,}$/i.test(m) ? '[entfernt]' : m);
  return out;
}

export function estimateClaude(text) {
  const chars = String(text == null ? '' : text).length;
  const inTokens = Math.ceil(chars / 3.5) + 600;
  const outTokens = 4000;
  const usd = Math.round((inTokens * CLAUDE_PRICE.in + outTokens * CLAUDE_PRICE.out) * 1000) / 1000;
  return { inTokens, outTokens, usd };
}

export function pickClaudeRoute(hasGateway, hasLumia) {
  if (hasGateway) return 'gateway';
  if (hasLumia) return 'lumia';
  return null;
}

export function buildClaudeMessages(task, meta, extra) {
  const t = task || {};
  const m = meta || {};
  const system = 'Du bist Claude, Senior-Entwickler für Jeffa-Hub. Der Server hat keinen Repo-Zugriff, antworte mit Analyse, vermuteter Ursache, Patch-Vorschlag (unified diff, falls Dateien/Snippets im Kontext), Testidee, Risiko. Deutsch.';
  const parts = [
    `Titel: ${redactSecrets(t.title || '(ohne Titel)')}`,
    `Severity: ${redactSecrets(m.severity || 'unbekannt')}`,
    `Beschreibung:\n${redactSecrets(t.body || '(keine Beschreibung)')}`,
  ];
  const ex = redactSecrets(String(extra || '').slice(0, 8000));
  if (ex) parts.push(`Zusatzkontext:\n${ex}`);
  parts.push(`App-Kurzbeschreibung:\n${APP_BRIEF}`);
  return [{ role: 'system', content: system }, { role: 'user', content: parts.join('\n\n') }];
}
