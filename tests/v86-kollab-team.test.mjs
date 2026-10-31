// v86 Kollab-Team: Mitglieder, Systemprompts, Seiten-Anpassungen (Sanitisierung/Undo/Bausteine), Claude, Digest, Rechte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { TEAM, DEFAULT_PROMPTS, memberById, sanitizePrompt, effectivePrompt, toolNamesFor, MEMBER_TOOLS } from '../src/kollab-team.js';
import {
  sanitizeValue, sanitizeConfig, applyChange, diffSummary, planUndo, widgetsForArea, cssVarsFrom, moduleOptions,
  isAllowedKey, LOCKED_TABS, MODULE_IDS, TAB_IDS,
} from '../apps/shared/site-config.js';
import { redactSecrets, estimateClaude, pickClaudeRoute, buildClaudeMessages } from '../src/kollab-claude.js';
import { buildDigest } from '../src/kollab-digest.js';
import { MODULES } from '../apps/shared/module-models.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// 1 – feste Mitglieder
test('v86: Team hat genau Seraphina und Gemini, beide auf gemini-3.5-flash', () => {
  assert.deepEqual(TEAM.map((m) => m.id), ['seraphina', 'gemini']);
  for (const m of TEAM) assert.equal(m.model, 'gemini-3.5-flash');
  assert.equal(memberById('gemini').name, 'Gemini');
  assert.equal(memberById('x'), null);
});

test('v86: Gemini-Standardprompt ist der vorgegebene Text, Seraphina neutral', () => {
  assert.ok(DEFAULT_PROMPTS.gemini.startsWith('Du bist Gemini, die Elite-Entwicklerin im Jeffa-Hub-Team'));
  assert.match(DEFAULT_PROMPTS.seraphina, /neutral/i);
  assert.match(DEFAULT_PROMPTS.seraphina, /Risiken/);
  assert.match(DEFAULT_PROMPTS.seraphina, /Kosten/);
});

// 2 – Werkzeuge/Rechte je Mitglied
test('v86: Seraphina nur Lese-Werkzeuge, auch als Admin', () => {
  const t = toolNamesFor('seraphina', 'admin');
  assert.ok(t.includes('read_site_config') && t.includes('list_tasks') && t.includes('read_status'));
  for (const w of ['set_site_config', 'undo_site_change', 'create_task', 'send_to_claude', 'upsert_task', 'toggle_key']) assert.ok(!t.includes(w), w);
});
test('v86: Gemini schreibt nur als Admin; nie toggle_key/Client-Werkzeuge', () => {
  const a = toolNamesFor('gemini', 'admin');
  for (const w of ['set_site_config', 'undo_site_change', 'create_task', 'send_to_claude', 'read_site_config', 'list_site_changes']) assert.ok(a.includes(w), w);
  for (const w of ['toggle_key', 'update_profile', 'change_setting', 'list_profiles']) assert.ok(!a.includes(w), w);
  const r = toolNamesFor('gemini', 'read');
  assert.ok(r.includes('read_site_config'));
  for (const w of ['set_site_config', 'undo_site_change', 'create_task', 'send_to_claude', 'upsert_task']) assert.ok(!r.includes(w), w);
  assert.deepEqual(toolNamesFor('gemini', 'none'), r);
  assert.deepEqual(toolNamesFor('fremd', 'admin'), []);
});
test('v86: alle Mitglieds-Werkzeuge existieren in src/tools.ts', () => {
  const src = read('src/tools.ts');
  for (const n of new Set([...MEMBER_TOOLS.seraphina, ...MEMBER_TOOLS.gemini])) assert.ok(src.includes(`name: "${n}"`), n);
});

// 3 – Systemprompt Override/Reset
test('v86: Prompt-Override und Reset auf Standard', () => {
  assert.equal(effectivePrompt('gemini', null), DEFAULT_PROMPTS.gemini);
  assert.equal(effectivePrompt('gemini', '   '), DEFAULT_PROMPTS.gemini);
  assert.equal(effectivePrompt('seraphina', 'Sei knapp.'), 'Sei knapp.');
  assert.equal(effectivePrompt('gemini', 'Neu\u0000 '), 'Neu');
  assert.equal(sanitizePrompt(null), null);
  assert.equal(sanitizePrompt('x'.repeat(9000)).length, 6000);
  const team = read('functions/api/kollab/team.ts');
  assert.match(team, /body\.reset !== true/);
  assert.match(team, /requireRole\(context, "admin"\)/);
  assert.match(team, /GROUP BY member/);
});

