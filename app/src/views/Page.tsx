import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { useEffect, useRef, useState } from "preact/hooks";
import { getBookmarks, getPage, getParts, setLastPage, toggleBookmark, type Meta, type Page, type Part } from "../data";
import { linkifyText } from "../linkify";
import { go, href } from "../router";
import { Icon, useWide } from "../ui";

type Tab = "steps" | "figures" | "notes" | "parts" | "text";

function loadLabels(): boolean {
  try {
    return localStorage.getItem("partLabels") !== "0";
  } catch {
    return true;
  }
}

export function PageView({ meta, id, hl }: { meta: Meta; id: string; hl?: string }) {
  const wide = useWide();
  const [page, setPage] = useState<Page | null>(null);
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("steps");
  const [full, setFull] = useState(false);
  const [labels, setLabelsState] = useState(loadLabels);
  const [marked, setMarked] = useState(() => getBookmarks().includes(id));

  const setLabels = (v: boolean) => {
    setLabelsState(v);
    try {
      localStorage.setItem("partLabels", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const idx = meta.pages.findIndex((p) => p.id === id);
  const prev = meta.pages[idx - 1];
  const next = meta.pages[idx + 1];

  useEffect(() => {
    if (idx < 0) return;
    setLastPage(id);
    getPage(id)
      .then((p) => {
        setPage(p);
        setTab(p.enriched ? (p.steps.length ? "steps" : p.topics.length ? "notes" : "figures") : "text");
      })
      .catch((e) => setErr(e.message));
    getParts().then(setParts).catch(() => {});
    for (const n of [next, prev]) if (n) new Image().src = `/img/view/${n.id}.webp`;
  }, [id]);

  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [full]);

  if (idx < 0) return <p style="padding: 16px">Page {id} isn't loaded.</p>;
  const pm = meta.pages[idx];
  const sec = meta.sections.find((s) => s.code === pm.section);
  const title = page?.title || pm.title;
  const toggleMark = () => setMarked(toggleBookmark(id));

  const viewer = (
    <Viewer id={id} aspect={pm.aspect} page={page} hl={hl} full={full} setFull={setFull} labels={labels} setLabels={setLabels} variant={wide ? "desktop" : "mobile"} />
  );
  const content = page && (
    <>
      <div class="tabs" role="tablist" aria-label="Page content">
        {(["steps", "figures", "notes", "parts", "text"] as Tab[]).map((t) => (
          <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {tabName(t, page)}
            {tabCount(t, page) > 0 && <span class="n">{tabCount(t, page)}</span>}
          </button>
        ))}
      </div>
      <div class="panel" role="tabpanel">
        <TabBody tab={tab} page={page} parts={parts} hl={hl} />
      </div>
    </>
  );

  if (wide) {
    return (
      <div class="workspace">
        <SectionRail meta={meta} current={id} />
        <div class="center">
          <div class="pagehead">
            <TitleBlock id={id} section={`${pm.section} ${sec?.title ?? ""}`} rev={pm.rev} date={pm.date} />
            <div class="actions">
              {prev && <a class="btn mono" href={href.page(prev.id)} title={prev.title}><Icon.left />{prev.id}</a>}
              {next && <a class="btn mono" href={href.page(next.id)} title={next.title}>{next.id}<Icon.right /></a>}
              <button type="button" class="btn icon-only" aria-pressed={marked} aria-label={marked ? "Remove bookmark" : "Bookmark this page"} onClick={toggleMark}>
                <Icon.bookmark on={marked} />
              </button>
              <a class="btn primary" href={href.ask(undefined, { page: id })}><Icon.chat />Ask about this page</a>
            </div>
          </div>
          <h1>{title}</h1>
          {page && !page.enriched && <div><span class="chip accent">Drawing not read yet — raw text only</span></div>}
          {err && <div class="banner" style="margin: 0">{err}</div>}
          {viewer}
          <Filmstrip meta={meta} idx={idx} />
        </div>
        <aside class="side" aria-label="Page content">
          {page?.summary && <p class="summary">{page.summary}</p>}
          {content}
        </aside>
      </div>
    );
  }

  return (
    <>
      <header class="appbar">
        <a href={href.section(pm.section)} aria-label={`Back to section ${pm.section}`}>
          <Icon.left />
          {pm.section} {shortTitle(sec?.title ?? "")}
        </a>
        <span class="title mono">{id}</span>
        <button type="button" aria-pressed={marked} aria-label={marked ? "Remove bookmark" : "Bookmark this page"} onClick={toggleMark}>
          <Icon.bookmark on={marked} />
        </button>
        <button type="button" aria-label="Full screen drawing" onClick={() => setFull(true)}>
          <Icon.expand />
        </button>
      </header>
      {viewer}
      <div class="mobile-meta">
        {pm.rev && <span class="chip outline">REV {pm.rev}</span>}
        {pm.date && <span class="chip outline">{pm.date}</span>}
        {page && !page.enriched && <span class="chip accent">raw text only</span>}
      </div>
      <div class="center" style="padding-top: 6px">
        <h1>{title}</h1>
      </div>
      {err && <div class="banner">{err}</div>}
      <div class="side">{content}</div>
      <div class="page-pad" />
      <nav class="pagerbar" aria-label="Page navigation">
        <a href={prev ? href.page(prev.id) : undefined} class={prev ? "" : "off"}><Icon.left />{prev?.id}</a>
        <a class="ask" href={href.ask(undefined, { page: id })}><Icon.chat />Ask</a>
        <a href={next ? href.page(next.id) : undefined} class={next ? "" : "off"}>{next?.id}<Icon.right /></a>
      </nav>
    </>
  );
}

const shortTitle = (t: string) => (t.length > 16 ? t.split(" ")[0] : t);

function TitleBlock({ id, section, rev, date }: { id: string; section: string; rev: string | null; date: string | null }) {
  return (
    <div class="titleblock">
      <div><div class="k">PAGE</div><div class="v big">{id}</div></div>
      <div><div class="k">SECTION</div><div class="v" style="font-weight: 600">{section}</div></div>
      <div><div class="k">REV</div><div class="v mono">{rev ?? "—"}</div></div>
      <div><div class="k">DATE</div><div class="v mono">{date ?? "—"}</div></div>
    </div>
  );
}

export function SectionRail({ meta, current }: { meta: Meta; current?: string }) {
  const curSec = current ? meta.pages.find((p) => p.id === current)?.section : undefined;
  const group = (isBuild: boolean) =>
    meta.sections
      .filter((s) => s.isBuild === isBuild)
      .map((s) => (
        <>
          <a class={`sec${s.code === curSec ? " on" : ""}`} href={href.section(s.code)}>
            <span class="code">{s.code}</span>
            {s.title}
          </a>
          {s.code === curSec && (
            <div class="pages">
              {meta.pages
                .filter((p) => p.section === s.code)
                .map((p) => (
                  <a href={href.page(p.id)} class={p.id === current ? "on" : ""} aria-current={p.id === current ? "page" : undefined} title={p.title}>
                    <span class="mono">{p.id}</span>
                    {p.title.length > 38 ? p.title.slice(0, 36).replace(/[;,\s]+\S*$/, "") + "…" : p.title}
                  </a>
                ))}
            </div>
          )}
        </>
      ));
  return (
    <aside class="rail" aria-label="Sections">
      <div class="eyebrow">Build</div>
      <nav>{group(true)}</nav>
      <div class="eyebrow">Reference</div>
      <nav>{group(false)}</nav>
    </aside>
  );
}

function Filmstrip({ meta, idx }: { meta: Meta; idx: number }) {
  const near = meta.pages.slice(Math.max(0, idx - 2), idx + 3);
  return (
    <nav class="filmstrip" aria-label="Nearby pages">
      {near.map((p) => (
        <a href={href.page(p.id)} class={p.id === meta.pages[idx].id ? "on" : ""} aria-current={p.id === meta.pages[idx].id ? "page" : undefined} title={p.title}>
          <img class="thumb" src={`/img/thumb/${p.id}.webp`} alt="" loading="lazy" />
          <div style="padding-top: 4px">{p.id}</div>
        </a>
      ))}
    </nav>
  );
}

function tabName(t: Tab, p: Page): string {
  return { steps: "Steps", figures: "Figures", notes: p.topics.length ? "Content" : "Notes", parts: "Parts", text: "Text" }[t];
}
function tabCount(t: Tab, p: Page): number {
  return { steps: p.steps.length, figures: p.figures.length, notes: p.notes.length + p.topics.length, parts: partList(p).length, text: 0 }[t];
}
function partList(p: Page): string[] {
  return [...new Set([...p.partUses.map((u) => u.part), ...Object.keys(p.hotspots)])].sort();
}

function Notes({ page, hl }: { page: Page; hl?: string }) {
  return (
    <>
      {page.notes.map((n) => (
        <div class="note">
          <span class="k">{n.kind}</span>
          <span>{linkifyText(n.text, hl)}</span>
        </div>
      ))}
    </>
  );
}

function TabBody({ tab, page, parts, hl }: { tab: Tab; page: Page; parts: Record<string, Part>; hl?: string }) {
  if (tab === "steps") {
    if (!page.steps.length) return <p class="muted">No numbered steps on this page.</p>;
    return (
      <div>
        <Notes page={page} hl={hl} />
        {page.steps.map((s) => (
          <article class={`step${hl && (s.parts.includes(hl) || s.text.includes(hl)) ? " hl" : ""}`}>
            <span class={`num${s.number ? "" : " dash"}`}>{s.number ?? "–"}</span>
            <div class="body">
              {linkifyText(s.text, hl)}
              {(s.figures.length > 0 || s.tools.length > 0) && (
                <div class="tags">
                  {s.figures.map((f) => <span class="chip accent">Fig {f}</span>)}
                  {s.tools.map((t) => <span class="chip">{t}</span>)}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }
  if (tab === "figures") {
    if (!page.figures.length) return <p class="muted">No figures described yet.</p>;
    return (
      <div>
        {page.figures.map((f) => (
          <div class="topic">
            <h3>Figure {f.number}: {f.title}</h3>
            <div>{linkifyText(f.description, hl)}</div>
            {f.dimensions.length > 0 && <p class="small muted" style="margin: 6px 0 0">Dimensions: {f.dimensions.join(" · ")}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (tab === "notes") {
    if (!page.notes.length && !page.topics.length) return <p class="muted">No notes on this page.</p>;
    return (
      <div>
        <Notes page={page} hl={hl} />
        {page.topics.map((t) => (
          <div class="topic">
            <h3>{t.heading}</h3>
            <div>{linkifyText(t.text, hl)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "parts") {
    const list = partList(page);
    if (!list.length) return <p class="muted">No part numbers found on this page.</p>;
    return (
      <div>
        {list.map((pn) => {
          const use = page.partUses.find((u) => u.part === pn);
          return (
            <div class="step" style="align-items: center">
              <div class="body">
                <a class="part-link" href={href.part(pn)} style="font-weight: 600">{pn === hl ? <mark>{pn}</mark> : pn}</a>{" "}
                <span class="small">{parts[pn]?.name ?? use?.name ?? ""}</span>
                {use?.role && <div class="small muted">{use.role}</div>}
              </div>
              {page.hotspots[pn] && (
                <a class="btn icon-only" href={href.page(page.id, pn)} aria-label={`Show ${pn} on the drawing`} title="Show on drawing"><Icon.eye /></a>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return <div class="pre" style="padding-top: 12px">{page.text || "(No extractable text on this page.)"}</div>;
}

function Viewer(props: {
  id: string; aspect: number; page: Page | null; hl?: string; variant: "desktop" | "mobile";
  full: boolean; setFull: (v: boolean) => void; labels: boolean; setLabels: (v: boolean) => void;
}) {
  const { id, aspect, page, hl, full, setFull, labels, setLabels, variant } = props;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pz = useRef<PanzoomObject | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);

  // The viewer remounts per page; a cached image can finish before onLoad is wired up.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true);
  }, []);

  useEffect(() => {
    if (!inner.current || !outer.current) return;
    const el = inner.current;
    // Created once per page (and per full-screen toggle) so a late data/image load
    // can't reset a zoom that is already in progress.
    const p = Panzoom(el, {
      maxScale: 12,
      minScale: 1,
      contain: full ? undefined : "outside",
      excludeClass: "hot",
      step: 0.4,
    });
    pz.current = p;
    const box = outer.current;
    const wheel = (e: WheelEvent) => p.zoomWithWheel(e);
    const dbl = (e: MouseEvent) => (p.getScale() > 1.3 ? p.reset() : p.zoomToPoint(3.5, e));
    const change = (e: Event) => setScale((e as CustomEvent).detail.scale);
    box.addEventListener("wheel", wheel, { passive: false });
    box.addEventListener("dblclick", dbl);
    el.addEventListener("panzoomchange", change);
    return () => {
      box.removeEventListener("wheel", wheel);
      box.removeEventListener("dblclick", dbl);
      el.removeEventListener("panzoomchange", change);
      p.destroy();
      pz.current = null;
    };
  }, [id, full]);

  // Zoom to the highlighted part's first occurrence, measured on screen so it doesn't
  // depend on the zoom library's internal coordinate convention.
  useEffect(() => {
    const p = pz.current;
    if (!hl || !page?.hotspots[hl]?.length || !p || !loaded || !inner.current || !outer.current) return;
    const t = setTimeout(() => {
      const hot = inner.current?.querySelector<HTMLElement>(".hot.hl");
      const box = outer.current;
      if (!hot || !box) return;
      p.reset({ animate: false });
      const r = hot.getBoundingClientRect();
      p.zoomToPoint(3, { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }, { animate: false });
      requestAnimationFrame(() => {
        const r2 = hot.getBoundingClientRect();
        const v = box.getBoundingClientRect();
        const s = p.getScale();
        p.pan((v.x + v.width / 2 - (r2.x + r2.width / 2)) / s, (v.y + v.height / 2 - (r2.y + r2.height / 2)) / s, { relative: true, animate: true });
      });
    }, 60);
    return () => clearTimeout(t);
  }, [hl, page, loaded, full]);

  const hot = page?.hotspots ?? {};
  const labelBtn = (
    <button type="button" aria-pressed={labels} onClick={() => setLabels(!labels)} title="Highlight tappable part numbers">
      <Icon.parts />
      {variant === "desktop" ? "Part labels" : "Parts"}
    </button>
  );
  return (
    <section ref={outer} aria-label={`Drawing for page ${id}`} class={`viewer${full ? " full" : ""}${labels ? " labels" : ""}`}>
      <div ref={inner} class="pz">
        <img ref={img} class="page" src={`/img/view/${id}.webp`} alt={`Plans page ${id}`} style={`aspect-ratio:${1 / aspect}`} onLoad={() => setLoaded(true)} draggable={false} />
        {Object.entries(hot).flatMap(([pn, boxes]) =>
          boxes.map(([x0, y0, x1, y1]) => (
            <button
              type="button"
              class={`hot${pn === hl ? " hl" : ""}`}
              aria-label={`Part ${pn}`}
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
      {variant === "desktop" ? (
        <>
          <div class="vtools tl">
            <button type="button" aria-label="Zoom out" onClick={() => pz.current?.zoomOut()}>−</button>
            <span class="zoom" aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => pz.current?.zoomIn()} style="border-left: 1px solid #dad9d2">+</button>
            <button type="button" onClick={() => pz.current?.reset()}>Fit</button>
            {labelBtn}
          </div>
          <div class="vtools tr">
            <button type="button" aria-label={full ? "Exit full screen" : "Full screen"} onClick={() => setFull(!full)}>
              {full ? <Icon.close /> : <Icon.expand />}
            </button>
          </div>
        </>
      ) : (
        <>
          <div class="vtools br">{labelBtn}</div>
          {full && (
            <div class="vtools tr">
              <button type="button" aria-label="Exit full screen" onClick={() => setFull(false)}><Icon.close /></button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
