// In-app AI admin tools (function calling). No code-modification tools, never reveals key values.
import type { Env } from "./env";
import { listKeys, setKey, type Provider as KeyProvider } from "./keys";

export type Role = "admin" | "read" | "none";
type P = Record<string, unknown>;
interface ToolDef { name: string; d: string; p?: Record<string, string>; req?: string[]; write?: boolean; client?: boolean; arrayItems?: Record<string, string> }

// Compact schemas: p = {arg: "type:description"}
export const TOOLS: ToolDef[] = [
  { name: "list_profiles", d: "Profile/Personas auflisten", client: true },
  { name: "read_settings", d: "App-Einstellungen lesen", client: true },
  { name: "read_status", d: "Provider-Status und Schlüssel-Übersicht (ohne Werte)" },
  { name: "read_usage", d: "Token-Verbrauch der letzten Tage", p: { days: "integer:Tage (1-30)" } },
  { name: "list_tasks", d: "Kollab-Aufgaben auflisten", p: { status: "string:offen|in_arbeit|erledigt" } },
  { name: "update_profile", d: "Profil anlegen/ändern (id neu = anlegen). Felder optional", write: true, client: true,
    p: { id: "string:Profil-ID", name: "string:", description: "string:", traits: "string:", look: "object:Look-Felder {kleidung,pose,umgebung,ausdruck,stil}", sliders: "object:Regler {key:0-100}" }, req: ["id"] },
  { name: "change_setting", d: "Einstellung ändern (encrypt, theme)", write: true, client: true,
    p: { key: "string:encrypt|theme", value: "string:" }, req: ["key", "value"] },
  { name: "upsert_task", d: "Kollab-Aufgabe anlegen oder ändern (mit id)", write: true,
    p: { id: "integer:", title: "string:", body: "string:", assignee: "string:", status: "string:offen|in_arbeit|erledigt" } },
  { name: "toggle_key", d: "API-Schlüssel aktivieren/deaktivieren (nie Werte zeigen)", write: true,
    p: { provider: "string:gemini|openrouter|venice|hf|xai|vnaipro|groq|mistral|runware", enabled: "boolean:" }, req: ["provider", "enabled"] },
  // v86: Kollab-Team – Seiten-Anpassungen + Aufgaben
  { name: "read_site_config", d: "Seiten-Anpassungen (Site-Config) lesen" },
  { name: "list_site_changes", d: "Änderungsverlauf der Seiten-Anpassungen", p: { limit: "integer:1-50" } },
  { name: "set_site_config", d: "Seiten-Anpassungen ändern (Texte, Schrift, Farben, Menü, Bausteine)", write: true,
    p: { changes: "array:Liste {key,value}. Schlüssel: text.app_title, text.tab.<tab>, font.family (system|serif|rounded|mono), font.size (13-20), color.<accent|bg-main|bg-card|bg-input|text-primary|text-secondary|text-tertiary|border|success|error|warning> (#rrggbb), menu.tabs (Liste {id,hidden}), widgets (Liste von Bausteinen {id,type:model_picker|link_button|action_button,area:header|tab:<tab>,order,label,icon,module|route|action})" }, req: ["changes"], arrayItems: { key: "string:Config-Schlüssel", value: "string:Wert als Text; Listen/Objekte als JSON-Text; leer = auf Standard zurücksetzen" } },
  { name: "undo_site_change", d: "Letzte Seiten-Anpassung rückgängig machen", write: true, p: { id: "integer:Änderungs-ID" }, req: ["id"] },
  { name: "create_task", d: "Kollab-Aufgabe für das Team anlegen", write: true,
    p: { title: "string:", body: "string:", severity: "string:klein|groß", assignee: "string:" }, req: ["title"] },
  { name: "send_to_claude", d: "Aufgabe als Vorschlag an Claude senden (nur Vorschlag, kein Deploy)", write: true,
    p: { task_id: "integer:", extra_context: "string:Zusatzinfos, max 8000 Zeichen" }, req: ["task_id"] },
];