// 4 – Sanitisierung
test('v86: Seiten-Config sanitisiert und lehnt Unerlaubtes ab', () => {
  assert.deepEqual(sanitizeValue('text.app_title', '<b>Jeffa</b>'), { ok: true, value: 'bJeffa/b' });
  assert.equal(sanitizeValue('text.app_title', '').ok, false);
  assert.equal(sanitizeValue('font.family', 'Comic Sans; } body{').ok, false);
  assert.deepEqual(sanitizeValue('font.size', '16.4'), { ok: true, value: 16 });
  assert.equal(sanitizeValue('font.size', 40).ok, false);
  assert.deepEqual(sanitizeValue('color.accent', '#ABC'), { ok: true, value: '#aabbcc' });
  assert.equal(sanitizeValue('color.accent', 'red; background:url(x)').ok, false);
  assert.equal(sanitizeValue('color.--evil', '#000000').ok, false);
  assert.equal(sanitizeValue('script', 'x').ok, false);
  assert.equal(sanitizeValue('text.tab.unbekannt', 'x').ok, false);
  const cfg = sanitizeConfig({ 'color.bg-main': '#111111', 'evil': 1, 'font.size': 99 });
  assert.deepEqual(cfg, { 'color.bg-main': '#111111' });
  assert.ok(isAllowedKey('color.accent') && isAllowedKey('widgets') && !isAllowedKey('color.x') && !isAllowedKey('js'));
});
test('v86: Menü – geschützte Tabs (Kollab/Tresor/Einstellungen) nicht ausblendbar, fehlende ergänzt', () => {
  const r = sanitizeValue('menu.tabs', [{ id: 'comic', hidden: true }, { id: 'kollab', hidden: true }, { id: 'bogus' }, { id: 'comic' }]);
  assert.equal(r.ok, true);
  assert.equal(r.value[0].id, 'comic'); assert.equal(r.value[0].hidden, true);
  assert.equal(r.value.find((t) => t.id === 'kollab').hidden, false);
  assert.equal(r.value.length, TAB_IDS.length);
  for (const id of LOCKED_TABS) assert.ok(TAB_IDS.includes(id));
});
test('v86: cssVarsFrom nur erlaubte Variablen und Stacks', () => {
  const c = cssVarsFrom({ 'color.accent': '#123456', 'font.family': 'mono', 'font.size': 15 });
  assert.deepEqual(c.vars, [['--accent', '#123456']]);
  assert.match(c.fontFamily, /mono/i);
  assert.equal(c.fontSize, '15px');
});

