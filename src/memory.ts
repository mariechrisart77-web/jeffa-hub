import { Env } from "./env";
import { callModel, ChatMessage } from "./providers";
import { filterForProfile, scopeForFact } from "./memory-scope.js";

export interface Memory { id: number; scope: string; fact: string; created_at: string }
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß ]/g, " ");
const STOP = new Set("der die das und ist ich du er sie es ein eine einen mit von zu in im auf für nicht the and a to of is mir mich dich hat habe wie was wer".split(" "));
const words = (s: string) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

export async function listMemories(env: Env, scopes: string[]): Promise<Memory[]> {
  if (!env.DB || !scopes.length) return [];
  const q = `SELECT id, scope, fact, created_at FROM memories WHERE scope IN (${scopes.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 200`;
  return ((await env.DB.prepare(q).bind(...scopes).all<Memory>()).results) || [];
}

/** Pick the most relevant compact notes for the current conversation (keyword overlap + recency), max ~maxChars. */
export async function relevantMemories(env: Env, profileId: string | undefined, query: string, max = 8, maxChars = 700, otherNames?: string[]): Promise<string[]> {
  const raw = await listMemories(env, ["user", ...(profileId ? [`p:${profileId}`] : [])]);
  const all = filterForProfile(raw, { profileId, otherNames }) as Memory[];
  if (!all.length) return [];
  const qw = words(query);
  const scored = all.map((m, i) => {
    let s = 0; for (const w of words(m.fact)) if (qw.has(w)) s += 2;
    if (m.scope === "user") s += 0.5;
    return { m, s: s + Math.max(0, 1 - i / 40) };
  }).sort((a, b) => b.s - a.s);
  const out: string[] = []; let n = 0;
  for (const { m } of scored) { if (out.length >= max || n + m.fact.length > maxChars) break; out.push(m.fact); n += m.fact.length; }
  return out;
}

/** Cheap fact extraction via Flash-Lite; dedups against existing notes. */
export async function extractMemories(env: Env, profileId: string | undefined, messages: ChatMessage[], opts?: { profileName?: string; otherNames?: string[] }): Promise<string[]> {
  if (!env.DB) return [];
  const convo = messages.slice(-6).map((m) => `${m.role === "user" ? "Nutzer" : "KI"}: ${String(m.content).slice(0, 1200)}`).join("\n");
  if (convo.length < 40) return [];
  const existing = await listMemories(env, ["user", ...(profileId ? [`p:${profileId}`] : [])]);
  const sys = "Extrahiere aus dem Chat NUR neue, dauerhaft nützliche Fakten über den Nutzer (Name, Vorlieben, Projekte, Personen, Ziele, Abmachungen). Keine Smalltalk-Details, keine Fakten über die KI. Antworte ausschließlich als JSON: {\"facts\":[{\"fact\":\"kurzer Satz, max 120 Zeichen\",\"scope\":\"user|profile\"}]} — scope=profile nur für Dinge, die nur diese Figur/Beziehung betreffen. Niemals Name, Rolle oder Eigenschaften der KI-Figur als Nutzer-Fakt speichern. Leeres Array, wenn nichts Neues. Bereits bekannt:\n" +
    existing.slice(0, 40).map((m) => `- ${m.fact}`).join("\n");
  const r = await callModel(env, { model: "gemini-3.5-flash-lite", system: sys, messages: [{ role: "user", content: convo }], maxTokens: 300 });
  let facts: Array<{ fact: string; scope?: string }> = [];
  try { facts = JSON.parse(r.reply.replace(/^[^{]*/, "").replace(/[^}]*$/, "")).facts || []; } catch { return []; }
  const known = existing.map((m) => words(m.fact));
  const saved: string[] = [];
  for (const f of facts.slice(0, 5)) {
    const fact = String(f.fact || "").trim().slice(0, 160); if (fact.length < 5) continue;
    const fw = words(fact);
    if (known.some((k) => { let o = 0; for (const w of fw) if (k.has(w)) o++; return fw.size && o / fw.size > 0.7; })) continue;
    const scope = scopeForFact(f.scope === "profile" ? "profile" : "user", fact, { profileId, profileName: opts?.profileName, otherNames: opts?.otherNames });
    await env.DB.prepare("INSERT INTO memories (scope, fact) VALUES (?, ?)").bind(scope, fact).run();
    known.push(fw); saved.push(fact);
  }
  return saved;
}