export function toolsFor(role: Role): ToolDef[] {
  return TOOLS.filter((t) => !t.write || role === "admin");
}

function schema(t: ToolDef) {
  const properties: P = {};
  for (const [k, v] of Object.entries(t.p || {})) {
    const [type, description] = v.split(/:(.*)/s);
    if (type === "array" && t.arrayItems) {
      const items: P = {};
      for (const [ik, iv] of Object.entries(t.arrayItems)) {
        const [it, idesc] = iv.split(/:(.*)/s);
        items[ik] = idesc ? { type: it, description: idesc } : { type: it };
      }
      properties[k] = description ? { type, description, items: { type: "object", properties: items } } : { type, items: { type: "object", properties: items } };
      continue;
    }
    properties[k] = description ? { type, description } : { type };
  }
  return { type: "object", properties, ...(t.req ? { required: t.req } : {}) };
}
export const geminiTools = (ts: ToolDef[]) => [{ functionDeclarations: ts.map((t) => ({ name: t.name, description: t.d, ...(t.p ? { parameters: schema(t) } : {}) })) }];
export const openaiTools = (ts: ToolDef[]) => ts.map((t) => ({ type: "function", function: { name: t.name, description: t.d, parameters: schema(t) } }));

// Heuristic: only attach tools when the message plausibly needs them.
export function wantsTools(text: string): boolean {
  return /\b(profil|persona|einstell|setting|status|verbrauch|usage|token|kosten|aufgabe|task|kollab|schlüssel|key|tresor|look|regler|slider|ändere|änder|setz|leg.*an|erstell|zeig.*(liste|alle))/i.test(text);
}

export async function audit(env: Env, role: Role, tool: string, args: unknown, ok: boolean, result: string) {
  try {
    await env.DB?.prepare("INSERT INTO tool_audit (role, tool, args, ok, result) VALUES (?, ?, ?, ?, ?)")
      .bind(role, tool, JSON.stringify(args ?? {}).slice(0, 2000), ok ? 1 : 0, result.slice(0, 500)).run();
  } catch { /* audit must not break chat */ }
}