// 5 – Bausteine (Widget-Registry)
test('v86: model_picker nur mit Modul aus module-models.js', () => {
  const mid = MODULES[0].id;
  assert.ok(MODULE_IDS.includes(mid));
  const ok = sanitizeValue('widgets', [{ id: 'mp', type: 'model_picker', area: 'tab:chat', label: 'Modell', module: mid, icon: '🤖' }]);
  assert.equal(ok.value.length, 1);
  assert.equal(ok.value[0].module, mid);
  assert.equal(ok.value[0].icon, '🤖');
  const bad = sanitizeValue('widgets', [{ id: 'mp', type: 'model_picker', area: 'tab:chat', label: 'X', module: 'gibtsnicht' }]);
  assert.deepEqual(bad.value, []);
  const img = MODULES.find((m) => m.kind === 'image');
  if (img) assert.ok(moduleOptions(img.id).list.length > 0);
});
test('v86: link_button nur interne Routen, action_button nur erlaubte Aktionen', () => {
  const r = sanitizeValue('widgets', [
    { id: 'a', type: 'link_button', area: 'header', label: 'Comic', route: '#comic' },
    { id: 'b', type: 'link_button', area: 'header', label: 'Böse', route: 'https://evil.example' },
    { id: 'c', type: 'link_button', area: 'header', label: 'JS', route: 'javascript:alert(1)' },
    { id: 'd', type: 'action_button', area: 'header', label: 'Neu', action: 'new_chat' },
    { id: 'e', type: 'action_button', area: 'header', label: 'Eval', action: 'eval' },
    { id: 'f', type: 'script', area: 'header', label: 'x' },
    { id: 'G!', type: 'action_button', area: 'header', label: 'x', action: 'new_chat' },
    { id: 'h', type: 'action_button', area: 'tab:gibtsnicht', label: 'x', action: 'new_chat' },
  ]);
  assert.deepEqual(r.value.map((w) => w.id), ['a', 'd']);
});
test('v86: Bausteine – Label ohne Markup, Icon ohne Buchstaben, Sortierung', () => {
  const r = sanitizeValue('widgets', [
    { id: 'z', type: 'action_button', area: 'header', label: '<img onerror=x>Hi', icon: 'abc🔥', order: 5, action: 'toggle_theme' },
    { id: 'y', type: 'action_button', area: 'header', label: 'Erst', order: 1, action: 'reload_config' },
  ]);
  assert.ok(!r.value[0].label.includes('<'));
  assert.equal(r.value[0].icon, '🔥');
  assert.deepEqual(widgetsForArea({ widgets: r.value }, 'header').map((w) => w.id), ['y', 'z']);
});
test('v86: site-apply rendert nur per createElement/textContent', () => {
  const s = read('apps/hub/site-apply.js');
  assert.ok(!/innerHTML\s*=/.test(s));
  assert.ok(!/eval\(|new Function/.test(s));
  assert.match(s, /textContent/);
  const k = read('apps/hub/kollab-team.js');
  assert.ok(!/innerHTML\s*=/.test(k));
});

// 6 – Undo
test('v86: planUndo stellt vorherigen Wert her', () => {
  const ch = [
    { id: 2, key: 'color.accent', before_json: '"#111111"', after_json: '"#222222"', undone: 0, undo_of: null },
    { id: 1, key: 'color.accent', before_json: null, after_json: '"#111111"', undone: 0, undo_of: null },
  ];
  assert.deepEqual(planUndo(ch, 2), { ok: true, key: 'color.accent', value: '#111111' });
  const r1 = planUndo(ch, 1);
  assert.equal(r1.ok, false); assert.match(r1.error, /Neuere/);
  ch[0].undone = 1;
  assert.deepEqual(planUndo(ch, 1), { ok: true, key: 'color.accent', value: null });
  assert.equal(planUndo(ch, 2).ok, false); // schon rückgängig
  assert.equal(planUndo([{ id: 3, key: 'k', undo_of: 2, undone: 0 }], 3).ok, false); // Undo-Eintrag
  assert.equal(planUndo(ch, 99).ok, false);
});
test('v86: applyChange null = Standard; diffSummary', () => {
  assert.deepEqual(applyChange({ 'font.size': 15 }, 'font.size', null), {});
  assert.deepEqual(applyChange({}, 'font.size', 17), { 'font.size': 17 });
  assert.deepEqual(applyChange({}, 'font.size', 99), {});
  assert.match(diffSummary('font.size', 15, null), /Standard/);
  assert.match(diffSummary('font.size', 15, 17), /15 → 17/);
});
test('v86: Store – Reset mit null, Rate-Limit 30/h zählt alle, Undo lädt Schlüssel-Verlauf', () => {
  const s = read('src/site-config-store.ts');
  assert.match(s, /c\.value === null/);
  assert.match(s, /\+ clean\.length > 30/);
  assert.ok(!/undone=0 AND undo_of IS NULL AND ts/.test(s));
  assert.match(s, /WHERE key=\(SELECT key FROM site_changes WHERE id=\?\)/);
  const t = read('src/tools.ts');
  assert.match(t, /JSON\.parse\(s\)/); // Werte als JSON-Text
});

// 7 – Claude
test('v86: redactSecrets entfernt Schlüssel, lässt Pfade stehen', () => {
  const key = 'sk-' + 'AbC1'.repeat(10);
  const out = redactSecrets(`key=${key} pfad apps/shared/promptapp/reconcile-identity-and-something-long.js`);
  assert.ok(!out.includes(key));
  assert.match(out, /apps\/shared\/promptapp\/reconcile-identity-and-something-long\.js/);
  assert.ok(!redactSecrets('a'.repeat(10) + 'f0'.repeat(25)).includes('f0f0f0f0f0'));
});
test('v86: Claude – Schätzung, Weg, Nachrichten ohne Geheimnisse', () => {
  const e = estimateClaude('x'.repeat(3500));
  assert.ok(e.usd > 0 && e.usd < 1);
  assert.equal(pickClaudeRoute(true, true), 'gateway');
  assert.equal(pickClaudeRoute(false, true), 'lumia');
  assert.equal(pickClaudeRoute(false, false), null);
  const msgs = buildClaudeMessages({ id: 1, title: 'Fehler', body: 'Token ' + 'Zx9'.repeat(20) }, null, '');
  assert.ok(!JSON.stringify(msgs).includes('Zx9Zx9Zx9'));
  const send = read('src/kollab-claude-send.ts');
  assert.match(send, /vorschlag/);
  assert.ok(!/wrangler|pages deploy|git push/i.test(send)); // kein Auto-Deploy
});
test('v86: UI enthält An Claude senden, Kostenschätzung (dryRun), Rückgängig, Zurück auf Standard', () => {
  assert.ok(existsSync(new URL('../apps/hub/kollab-team.js', import.meta.url)));
  const k = read('apps/hub/kollab-team.js');
  for (const s of ['An Claude senden', 'Zurück auf Standard', 'Rückgängig', '/api/kollab/claude', 'dryRun', "actor: member.id", 'Seraphina', 'Gemini']) assert.ok(k.includes(s), s);
  assert.match(read('apps/hub/kollab.js'), /kollab-team\.js/);
});

// 8 – Digest
test('v86: buildDigest zählt und kürzt Vorschläge', () => {
  const d = buildDigest({ openTasks: [{ id: 1 }], proposals: [{ task_id: 1, proposal: 'x'.repeat(900) }], siteChanges: [{ id: 1 }, { id: 2 }], generatedAt: 'T' });
  assert.deepEqual(d.counts, { openTasks: 1, proposals: 1, siteChanges: 2, memberPromptChanges: 0 });
  assert.equal(d.proposals[0].excerpt.length, 500);
  assert.equal(buildDigest(null).counts.openTasks, 0);
  const ep = read('functions/api/kollab/digest.ts');
  assert.match(ep, /requireRole\(context, "admin"\)/);
  assert.match(ep, /-1 day|-24 hours/);
});

// 9 – Rechte auf allen Schreibwegen
test('v86: alle Schreib-Endpunkte verlangen Admin', () => {
  const need = {
    'functions/api/site-config/index.ts': /onRequestPost[\s\S]*requireRole\(context, "admin"\)/,
    'functions/api/site-config/undo.ts': /requireRole\(context, "admin"\)/,
    'functions/api/kollab/claude.ts': /requireRole\(context, "admin"\)/,
    'functions/api/kollab/team.ts': /onRequestPost[\s\S]*requireRole\(context, "admin"\)/,
    'functions/api/kollab/tasks/index.ts': /onRequestPost[\s\S]*requireRole\(context, ?"admin"\)/,
    'functions/api/kollab/tasks/[id].ts': /onRequestPatch[\s\S]*requireRole\(context, ?"admin"\)[\s\S]*onRequestDelete[\s\S]*requireRole\(context, ?"admin"\)/,
  };
  for (const [f, re] of Object.entries(need)) assert.match(read(f), re, f);
  assert.match(read('functions/api/agent/exec.ts'), /if \(t\.write\) await requireRole\(context, "admin"\)/);
  const tools = read('src/tools.ts');
  for (const n of ['set_site_config', 'undo_site_change', 'create_task', 'send_to_claude']) {
    const i = tools.indexOf(`name: "${n}"`);
    assert.ok(i > 0, n);
    assert.match(tools.slice(i, i + 400), /write: true/, n);
  }
});

// 10 – Agent erzwingt Modell/Prompt, nie OpenRouter
test('v86: Agent – Mitglied erzwingt Gemini nativ und eigenen Prompt', () => {
  const a = read('functions/api/agent/index.ts');
  assert.match(a, /KOLLAB_GEMINI_MODEL \|\| "gemini-3\.5-flash"/);
  assert.match(a, /mem \|\| model\.startsWith\("gemini"\) \? await callGemini/);
  assert.match(a, /toolNamesFor\(mem\.id, role\)/);
  assert.match(a, /effectivePrompt\(mem\.id, ov\)/);
});

// 11 – Migration rein additiv
test('v86: Migration 0014 nur CREATE … IF NOT EXISTS', () => {
  const m = read('migrations/0014_kollab_team.sql');
  assert.ok(!/\b(DROP|ALTER|DELETE|UPDATE)\b/i.test(m));
  for (const t of ['site_config', 'site_changes', 'kollab_task_meta', 'kollab_member_prompts']) assert.match(m, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`));
});
