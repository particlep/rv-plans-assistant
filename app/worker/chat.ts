// Streaming chat with Claude over the plans, with tool use. Conversations are stored
// append-only in KV (images stored as references and rehydrated per request).
import Anthropic from "@anthropic-ai/sdk";
import { loadData, pageImageBase64 } from "./data";
import type { Env } from "./env";
import { runTool, TOOL_LABELS, TOOLS, type ImageRef } from "./tools";

const MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 14;
// Claude Opus 5.5 list prices, USD per million tokens (cache writes at the 5-minute rate).
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

type MessageParam = Anthropic.Beta.BetaMessageParam;

export interface Conversation {
  id: string;
  title: string;
  created: number;
  updated: number;
  messages: any[]; // BetaMessageParam with image_ref placeholders
  costs?: TurnCost[]; // one per question asked, in order
}

export interface TurnCost { usd: number; lookups: number; stopped?: boolean }
interface ConvSummary { id: string; title: string; updated: number; cost?: number }
export interface DisplayTool { name: string; label: string; input: any }

function usageCost(u: Anthropic.Beta.BetaUsage): number {
  return (
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
    1e6
  );
}

export async function systemPrompt(env: Env): Promise<string> {
  const { meta } = await loadData(env);
  const sections = meta.sections.map((s) => `${s.code} ${s.title} (${s.pages[0]}…${s.pages[s.pages.length - 1]})`).join("\n");
  return `You are a build assistant for a builder constructing a Van's Aircraft ${meta.model} kit airplane. They are usually in the shop reading on a phone.

You can search and read the builder's own copy of the Van's construction plans with your tools. The plans are the authority: base answers on what the plans say and show, cite the pages you used, and say plainly when the plans don't cover something or when you are inferring. Where it matters for airworthiness or safety, tell them to verify against the page itself, and mention that Van's issues revisions and service bulletins that may supersede the plans. When the plans are unclear, the question is structural, or you are unsure, say so and suggest confirming with Van's builder support, an EAA Technical Counselor or experienced builders rather than guessing.

How to work:
- Find pages with search_plans or lookup_part, read them with get_page, and use view_page whenever the answer depends on the drawing (orientation, which flange, hole and rivet callouts, dimensions). Use the quadrant regions to read small callouts.
- Section 05 (General Information) covers standard techniques (deburring, dimpling, countersinking, priming, riveting, edge distance, hardware identification); use it for "how do I…" technique questions.
- Only sections listed below are loaded; if they ask about a later section, say it hasn't been added yet.

Answer style:
- Lead with the answer. Keep it short and scannable on a phone: brief paragraphs or a short numbered list.
- Cite pages in square brackets like [09-04] (step/figure numbers too, e.g. [09-04] Step 3) - the app turns these into links. Write part numbers exactly as printed (e.g. E-00907-L-1); the app links those too.
- Include dimensions, drill sizes and rivet callouts exactly as the plans give them, with the units shown.
- When something must be checked on the printed sheet before cutting or drilling (an ambiguous callout, an inference), put it on its own line as a markdown blockquote starting with "Check:" - the app shows it as a warning box.

Loaded plans sections (code, title, first…last page):
${sections}`;
}

async function hydrate(env: Env, messages: any[]): Promise<MessageParam[]> {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (typeof m.content === "string" || m.role !== "user") {
      out.push(m);
      continue;
    }
    const content = await Promise.all(
      m.content.map(async (b: any) => {
        if (b.type !== "tool_result" || !Array.isArray(b.content)) return b;
        const inner = await Promise.all(
          b.content.map(async (c: any) =>
            c.type === "image_ref"
              ? { type: "image", source: { type: "base64", media_type: "image/webp", data: await pageImageBase64(env, c.page, c.region) } }
              : c,
          ),
        );
        return { ...b, content: inner };
      }),
    );
    out.push({ role: "user", content });
  }
  return out;
}

export async function listConversations(env: Env): Promise<ConvSummary[]> {
  return ((await env.CHATS.get("convlist", "json")) as ConvSummary[] | null) ?? [];
}

export async function getConversation(env: Env, id: string): Promise<Conversation | null> {
  return env.CHATS.get(`conv:${id}`, "json");
}

export async function deleteConversation(env: Env, id: string) {
  await env.CHATS.delete(`conv:${id}`);
  await env.CHATS.put("convlist", JSON.stringify((await listConversations(env)).filter((c) => c.id !== id)));
}

async function saveConversation(env: Env, conv: Conversation) {
  conv.updated = Date.now();
  await env.CHATS.put(`conv:${conv.id}`, JSON.stringify(conv));
  const list = (await listConversations(env)).filter((c) => c.id !== conv.id);
  const cost = (conv.costs ?? []).reduce((a, c) => a + c.usd, 0);
  list.unshift({ id: conv.id, title: conv.title, updated: conv.updated, cost });
  await env.CHATS.put("convlist", JSON.stringify(list.slice(0, 200)));
}

