import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { useEffect, useRef, useState } from "preact/hooks";
import { getBookmarks, getPage, getParts, setLastPage, toggleBookmark, type Meta, type Page, type Part } from "../data";
import { linkifyText } from "../linkify";
import { go, href } from "../router";

type Tab = "steps" | "figures" | "notes" | "parts" | "text";

export function PageView({ meta, id, hl }: { meta: Meta; id: string; hl?: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("steps");
  const [full, setFull] = useState(false);
  const [showHot, setShowHot] = useState(false);
  const [marked, setMarked] = useState(() => getBookmarks().includes(id));

  const idx = meta.pages.findIndex((p) => p.id === id);
  const prev = meta.pages[idx - 1];
  const next = meta.pages[idx + 1];

  useEffect(() => {
    setPage(null);
    setErr(null);
    setMarked(getBookmarks().includes(id));
    if (idx < 0) return;
    setLastPage(id);
    getPage(id)
      .then((p) => {
        setPage(p);
        setTab(p.enriched ? (p.steps.length ? "steps" : p.topics.length ? "notes" : "figures") : "text");
      })
      .catch((e) => setErr(e.message));
    getParts().then(setParts).catch(() => {});
    // prefetch neighbours for flipping through pages in the shop
    for (const n of [next, prev]) if (n) new Image().src = `/img/view/${n.id}.webp`;
  }, [id]);

  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [full]);

  if (idx < 0) return <p>Page {id} isn't loaded.</p>;
  const pm = meta.pages[idx];
  const sec = meta.sections.find((s) => s.code === pm.section);

  return (
    <div>
      <Viewer id={id} aspect={pm.aspect} page={page} hl={hl} full={full} setFull={setFull} showHot={showHot} setShowHot={setShowHot} />

      <div class="pagehead">
        <span class="pid">{id}</span>
        <a class="muted small" href={href.section(pm.section)}>
          {sec?.code} {sec?.title}
        </a>
      </div>
      <div style="font-weight:600">{page?.title || pm.title}</div>
      <div>
        {pm.rev && <span class="chip">Rev {pm.rev}</span>}
        {pm.date && <span class="chip">{pm.date}</span>}
        {page && !page.enriched && <span class="chip warn">Drawing not read yet - raw text only</span>}
      </div>

      <div class="pager">
        <a class="btn" href={prev ? href.page(prev.id) : undefined} style={prev ? "" : "visibility:hidden"}>‹ {prev?.id}</a>
        <button class="btn" onClick={() => setMarked(toggleBookmark(id))}>{marked ? "★ Saved" : "☆ Bookmark"}</button>
        <a class="btn" href={href.ask(undefined, id)}>💬 Ask</a>
        <a class="btn" href={next ? href.page(next.id) : undefined} style={next ? "" : "visibility:hidden"}>{next?.id} ›</a>
      </div>

      {err && <div class="banner">{err}</div>}
      {page && (
        <>
          {page.summary && <p class="small">{page.summary}</p>}
          <div class="seg">
            {(["steps", "figures", "notes", "parts", "text"] as Tab[]).map((t) => (
              <button class={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {label(t, page)}
              </button>
            ))}
          </div>
          <div class="card">
            <TabBody tab={tab} page={page} parts={parts} hl={hl} />
          </div>
        </>
      )}
    </div>
  );
}

function label(t: Tab, p: Page): string {
  const n = { steps: p.steps.length, figures: p.figures.length, notes: p.notes.length + p.topics.length, parts: partList(p).length, text: 0 }[t];
  const name = { steps: "Steps", figures: "Figures", notes: p.topics.length ? "Content" : "Notes", parts: "Parts", text: "Text" }[t];
  return n ? `${name} ${n}` : name;
}

function partList(p: Page): string[] {
  const s = new Set([...p.partUses.map((u) => u.part), ...Object.keys(p.hotspots)]);
  return [...s].sort();
}

function TabBody({ tab, page, parts, hl }: { tab: Tab; page: Page; parts: Record<string, Part>; hl?: string }) {
  if (tab === "steps") {
    if (!page.steps.length) return <p class="muted">No numbered steps on this page.</p>;
    return (
      <div>
        {page.steps.map((s) => (
          <div class="step">
            {s.number && <span class="num">Step {s.number}</span>}
            {linkifyText(s.text, hl)}
            <div>
              {s.figures.map((f) => <span class="chip accent">Fig {f}</span>)}
              {s.tools.map((t) => <span class="chip">{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "figures") {
    if (!page.figures.length) return <p class="muted">No figures described yet.</p>;
    return (
      <div>
        {page.figures.map((f) => (
          <div class="step">
            <div style="font-weight:600">Figure {f.number}: {f.title}</div>
            <div>{linkifyText(f.description, hl)}</div>
            {f.dimensions.length > 0 && <div class="small muted">Dimensions: {f.dimensions.join(" · ")}</div>}
          </div>
        ))}
      </div>
    );
  }
  if (tab === "notes") {
    if (!page.notes.length && !page.topics.length) return <p class="muted">No notes on this page.</p>;
    return (
      <div>
        {page.notes.map((n) => (
          <div class="note">
            <b>{n.kind}:</b> {linkifyText(n.text, hl)}
          </div>
        ))}
        {page.topics.map((t) => (
          <div class="step">
            <div style="font-weight:600">{t.heading}</div>
            <div style="white-space:pre-wrap">{linkifyText(t.text, hl)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "parts") {
    const list = partList(page);
    if (!list.length) return <p class="muted">No part numbers found on this page.</p>;
    return (
      <div class="list" style="margin:0;border:0">
        {list.map((pn) => {
          const use = page.partUses.find((u) => u.part === pn);
          return (
            <div class="row">
              <span class="grow">
                <a class="mono" href={href.part(pn)} style="font-weight:600">{pn === hl ? <mark>{pn}</mark> : pn}</a>{" "}
                <span class="small">{parts[pn]?.name ?? use?.name ?? ""}</span>
                {use?.role && <div class="sub">{use.role}</div>}
              </span>
              {page.hotspots[pn] && (
                <a class="btn" href={href.page(page.id, pn)} title="Show on drawing">◎</a>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return <div class="pre">{page.text || "(No extractable text on this page.)"}</div>;
}

function Viewer(props: {
  id: string; aspect: number; page: Page | null; hl?: string;
  full: boolean; setFull: (v: boolean) => void; showHot: boolean; setShowHot: (v: boolean) => void;
}) {
  const { id, aspect, page, hl, full, setFull, showHot, setShowHot } = props;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pz = useRef<PanzoomObject | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => setLoaded(false), [id]);

  useEffect(() => {
    if (!inner.current || !outer.current) return;
    const p = Panzoom(inner.current, {
      maxScale: 12,
      minScale: 1,
      origin: "0 0",
      contain: full ? undefined : "outside",
      exclude: Array.from(inner.current.querySelectorAll(".hot")),
      step: 0.4,
    });
    pz.current = p;
    const el = outer.current;
    const wheel = (e: WheelEvent) => p.zoomWithWheel(e);
    const dbl = (e: MouseEvent) => (p.getScale() > 1.3 ? p.reset() : p.zoomToPoint(3.5, e));
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
      p.destroy();
      pz.current = null;
    };
  }, [id, full, page, loaded]);

  // Zoom to the highlighted part's first occurrence.
  useEffect(() => {
    const boxes = hl && page?.hotspots[hl];
    const p = pz.current;
    if (!boxes || !boxes.length || !p || !loaded || !inner.current || !outer.current) return;
    const [x0, y0, x1, y1] = boxes[0];
    const W = inner.current.offsetWidth, H = inner.current.offsetHeight;
    const s = 3;
    const vw = outer.current.clientWidth, vh = outer.current.clientHeight;
    setTimeout(() => {
      p.zoom(s, { animate: false });
      p.pan(vw / 2 / s - ((x0 + x1) / 2) * W, vh / 2 / s - ((y0 + y1) / 2) * H, { animate: true });
    }, 50);
  }, [hl, page, loaded, full]);

  const hot = page?.hotspots ?? {};
  return (
    <div ref={outer} class={`viewer${full ? " full" : ""}${showHot ? " show-hot" : ""}`} style={full ? "display:flex;align-items:center" : ""}>
      <div ref={inner} class="pz" style={full ? "width:100%" : ""}>
        <img
          src={`/img/view/${id}.webp`}
          alt={`Plans page ${id}`}
          style={`aspect-ratio:${1 / aspect}`}
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
        {Object.entries(hot).flatMap(([pn, boxes]) =>
          boxes.map(([x0, y0, x1, y1]) => (
            <button
              class={`hot${pn === hl ? " hl" : ""}`}
              title={pn}
              style={`left:${(x0 - 0.003) * 100}%;top:${(y0 - 0.003) * 100}%;width:${(x1 - x0 + 0.006) * 100}%;height:${(y1 - y0 + 0.006) * 100}%`}
              onClick={(e) => {
                e.stopPropagation();
                go(href.part(pn));
              }}
            />
          )),
        )}
      </div>
      <div class="viewer-tools">
        <button onClick={() => setFull(!full)} title="Full screen">{full ? "✕" : "⤢"}</button>
        <button class={showHot ? "on" : ""} onClick={() => setShowHot(!showHot)} title="Show tappable part numbers">◎</button>
        <button onClick={() => pz.current?.reset()} title="Reset zoom">⟲</button>
      </div>
    </div>
  );
}
