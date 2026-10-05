import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { fetchJSON, type Meta } from "../data";
import { markdownToHtml } from "../linkify";
import { href } from "../router";
import { fmtCost, Icon, useWide } from "../ui";

interface Tool { name: string; label: string; input: any }
interface Turn { role: "user" | "assistant"; text: string; tools: Tool[]; cost?: { usd: number; lookups: number }; error?: string }
interface ConvSummary { id: string; title: string; updated: number; cost?: number }

const TOOL_ICON: Record<string, () => ComponentChildren> = {
  search_plans: Icon.search,
  lookup_part: Icon.parts,
  get_page: Icon.doc,
  view_page: Icon.eye,
  list_section: Icon.list,
};
// Quadrant crops overlap by 6%, so each covers 56% of the page.
const REGION_BOX: Record<string, string> = {
  "top-left": "left:0;top:0;width:56%;height:56%",
  "top-right": "left:44%;top:0;width:56%;height:56%",
  "bottom-left": "left:0;top:44%;width:56%;height:56%",
  "bottom-right": "left:44%;top:44%;width:56%;height:56%",
};
const PAGE_RE = /\b(\d{2}[AB]?-\d{2})\b/g;

function citedPages(t: Turn, meta: Meta): string[] {
  const ids = new Set<string>();
  for (const tool of t.tools) if (tool.name === "view_page" || tool.name === "get_page") ids.add(tool.input?.page_id);
  for (const m of t.text.matchAll(PAGE_RE)) ids.add(m[1]);
  return [...ids].filter((id) => id && meta.pages.some((p) => p.id === id));
}

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const y = new Date(today.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatView({ meta, id, page, initial }: { meta: Meta; id?: string; page?: string; initial?: string }) {
  const wide = useWide();
  const [convId, setConvId] = useState<string | undefined>(id);
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [title, setTitle] = useState("");
  const [input, setInput] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const loadConvs = () => fetchJSON<ConvSummary[]>("/api/conversations").then(setConvs).catch(() => setConvs([]));
  useEffect(() => {
    loadConvs();
  }, []);
  useEffect(() => {
    if (!id) return;
    fetchJSON<{ title: string; turns: Turn[] }>(`/api/conversations/${id}`)
      .then((c) => {
        setTurns(c.turns);
        setTitle(c.title);
      })
      .catch((e) => setTurns([{ role: "assistant", text: "", tools: [], error: e.message }]));
  }, [id]);
  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const update = (fn: (t: Turn) => void) =>
    setTurns((ts) => {
      const copy = ts.slice();
      const last = { ...copy[copy.length - 1], tools: [...copy[copy.length - 1].tools] };
      fn(last);
      copy[copy.length - 1] = last;
      return copy;
    });

  async function send(e?: Event) {
    e?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    if (box.current) box.current.style.height = "";
    setBusy(true);
    setTurns((ts) => [...ts, { role: "user", text: message, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message, page }),
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("event-stream")) {
        const msg = res.headers.get("content-type")?.includes("json")
          ? (await res.json()).error
          : `Request failed (${res.status}). Your login may have expired - reload.`;
        throw new Error(msg);
      }
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = chunk.match(/^event: (.*)$/m)?.[1];
          const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? "{}");
          if (event === "start") {
            setConvId(data.conversationId);
            setTitle(data.title);
            history.replaceState(null, "", href.ask(data.conversationId));
          } else if (event === "text") update((t) => (t.text += data.t));
          else if (event === "tool") update((t) => t.tools.push({ name: data.name, label: data.label, input: data.input }));
          else if (event === "usage") update((t) => (t.cost = data));
          else if (event === "error") update((t) => (t.error = data.message));
        }
      }
    } catch (err) {
      update((t) => (t.error = (err as Error).message));
    } finally {
      setBusy(false);
      loadConvs();
    }
  }

  const lastAnswer = [...turns].reverse().find((t) => t.role === "assistant" && (t.text || t.tools.length));
  const inConversation = !!convId || turns.length > 0;

  const thread = (
    <div class="thread">
      {!inConversation && (
        <div>
          <h1 style="margin: 0 0 8px; font-size: 22px">Ask the plans</h1>
          <p class="muted" style="margin: 0">
            Ask about any loaded section — “How do I make the trim tab hinge?”, “Where is E-00907-L-1 used?”, “What do I prime in section 06?”.
            Answers cite pages you can tap.
          </p>
        </div>
      )}
      {turns.map((t, i) =>
        t.role === "user" ? (
          <div class="msg-user">{t.text}</div>
        ) : (
          <>
            {t.tools.length > 0 && (
              <div class="trace">
                {t.tools.map((tool) => (
                  <div>{(TOOL_ICON[tool.name] ?? Icon.search)()}{tool.label}</div>
                ))}
              </div>
            )}
            {(t.text || t.error || (busy && i === turns.length - 1)) && (
              <article class="answer">
                {t.text ? <div dangerouslySetInnerHTML={{ __html: markdownToHtml(t.text) }} /> : !t.error && <span class="muted typing">Working </span>}
                {t.error && <div class="err">{t.error}</div>}
                {!wide && t.text && <CiteCard meta={meta} turn={t} />}
                {t.text && (t.cost || !busy || i < turns.length - 1) && (
                  <div class="foot">
                    <span>
                      {t.cost ? `${t.cost.lookups} lookup${t.cost.lookups === 1 ? "" : "s"}` : `${t.tools.length} lookup${t.tools.length === 1 ? "" : "s"}`}
                      {t.cost && fmtCost(t.cost.usd) ? ` · ${fmtCost(t.cost.usd)}` : ""}
                    </span>
                    <span>Plans are the authority</span>
                  </div>
                )}
              </article>
            )}
          </>
        ),
      )}
      {!wide && !inConversation && convs && convs.length > 0 && (
        <section aria-label="Past questions" style="margin-top: 8px">
          <h2 class="eyebrow">Past questions</h2>
          <div class="list">
            {convs.map((c) => (
              <a href={href.ask(c.id)}>
                <span class="grow">
                  <div>{c.title}</div>
                  <div class="sub">{when(c.updated)}{fmtCost(c.cost) ? ` · ${fmtCost(c.cost)}` : ""}</div>
                </span>
                <span class="muted"><Icon.right /></span>
              </a>
            ))}
          </div>
        </section>
      )}
      <div ref={bottom} />
    </div>
  );

  const composer = (
    <div class="composer" style={!wide && !id ? "bottom: calc(57px + var(--safe-b)); padding-bottom: 10px" : ""}>
      <form onSubmit={send}>
        {page && <span class="ctx">Context: page {page}</span>}
        <div class="row">
          <label class="sr-only" for="ask-input">{inConversation ? "Ask a follow-up" : "Ask a question"}</label>
          <textarea
            id="ask-input"
            ref={box}
            rows={1}
            value={input}
            placeholder={busy ? "Answering…" : inConversation ? "Ask a follow-up…" : "Ask about the plans…"}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setInput(el.value);
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && wide) send(e);
            }}
          />
          <button type="submit" class="send" aria-label="Send" disabled={busy || !input.trim()}><Icon.send /></button>
        </div>
      </form>
    </div>
  );

  if (wide) {
    return (
      <div class="chatlayout">
        <aside class="convs" aria-label="Conversations">
          <a class="btn outline" href={href.ask()} style="margin-bottom: 12px"><Icon.plus />New question</a>
          <div class="eyebrow" style="padding: 4px 8px 0">Recent</div>
          {convs?.length === 0 && <p class="small muted" style="padding: 0 8px">No questions yet.</p>}
          {convs?.map((c) => (
            <a class={`conv${c.id === convId ? " on" : ""}`} href={href.ask(c.id)} aria-current={c.id === convId ? "page" : undefined}>
              {c.title}
              <div class="meta">{when(c.updated)}{fmtCost(c.cost) ? ` · ${fmtCost(c.cost)}` : ""}</div>
            </a>
          ))}
        </aside>
        <div class="chatcol">
          {thread}
          {composer}
        </div>
        <CitedPanel meta={meta} turn={lastAnswer} />
      </div>
    );
  }

  return (
    <>
      {id && (
        <header class="appbar">
          <a href={href.ask()} aria-label="All questions"><Icon.left /></a>
          <span class="title">{title || "Question"}</span>
          <a href={href.ask()} aria-label="New question"><Icon.plus /></a>
        </header>
      )}
      {thread}
      {composer}
      {!id && <div style="height: calc(57px + var(--safe-b))" />}
    </>
  );
}

