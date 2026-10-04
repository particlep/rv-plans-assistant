import { checkAccess } from "./auth";
import { chatStream, deleteConversation, displayTurns, getConversation, listConversations } from "./chat";
import type { Env } from "./env";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const denied = await checkAccess(req, env);
    if (denied) return denied;

    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 500);
      const body = (await req.json()) as { conversationId?: string; message?: string; page?: string };
      if (!body.message?.trim()) return json({ error: "empty message" }, 400);
      return chatStream(env, ctx, { conversationId: body.conversationId, message: body.message.trim(), page: body.page });
    }
    if (url.pathname === "/api/conversations" && req.method === "GET") {
      return json(await listConversations(env));
    }
    const m = url.pathname.match(/^\/api\/conversations\/([\w-]+)$/);
    if (m) {
      if (req.method === "DELETE") {
        await deleteConversation(env, m[1]);
        return json({ ok: true });
      }
      const conv = await getConversation(env, m[1]);
      if (!conv) return json({ error: "not found" }, 404);
      return json({ id: conv.id, title: conv.title, turns: displayTurns(conv) });
    }
    if (url.pathname === "/api/me") return json({ ok: true });
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
