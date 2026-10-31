import { Env } from "../../../../src/env";
import { requireRole } from "../../../../src/auth";
import { checkRateLimit } from "../../../../src/ratelimit";
import { complete } from "../../../../src/providers";
import { trackUsage } from "../../../../src/usage";

interface Group {
  id: number;
  name: string;
  goal: string | null;
  coordinator_model: string;
  created_at: string;
}

interface Member {
  group_id: number;
  name: string;
  role: string;
  model: string;
}

interface Message {
  id: number;
  group_id: number;
  round: number;
  sender: string;
  content: string;
  tokens: number;
  created_at: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const route = (context.params.route as string[]) || [];
  const groupId = route[0] ? parseInt(route[0], 10) : null;

  if (groupId) {
    const group = await context.env.DB.prepare("SELECT * FROM groups WHERE id = ?").bind(groupId).first<Group>();
    if (!group) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "Gruppe nicht gefunden" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const members = await context.env.DB.prepare("SELECT * FROM group_members WHERE group_id = ?").bind(groupId).all<Member>();
    const messages = await context.env.DB.prepare("SELECT * FROM group_messages WHERE group_id = ? ORDER BY round, created_at").bind(groupId).all<Message>();

    return new Response(JSON.stringify({ group, members: members.results || [], messages: messages.results || [] }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const groups = await context.env.DB.prepare("SELECT * FROM groups ORDER BY created_at DESC").all<Group>();
  return new Response(JSON.stringify({ groups: groups.results || [] }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
  await checkRateLimit(context.env, ip);

  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const route = (context.params.route as string[]) || [];
  const groupId = route[0] ? parseInt(route[0], 10) : null;

  if (groupId && route[1] === "run") {
    return handleRun(context, groupId);
  }

  const body: Partial<Group & { members: Member[] }> = await context.request.json();
  const { name, goal, coordinator_model, members } = body;

  if (!name || typeof name !== "string" || name.length > 200) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "name erforderlich, max 200 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const group = await context.env.DB.prepare("INSERT INTO groups (name, goal, coordinator_model) VALUES (?, ?, ?) RETURNING *")
    .bind(name, goal || null, coordinator_model || "gemini-3.5-flash-lite")
    .first<Group>();

  if (members && Array.isArray(members)) {
    for (const m of members) {
      await context.env.DB.prepare("INSERT INTO group_members (group_id, name, role, model) VALUES (?, ?, ?, ?)")
        .bind(group!.id, m.name, m.role, m.model)
        .run();
    }
  }

  return new Response(JSON.stringify({ group }), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  if (!context.env.DB) {
    return new Response(JSON.stringify({ error: { code: "d1_missing", message: "D1-Datenbank nicht konfiguriert" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const route = (context.params.route as string[]) || [];
  const groupId = route[0] ? parseInt(route[0], 10) : null;

  if (!groupId) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "ID erforderlich" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  await context.env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(groupId).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

async function handleRun(context: EventContext<Env, any, Record<string, unknown>>, groupId: number): Promise<Response> {
  const body: { task: string } = await context.request.json();
  const { task } = body;

  if (!task || typeof task !== "string" || task.length > 2000) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "task erforderlich, max 2000 Zeichen" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const group = await context.env.DB!.prepare("SELECT * FROM groups WHERE id = ?").bind(groupId).first<Group>();
  if (!group) {
    return new Response(JSON.stringify({ error: { code: "not_found", message: "Gruppe nicht gefunden" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const members = await context.env.DB!.prepare("SELECT * FROM group_members WHERE group_id = ?").bind(groupId).all<Member>();
  if (!members.results || members.results.length === 0) {
    return new Response(JSON.stringify({ error: { code: "invalid_input", message: "Gruppe hat keine Mitglieder" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const sse = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const isPrivate = context.request.headers.get("x-jeffa-private") === "1";

  (async () => {
    try {
      let totalTokens = 0;
      const maxTokens = 12000;
      const maxRounds = 3;

      let coordinatorContext = `Ziel: ${group.goal || "Gemeinsame Aufgabe"}\nMitglieder:\n${members.results.map((m) => `- ${m.name} (${m.role})`).join("\n")}\n\nAufgabe: ${task}`;

      for (let round = 1; round <= maxRounds; round++) {
        const planPrompt = round === 1
          ? `Erstelle einen Plan und verteile Teilaufgaben an die Mitglieder. Ausgabe als JSON: {"subtasks":[{"member":"Name","task":"Aufgabe"}]}`
          : `Bisherige Antworten:\n${coordinatorContext}\n\nEntscheide: Weiter oder fertig? Ausgabe als JSON: {"done":true} oder {"subtasks":[...]}`;

        const planResult = await complete(context.env, {
          model: group.coordinator_model,
          system: "Du bist ein Koordinator. Verteile Aufgaben effizient.",
          messages: [{ role: "user", content: planPrompt }],
          maxTokens: 400,
          private: isPrivate,
        });

        totalTokens += (planResult.usage?.promptTokens || 0) + (planResult.usage?.outputTokens || 0);
        await trackUsage(context.env, "google-ai-studio", group.coordinator_model, planResult.usage?.promptTokens || 0, planResult.usage?.outputTokens || 0, 0);

        const cleaned = planResult.reply.replace(/```json|```/g, "").trim();
        let plan: any;
        try {
          plan = JSON.parse(cleaned);
        } catch {
          await sse({ type: "error", content: "Koordinator-Antwort ungültig" });
          break;
        }

        if (plan.done) {
          const summaryPrompt = `Fasse die Ergebnisse zusammen:\n${coordinatorContext}`;
          const summaryResult = await complete(context.env, {
            model: group.coordinator_model,
            system: "Fasse die Ergebnisse kurz zusammen.",
            messages: [{ role: "user", content: summaryPrompt }],
            maxTokens: 600,
            private: isPrivate,
          });

          totalTokens += (summaryResult.usage?.promptTokens || 0) + (summaryResult.usage?.outputTokens || 0);
          await trackUsage(context.env, "google-ai-studio", group.coordinator_model, summaryResult.usage?.promptTokens || 0, summaryResult.usage?.outputTokens || 0, 0);

          await sse({ type: "summary", sender: "Koordinator", content: summaryResult.reply, round });
          await context.env.DB!.prepare("INSERT INTO group_messages (group_id, round, sender, content, tokens) VALUES (?, ?, ?, ?, ?)")
            .bind(groupId, round, "Koordinator", summaryResult.reply, summaryResult.usage?.outputTokens || 0)
            .run();
          break;
        }

        if (!plan.subtasks || !Array.isArray(plan.subtasks)) {
          await sse({ type: "error", content: "Keine Subtasks gefunden" });
          break;
        }

        await sse({ type: "plan", sender: "Koordinator", content: JSON.stringify(plan.subtasks), round });
        await context.env.DB!.prepare("INSERT INTO group_messages (group_id, round, sender, content, tokens) VALUES (?, ?, ?, ?, ?)")
          .bind(groupId, round, "Koordinator", JSON.stringify(plan.subtasks), planResult.usage?.outputTokens || 0)
          .run();

        const answers: string[] = [];
        for (const subtask of plan.subtasks) {
          const member = members.results.find((m) => m.name === subtask.member);
          if (!member) continue;

          const answerResult = await complete(context.env, {
            model: member.model,
            system: `Du bist ${member.name}, ${member.role}.`,
            messages: [{ role: "user", content: subtask.task }],
            maxTokens: 350,
            private: isPrivate,
          });

          totalTokens += (answerResult.usage?.promptTokens || 0) + (answerResult.usage?.outputTokens || 0);
          const provider = answerResult.usage ? "google-ai-studio" : "unknown";
          await trackUsage(context.env, provider, member.model, answerResult.usage?.promptTokens || 0, answerResult.usage?.outputTokens || 0, 0);

          await sse({ type: "answer", sender: member.name, content: answerResult.reply, round });
          await context.env.DB!.prepare("INSERT INTO group_messages (group_id, round, sender, content, tokens) VALUES (?, ?, ?, ?, ?)")
            .bind(groupId, round, member.name, answerResult.reply, answerResult.usage?.outputTokens || 0)
            .run();

          answers.push(`${member.name}: ${answerResult.reply}`);
        }

        coordinatorContext = answers.join("\n\n");

        if (totalTokens >= maxTokens) {
          const summaryPrompt = `Token-Limit erreicht. Fasse die bisherigen Ergebnisse zusammen:\n${coordinatorContext}`;
          const summaryResult = await complete(context.env, {
            model: group.coordinator_model,
            system: "Fasse die Ergebnisse kurz zusammen.",
            messages: [{ role: "user", content: summaryPrompt }],
            maxTokens: 600,
            private: isPrivate,
          });

          await sse({ type: "summary", sender: "Koordinator", content: summaryResult.reply, round });
          await context.env.DB!.prepare("INSERT INTO group_messages (group_id, round, sender, content, tokens) VALUES (?, ?, ?, ?, ?)")
            .bind(groupId, round, "Koordinator", summaryResult.reply, summaryResult.usage?.outputTokens || 0)
            .run();
          break;
        }
      }

      await sse({ type: "done" });
    } catch (e) {
      await sse({ type: "error", content: (e as Error).message });
    } finally {
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