/** Turn stored API messages into display turns for the UI. */
export function displayTurns(conv: Conversation) {
  const turns: { role: "user" | "assistant"; text: string; tools: DisplayTool[]; cost?: TurnCost }[] = [];
  for (const m of conv.messages) {
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      if (text) turns.push({ role: "user", text: text.replace(/^\(I'm looking at page [^)]*\)\n/, ""), tools: [] });
      continue;
    }
    let last = turns[turns.length - 1];
    if (!last || last.role !== "assistant") turns.push((last = { role: "assistant", text: "", tools: [] }));
    for (const b of m.content) {
      if (b.type === "text") last.text += b.text;
      if (b.type === "tool_use") last.tools.push({ name: b.name, label: TOOL_LABELS[b.name]?.(b.input) ?? b.name, input: b.input });
    }
  }
  let k = 0;
  for (const t of turns) if (t.role === "assistant") t.cost = conv.costs?.[k++];
  return turns;
}

export function chatStream(env: Env, ctx: ExecutionContext, body: { conversationId?: string; message: string; page?: string }): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  writer.closed.catch(() => {}); // rejects when the client disconnects; handled via disconnected()
  const enc = new TextEncoder();
  let open = true;
  // Pressing Stop (or closing the app) disconnects the stream. The next write fails,
  // and we cancel the Claude call so the rest of the answer isn't paid for.
  let stopped = false;
  let current: { abort(): void } | null = null;
  const disconnected = () => {
    if (!open) return;
    open = false;
    stopped = true;
    current?.abort();
  };
  const write = async (chunk: string) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(chunk));
    } catch {
      disconnected();
    }
  };
  const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Heartbeat so a disconnect is noticed within seconds even while Claude is thinking silently.
  const heartbeat = setInterval(() => void write(": ping\n\n"), 4000);

  const work = (async () => {
    let conv: Conversation | null = body.conversationId ? await getConversation(env, body.conversationId) : null;
    if (!conv) {
      const title = body.message.length > 60 ? body.message.slice(0, 57) + "…" : body.message;
      conv = { id: crypto.randomUUID(), title, created: Date.now(), updated: Date.now(), messages: [] };
    }
    await send("start", { conversationId: conv.id, title: conv.title });
    const prefix = body.page ? `(I'm looking at page ${body.page})\n` : "";
    conv.messages.push({ role: "user", content: [{ type: "text", text: prefix + body.message }] });

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      defaultHeaders: env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : undefined,
    });
    const system = await systemPrompt(env);
    const turnCost: TurnCost = { usd: 0, lookups: 0 };
    conv.costs ??= [];
    // Questions asked before cost tracking existed have no entry; pad so indexes line up.
    const asked = conv.messages.filter((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b: any) => b.type === "text")).length;
    while (conv.costs.length < asked - 1) conv.costs.push({ usd: 0, lookups: 0 });
    conv.costs.push(turnCost);

    for (let round = 0; round < MAX_ROUNDS && !stopped; round++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: await hydrate(env, conv.messages),
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      current = stream;
      let partial = "";
      stream.on("text", (delta) => {
        partial += delta;
        void send("text", { t: delta });
      });
      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await stream.finalMessage();
      } catch (e) {
        if (!stopped) throw e;
        // Keep the history valid (user → assistant) and record what was said before stopping.
        // The unfinished round's tokens aren't reported back, so they're not in the cost.
        const text = partial.trim() ? `${partial}\n\n_(Stopped before finishing.)_` : "_(Stopped.)_";
        conv.messages.push({ role: "assistant", content: [{ type: "text", text }] });
        break;
      } finally {
        current = null;
      }
      turnCost.usd += usageCost(msg.usage);
      // Append the assistant turn unchanged (thinking blocks must be passed back as-is).
      conv.messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason === "pause_turn") continue;
      if (msg.stop_reason === "refusal") {
        await send("error", { message: "Claude declined to answer that one." });
        break;
      }
      const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) break;
      if (msg.stop_reason === "max_tokens") {
        await send("error", { message: "The answer got cut off (too long)." });
        break;
      }

      turnCost.lookups += toolUses.length;
      const results = await Promise.all(
        toolUses.map(async (tu) => {
          await send("tool", { label: TOOL_LABELS[tu.name]?.(tu.input) ?? tu.name, name: tu.name, input: tu.input });
          try {
            const out = await runTool(env, tu.name, tu.input);
            if ("error" in out) return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: out.error };
            if ("image" in out) {
              return { type: "tool_result", tool_use_id: tu.id, content: [{ type: "text", text: out.text }, out.image satisfies ImageRef] };
            }
            return { type: "tool_result", tool_use_id: tu.id, content: out.text };
          } catch (e) {
            return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Tool failed: ${(e as Error).message}` };
          }
        }),
      );
      conv.messages.push({ role: "user", content: results });
      if (stopped) conv.messages.push({ role: "assistant", content: [{ type: "text", text: "_(Stopped.)_" }] });
      await saveConversation(env, conv);
    }
    if (stopped) turnCost.stopped = true;
    await saveConversation(env, conv);
    await send("usage", turnCost);
    await send("done", { conversationId: conv.id });
  })()
    .catch(async (e) => {
      console.error("chat failed", e);
      const message = e instanceof Anthropic.APIError ? `Claude API error (${e.status}): ${e.message}` : String(e?.message ?? e);
      await send("error", { message });
    })
    .finally(async () => {
      clearInterval(heartbeat);
      if (open) await writer.close().catch(() => {});
    });

  ctx.waitUntil(work);
  return new Response(readable, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