/** Execute a server-side tool. Role check is enforced here, independent of what the model asked. */
export async function execServerTool(env: Env, role: Role, name: string, a: P, actor: string = "admin"): Promise<unknown> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new Error("Unbekanntes Werkzeug");
  if (t.client) throw new Error("Client-Werkzeug");
  if (t.write && role !== "admin") throw new Error("Admin-Rechte erforderlich");
  const db = env.DB;
  switch (name) {
    case "read_status": {
      const keys = await listKeys(env);
      return keys.map((k) => ({ provider: k.provider, enabled: k.enabled, source: k.source })); // no last4/values
    }
    case "read_usage": {
      const days = Math.min(30, Math.max(1, Number(a.days) || 7));
      if (!db) return [];
      const r = await db.prepare("SELECT day, provider, SUM(prompt_tokens) p, SUM(output_tokens) o, SUM(requests) n FROM usage_daily WHERE day >= date('now', ?) GROUP BY day, provider ORDER BY day DESC LIMIT 60")
        .bind(`-${days} day`).all();
      return r.results;
    }
    case "list_tasks": {
      if (!db) return [];
      try {
        const r = a.status
          ? await db.prepare("SELECT t.id,t.title,t.assignee,t.status,m.severity,m.state FROM tasks t LEFT JOIN kollab_task_meta m ON m.task_id=t.id WHERE t.status=? ORDER BY t.id DESC LIMIT 30").bind(String(a.status)).all()
          : await db.prepare("SELECT t.id,t.title,t.assignee,t.status,m.severity,m.state FROM tasks t LEFT JOIN kollab_task_meta m ON m.task_id=t.id ORDER BY t.id DESC LIMIT 30").all();
        return r.results;
      } catch {
        const r = a.status
          ? await db.prepare("SELECT id,title,assignee,status FROM tasks WHERE status=? ORDER BY id DESC LIMIT 30").bind(String(a.status)).all()
          : await db.prepare("SELECT id,title,assignee,status FROM tasks ORDER BY id DESC LIMIT 30").all();
        return r.results;
      }
    }
    case "upsert_task": {
      if (!db) throw new Error("Keine Datenbank");
      const st = a.status && ["offen", "in_arbeit", "erledigt"].includes(String(a.status)) ? String(a.status) : null;
      if (a.id) {
        return await db.prepare("UPDATE tasks SET title=COALESCE(?,title), body=COALESCE(?,body), assignee=COALESCE(?,assignee), status=COALESCE(?,status), updated_at=datetime('now') WHERE id=? RETURNING id,title,status")
          .bind(a.title ?? null, a.body ?? null, a.assignee ?? null, st, Number(a.id)).first();
      }
      if (!a.title) throw new Error("title fehlt");
      return await db.prepare("INSERT INTO tasks (title, body, assignee, status) VALUES (?, ?, ?, COALESCE(?,'offen')) RETURNING id,title,status")
        .bind(String(a.title), a.body ?? null, a.assignee ?? null, st).first();
    }
    case "toggle_key": {
      const prov = String(a.provider) as KeyProvider;
      if (!["gemini", "openrouter", "venice", "hf", "xai", "vnaipro", "groq", "mistral", "runware"].includes(prov)) throw new Error("Unbekannter Provider");
      await setKey(env, prov, undefined, Boolean(a.enabled));
      return { provider: prov, enabled: Boolean(a.enabled) };
    }
    case "read_site_config": {
      const { loadConfig } = await import("./site-config-store");
      return await loadConfig(env);
    }
    case "list_site_changes": {
      const { listChanges } = await import("./site-config-store");
      return await listChanges(env, Math.min(50, Math.max(1, Number(a.limit) || 20)));
    }
    case "set_site_config": {
      const { setConfig } = await import("./site-config-store");
      const raw = a.changes;
      if (!Array.isArray(raw)) throw new Error("changes muss eine Liste sein");
      // QA v86: Gemini liefert Werte als Text (Schema kennt keine Mischtypen) → JSON-Listen/-Objekte auspacken, leer = Standard.
      const val = (v: unknown) => {
        if (typeof v !== "string") return v ?? null;
        const s = v.trim();
        if (!s || s === "null") return null;
        if (/^[\[{]/.test(s)) { try { return JSON.parse(s); } catch { return s; } }
        return s;
      };
      return await setConfig(env, actor, raw.map((c: any) => ({ key: String(c?.key ?? ""), value: val(c?.value) })));
    }
    case "undo_site_change": {
      const { undoChange } = await import("./site-config-store");
      return await undoChange(env, actor, Number(a.id));
    }
    case "create_task": {
      if (!db) throw new Error("Keine Datenbank");
      const sev = a.severity === "groß" || a.severity === "klein" ? String(a.severity) : null;
      const ins = await db.prepare("INSERT INTO tasks (title, body, assignee, status) VALUES (?, ?, ?, 'offen') RETURNING id,title,status")
        .bind(String(a.title), a.body ?? null, a.assignee ? String(a.assignee) : "Gemini").first() as any;
      if (ins?.id && sev) {
        try { await db.prepare("INSERT INTO kollab_task_meta (task_id, severity, state) VALUES (?, ?, NULL) ON CONFLICT(task_id) DO UPDATE SET severity=excluded.severity").bind(ins.id, sev).run(); } catch { /* meta optional */ }
      }
      return ins;
    }
    case "send_to_claude": {
      const { sendToClaude } = await import("./kollab-claude-send");
      return await sendToClaude(env, Number(a.task_id), a.extra_context ? String(a.extra_context) : "");
    }
  }
  throw new Error("Nicht implementiert");
}
