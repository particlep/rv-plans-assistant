import { useEffect, useState } from "preact/hooks";
import { getMeta, getParts, onSessionError, type Meta } from "./data";
import { setKnown } from "./linkify";
import { go, href, useRoute } from "./router";
import { Chat, ChatList } from "./views/Chat";
import { Home } from "./views/Home";
import { PageView } from "./views/Page";
import { PartView } from "./views/Part";
import { SearchView } from "./views/Search";
import { SectionView } from "./views/Section";

export function App() {
  const route = useRoute();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionErr, setSessionErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => onSessionError((e) => setSessionErr(e.message)), []);
  useEffect(() => {
    Promise.all([getMeta(), getParts()])
      .then(([m, p]) => {
        setMeta(m);
        document.title = `${m.model} Plans`;
        setKnown(m.pages.map((x) => x.id), Object.keys(p));
        setReady(true);
      })
      .catch(() => {});
  }, []);

  const [top] = route.parts;
  useEffect(() => {
    if (top === "search") setQ(route.query.get("q") ?? "");
    window.scrollTo(0, 0);
  }, [route.parts.join("/"), route.query.toString()]);

  let view;
  if (!ready || !meta) view = <p class="muted">Loading plans…</p>;
  else if (top === "s") view = <SectionView meta={meta} code={route.parts[1]} />;
  else if (top === "p") view = <PageView meta={meta} id={route.parts[1]} hl={route.query.get("hl") ?? undefined} />;
  else if (top === "part") view = <PartView meta={meta} pn={route.parts[1]} />;
  else if (top === "search") view = <SearchView meta={meta} q={route.query.get("q") ?? ""} />;
  else if (top === "ask" && route.parts[1]) view = <Chat id={route.parts[1]} />;
  else if (top === "ask") view = <ChatList page={route.query.get("page") ?? undefined} q={route.query.get("q") ?? undefined} />;
  else view = <Home meta={meta} />;

  const tab = (name: string, to: string, ico: string, label: string) => (
    <a href={to} class={top === name || (!top && name === "") ? "on" : ""}>
      <span class="ico">{ico}</span>
      {label}
    </a>
  );

  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href={href.home()}>{meta?.model ?? "Plans"}</a>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) go(href.search(q.trim()));
          }}
        >
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Part number or words…"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            autocapitalize="characters"
            autocorrect="off"
            spellcheck={false}
          />
        </form>
      </header>
      <main>
        {sessionErr && (
          <div class="banner">
            {sessionErr}
            <button class="btn" onClick={() => location.reload()}>Reload / sign in</button>
          </div>
        )}
        <div key={route.n}>{view}</div>
      </main>
      <nav class="tabbar">
        {tab("", href.home(), "📘", "Plans")}
        {tab("search", href.search(q), "🔎", "Search")}
        {tab("ask", href.ask(), "💬", "Ask")}
      </nav>
    </div>
  );
}