function CiteCard({ meta, turn }: { meta: Meta; turn: Turn }) {
  const [first] = citedPages(turn, meta);
  if (!first) return null;
  const pm = meta.pages.find((p) => p.id === first)!;
  return (
    <a class="citecard" href={href.page(first)}>
      <img class="thumb" src={`/img/thumb/${first}.webp`} alt="" loading="lazy" />
      <span style="flex: 1; min-width: 0">
        <span class="mono" style="font-weight: 600; display: block">{first}</span>
        <span class="small muted" style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{pm.title}</span>
      </span>
      <Icon.right />
    </a>
  );
}

function CitedPanel({ meta, turn }: { meta: Meta; turn?: Turn }) {
  const ids = turn ? citedPages(turn, meta) : [];
  const view = turn ? [...turn.tools].reverse().find((t) => t.name === "view_page") : undefined;
  const main = view?.input?.page_id && ids.includes(view.input.page_id) ? view.input.page_id : ids[0];
  if (!main) {
    return (
      <aside class="cited" aria-label="Cited page">
        <div class="eyebrow">Cited page</div>
        <p class="small muted" style="margin: 0">Pages Claude reads or looks at show up here.</p>
      </aside>
    );
  }
  const pm = meta.pages.find((p) => p.id === main)!;
  const region = view?.input?.page_id === main ? REGION_BOX[view?.input?.region] : undefined;
  return (
    <aside class="cited" aria-label="Cited page">
      <div class="eyebrow">Cited page</div>
      <div class="row" style="align-items: baseline; gap: 10px">
        <span class="mono" style="font-size: 20px; font-weight: 600">{main}</span>
        <span class="small muted">{[pm.rev && `Rev ${pm.rev}`, pm.date].filter(Boolean).join(" · ")}</span>
      </div>
      <a class="frame" href={href.page(main)} aria-label={`Open page ${main}`}>
        <img class="thumb" src={`/img/thumb/${main}.webp`} alt="" />
        {region && <span class="region" style={region} />}
      </a>
      {region && <div class="small muted">Outlined: the part of the drawing Claude looked at.</div>}
      <div style="font-size: 14px; font-weight: 500">{pm.title}</div>
      <a class="btn outline" href={href.page(main)}>Open page {main}</a>
      {ids.length > 1 && (
        <>
          <div class="eyebrow" style="margin-top: 8px">Also cited</div>
          {ids
            .filter((x) => x !== main)
            .map((x) => (
              <a class="mono" style="font-size: 14px" href={href.page(x)}>
                {x} · {meta.pages.find((p) => p.id === x)?.title.slice(0, 40)}
              </a>
            ))}
        </>
      )}
    </aside>
  );
}
