// v86: D1-Speicher für Seiten-Anpassungen. Dünn; Sanitisierung liegt in apps/shared/site-config.js.
import type { Env } from "./env";
import { sanitizeConfig, sanitizeValue, diffSummary, planUndo, isAllowedKey } from "../apps/shared/site-config.js";

export interface Change { key: string; value: unknown }

export async function loadConfig(env: Env): Promise<Record<string, unknown>> {
  if (!env.DB) return {};
  try {
    const r = await env.DB.prepare("SELECT key, value_json FROM site_config").all();
    const obj: Record<string, unknown> = {};
    for (const row of (r.results || []) as any[]) {
      try { obj[row.key] = JSON.parse(row.value_json); } catch { /* ignore */ }
    }
    return sanitizeConfig(obj) as Record<string, unknown>;
  } catch { return {}; }
}

export async function listChanges(env: Env, limit = 50): Promise<unknown[]> {
  if (!env.DB) return [];
  try {
    const r = await env.DB.prepare("SELECT id,ts,actor,key,before_json,after_json,summary,undone,undo_of FROM site_changes ORDER BY id DESC LIMIT ?").bind(Math.min(50, Math.max(1, limit))).all();
    return r.results || [];
  } catch { return []; }
}

export async function configVersion(env: Env): Promise<number> {
  if (!env.DB) return 0;
  try {
    const row: any = await env.DB.prepare("SELECT MAX(id) m FROM site_changes").first();
    return Number(row?.m) || 0;
  } catch { return 0; }
}

export async function setConfig(env: Env, actor: string, changes: Change[]): Promise<{ ok: true; config: Record<string, unknown>; ids: number[] }> {
  if (!env.DB) throw new Error("Keine Datenbank");
  if (!Array.isArray(changes) || !changes.length) throw new Error("Keine Änderungen");
  if (changes.length > 10) throw new Error("Zu viele Änderungen pro Aufruf (max. 10)");
  const clean: Change[] = changes.map((c) => {
    // QA v86: null/undefined = Schlüssel auf Standard zurücksetzen (nur erlaubte Schlüssel).
    if (c.value === null || c.value === undefined) {
      if (!isAllowedKey(String(c.key || ""))) throw new Error("Schlüssel nicht erlaubt: " + String(c.key || ""));
      return { key: String(c.key), value: null };
    }
    const r: any = sanitizeValue(String(c.key || ""), c.value);
    if (!r.ok) throw new Error(r.error);
    return { key: String(c.key), value: r.value };
  });
  // QA v86: max. 30 Änderungen pro Stunde inkl. dieser (vorher > 30 und rückgängig gemachte zählten nicht).
  const recent: any = await env.DB.prepare("SELECT COUNT(*) n FROM site_changes WHERE undo_of IS NULL AND ts >= datetime('now','-1 hour')").first();
  if (Number(recent?.n || 0) + clean.length > 30) throw new Error("Zu viele Änderungen (max. 30 pro Stunde)");
  const current = await loadConfig(env);
  const stmts = [];
  for (const c of clean) {
    const before = current[c.key] === undefined ? null : current[c.key];
    const afterJson = c.value === null || c.value === undefined ? null : JSON.stringify(c.value);
    const beforeJson = before === null ? null : JSON.stringify(before);
    stmts.push(env.DB.prepare("INSERT INTO site_changes (actor, key, before_json, after_json, summary) VALUES (?, ?, ?, ?, ?)")
      .bind(actor, c.key, beforeJson, afterJson, diffSummary(c.key, before, c.value)));
    if (c.value === null || c.value === undefined) stmts.push(env.DB.prepare("DELETE FROM site_config WHERE key=?").bind(c.key));
    else stmts.push(env.DB.prepare("INSERT INTO site_config (key, value_json, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").bind(c.key, afterJson));
  }
  await env.DB.batch(stmts);
  const next = { ...current };
  for (const c of clean) { if (c.value === null || c.value === undefined) delete next[c.key]; else next[c.key] = c.value; }
  return { ok: true, config: next, ids: [] };
}

export async function undoChange(env: Env, actor: string, id: number): Promise<{ ok: true; key: string; value: unknown }> {
  if (!env.DB) throw new Error("Keine Datenbank");
  // QA v86: alle Änderungen dieses Schlüssels laden (vorher nur die letzten 50 insgesamt → ältere „nicht gefunden“).
  let rows: any[] = [];
  try {
    const r = await env.DB.prepare("SELECT id,ts,actor,key,before_json,after_json,summary,undone,undo_of FROM site_changes WHERE key=(SELECT key FROM site_changes WHERE id=?) ORDER BY id DESC LIMIT 500").bind(Number(id)).all();
    rows = (r.results || []) as any[];
  } catch { rows = []; }
  const plan: any = planUndo(rows, id);
  if (!plan.ok) throw new Error(plan.error);
  const current = await loadConfig(env);
  const before = current[plan.key] === undefined ? null : current[plan.key];
  const valueJson = plan.value === null || plan.value === undefined ? null : JSON.stringify(plan.value);
  const beforeJson = before === null ? null : JSON.stringify(before);
  const stmts = [
    env.DB.prepare("INSERT INTO site_changes (actor, key, before_json, after_json, summary, undo_of) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(actor, plan.key, beforeJson, valueJson, `Rückgängig: ${plan.key}`, Number(id)),
    env.DB.prepare("UPDATE site_changes SET undone=1 WHERE id=?").bind(Number(id)),
  ];
  if (plan.value === null || plan.value === undefined) stmts.push(env.DB.prepare("DELETE FROM site_config WHERE key=?").bind(plan.key));
  else stmts.push(env.DB.prepare("INSERT INTO site_config (key, value_json, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").bind(plan.key, valueJson));
  await env.DB.batch(stmts);
  return { ok: true, key: plan.key, value: plan.value };
}
