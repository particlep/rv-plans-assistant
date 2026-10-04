import { useEffect, useRef, useState } from "preact/hooks";
import { fetchJSON } from "../data";
import { markdownToHtml } from "../linkify";
import { href } from "../router";

interface Turn { role: "user" | "assistant"; text: string; tools: string[]; error?: string }
interface ConvSummary { id: string; title: string; updated: number }

export function ChatList({ page, q }: { page?: string; q?: string }) {
  const [convs, setConvs] = useState<ConvSummary[] | null>(null);
  useEffect(() => {
    fetchJSON<ConvSummary[]>("/api/conversations").then(setConvs).catch(() => setConvs([]));
  }, []);
  return (
    <div>
      <Chat page={page} initial={q} />
      {convs && convs.length > 0 && (
        <>
          <h2>Past questions</h2>
          <div class="list">
            {convs.map((c) => (
              <a href={href.ask(c.id)}>
                <span class="grow">
                  <div class="title" style="font-weight:500">{c.title}</div>
                  <div class="sub">{new Date(c.updated).toLocaleString()}</div>
                </span>
                <span class="chev">›</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Chat({ id, page, initial }: { id?: string; page?: string; initial?: string }) {
  const [convId, setConvId] = useState<string | undefined>(id);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState<string>("");
  const bottom = useRef<HTMLDivElement>(null);

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
    bottom.current?.scrollIntoView({ block: "end" });
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
    setBusy(true);
    setTurns((ts) => [...ts, { role: "user", text: message, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message, page }),
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("event-stream")) {
        const msg = res.headers.get("content-type")?.includes("json") ? (await res.json()).error : `Request failed (${res.status}). Your login may have expired - reload.`;
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
          else if (event === "tool") update((t) => t.tools.push(data.label));
          else if (event === "error") update((t) => (t.error = data.message));
        }
      }
    } catch (err) {
      update((t) => (t.error = (err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {title ? <h1 style="font-size:1.05rem">{title}</h1> : <h1>Ask the plans</h1>}
      {turns.length === 0 && (
        <p class="muted small">
          Ask anything about the loaded sections, e.g. “How do I make the trim tab hinge?”, “Where is E-00907-L-1 used?”, “What edge distance for the
          rudder skin rivets?” Answers cite pages you can tap.
        </p>
      )}
      <div class="chat">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div class="msg user">{t.text}</div>
          ) : (
            <div class="msg assistant">
              {t.tools.length > 0 && (
                <div class="tools">
                  {t.tools.map((x) => <div>{x}</div>)}
                </div>
              )}
              {t.text ? (
                <div dangerouslySetInnerHTML={{ __html: markdownToHtml(t.text) }} />
              ) : (
                busy && i === turns.length - 1 && !t.error && <span class="muted typing">Thinking </span>
              )}
              {t.error && <div class="note"><b>Error:</b> {t.error}</div>}
            </div>
          ),
        )}
      </div>
      <div class="chat-pad" ref={bottom} />
      <div class="composer">
        {page && <div class="ctx">Context: page {page}</div>}
        <form onSubmit={send}>
          <textarea
            rows={1}
            value={input}
            placeholder={busy ? "Answering…" : "Ask about the plans…"}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setInput(el.value);
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) send(e);
            }}
          />
          <button class="btn primary" disabled={busy || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}
