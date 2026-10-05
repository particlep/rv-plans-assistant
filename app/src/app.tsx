import { useEffect, useRef, useState } from "preact/hooks";
import { getMeta, getParts, onSessionError, type Meta } from "./data";
import { setKnown } from "./linkify";
import { go, href, useRoute } from "./router";
import { Icon, ThemeButton, useWide } from "./ui";
import { About, DisclaimerSheet, hasAcknowledged } from "./views/About";
import { ChatView } from "./views/Chat";
import { Home } from "./views/Home";
import { PageView } from "./views/Page";
import { PartsIndex, PartView } from "./views/Part";
import { SearchView } from "./views/Search";
import { SectionView } from "./views/Section";

export function App() {
  const route = useRoute();
  const wide = useWide();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sessionErr, setSessionErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [acked, setAcked] = useState(hasAcknowledged);

  useEffect(() => onSessionError((e) => setSessionErr(e.message)), []);
  useEffect(() => {
    Promise.all([getMeta(), getParts()])
      .then(([m, p]) => {
        setKnown(m.pages.map((x) => x.id), Object.keys(p));
        document.title = `${m.model} Plans`;
        setMeta(m);
      })
      .catch(() => {});
  }, []);

  const [top, arg] = route.parts;
  useEffect(() => {
    setQ(top === "search" ? (route.query.get("q") ?? "") : "");
    window.scrollTo(0, 0);
  }, [route.n]);

  // "/" jumps to search (desktop habit); Escape leaves it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      } else if (e.key === "Escape" && t === searchRef.current) {
        searchRef.current.blur();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // On phones these screens bring their own app bar (and the page viewer its own bottom bar).
  const ownBar = !wide && (top === "p" || top === "part" || (top === "ask" && !!arg));
  const hideTabs = !wide && (top === "p" || (top === "ask" && !!arg));
  const bare = top === "p" || top === "ask" || (!wide && top === "part");

  let view;
  if (!meta) view = <p class="muted" style="padding: 16px">Loading plans…</p>;
  else if (top === "s") view = <SectionView meta={meta} code={arg} />;
  else if (top === "p") view = <PageView meta={meta} id={arg} hl={route.query.get("hl") ?? undefined} />;
  else if (top === "part") view = <PartView meta={meta} pn={arg} />;
  else if (top === "parts") view = <PartsIndex meta={meta} />;
  else if (top === "about") view = <About meta={meta} />;
  else if (top === "search") view = <SearchView meta={meta} q={route.query.get("q") ?? ""} />;
  else if (top === "ask") view = <ChatView meta={meta} id={arg} page={route.query.get("page") ?? undefined} initial={route.query.get("q") ?? undefined} />;
  else view = <Home meta={meta} />;

  const navOn = (names: string[]) => (names.includes(top ?? "") ? "on" : "");

  return (
    <div class="app">
      {!ownBar && (
        <header class="topbar">
          <a class="brand" href={href.home()}>
            <span class="brand-tag">{meta?.model ?? "RV"}</span>
            <span class="brand-name">Plans</span>
          </a>
          <ThemeButton />
          <form
            class="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              go(href.search(q.trim()));
              searchRef.current?.blur();
            }}
          >
            <Icon.search />
            <label class="sr-only" for="global-search">Search the plans</label>
            <input
              id="global-search"
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              placeholder={wide ? "Part number or words — E-00907, close-out tab, prime" : "Part number or words"}
              value={q}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
              autocapitalize="characters"
              autocorrect="off"
              spellcheck={false}
            />
            {wide && <kbd>/</kbd>}
          </form>
          {wide && (
            <nav class="mainnav" aria-label="Main">
              <a href={href.home()} class={navOn(["", "s", "p"]) || (top === undefined ? "on" : "")}>Plans</a>
              <a href={href.parts()} class={navOn(["parts", "part"])}>Parts</a>
              <a href={href.ask()} class={navOn(["ask"])}>Ask</a>
            </nav>
          )}
        </header>
      )}
      {sessionErr && (
        <div class="banner" role="alert">
          {sessionErr}
          <button class="btn" onClick={() => location.reload()}>Reload / sign in</button>
        </div>
      )}
      <main class={`content${bare ? " bare" : ""}`} key={route.n}>
        {view}
      </main>
      {!acked && <DisclaimerSheet onAccept={() => setAcked(true)} />}
      {!wide && !hideTabs && (
        <nav class="tabbar" aria-label="Main">
          <a href={href.home()} class={!top || top === "s" ? "on" : ""}><Icon.plans />Plans</a>
          <a href={href.search("")} class={navOn(["search", "part", "parts"])}><Icon.search />Search</a>
          <a href={href.ask()} class={navOn(["ask"])}><Icon.chat />Ask</a>
        </nav>
      )}
    </div>
  );
}
