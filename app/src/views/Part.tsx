import { useEffect, useState } from "preact/hooks";
import { getLastPage, getParts, getRecentParts, pushRecentPart, type Meta, type Part } from "../data";
import { href } from "../router";
import { Icon, useWide } from "../ui";

const titleCase = (s: string) => s.toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function PartView({ meta, pn }: { meta: Meta; pn: string }) {
  const wide = useWide();
  const [parts, setParts] = useState<Record<string, Part> | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    getParts().then(setParts);
  }, []);
  useEffect(() => {
    if (parts?.[pn]) pushRecentPart(pn);
  }, [parts, pn]);

  const bar = !wide && (
    <header class="appbar">
      <a
        href={href.parts()}
        aria-label="Back"
        onClick={(e) => {
          if (history.length > 1) {
            e.preventDefault();
            history.back();
          }
        }}
      >
        <Icon.left />
      </a>
      <span class="title">Part</span>
      <a href={href.ask(undefined, { q: `Where and how is ${pn} used?` })} aria-label={`Ask about ${pn}`}><Icon.chat /></a>
    </header>
  );
  if (!parts) return <>{bar}<p class="muted padded">Loading…</p></>;

  const p = parts[pn];
  const base = pn.match(/^([A-Z]{1,4}-\d{3,5})/)?.[1];
  const related = base ? Object.keys(parts).filter((k) => k !== pn && k.startsWith(base)).slice(0, 20) : [];
  if (!p) {
    return (
      <>
        {bar}
        <div class={wide ? "" : "padded"}>
          <h1 class="part-title">{pn}</h1>
          <p>Not in the parts index or on any loaded page.</p>
          <a class="btn" href={href.search(pn)}>Search for “{pn}”</a>
        </div>
      </>
    );
  }
  const here = getLastPage();
  const uses = showAll || p.uses.length <= 8 ? p.uses : p.uses.slice(0, 6);
  const pageTitle = (id: string) => meta.pages.find((x) => x.id === id)?.title ?? "";

  const details = (
    <section class="aside" aria-label="Part details">
      {wide && <div class="crumb"><a href={href.parts()}>Parts</a> / <span class="mono">{pn}</span></div>}
      <h1 class="part-title">{pn}</h1>
      <div style="font-size: 18px; font-weight: 500">{p.name ? titleCase(p.name) : "Not in the Van's parts index"}</div>
      {(p.material || p.type || p.subkit || p.section) && (
        <dl class="specs">
          <div><dt>MATERIAL</dt><dd class="mono" style="font-size: 13px">{p.material || "—"}</dd></div>
          <div><dt>TYPE</dt><dd>{p.type ? titleCase(p.type) : "—"}</dd></div>
          <div><dt>SUB-KIT</dt><dd>{p.subkit ? titleCase(p.subkit) : "—"}</dd></div>
          <div><dt>SECTION</dt><dd>{p.section ? <a href={href.section(p.section)}>{p.section} {meta.sections.find((s) => s.code === p.section)?.title ?? ""}</a> : "—"}</dd></div>
        </dl>
      )}
      {p.gear && p.gear !== "ALL" && <div><span class="chip accent">{p.gear} only</span></div>}
      {wide && (
        <div class="row">
          <a class="btn primary" href={href.ask(undefined, { q: `Where and how is ${pn} used?` })}><Icon.chat />Ask about {pn}</a>
          <a class="btn" href={href.search(pn)}>Full-text search</a>
        </div>
      )}
      {related.length > 0 && (
        <div>
          <h2 class="eyebrow">Related part numbers</h2>
          <div class="partchips">{related.map((r) => <a href={href.part(r)}>{r}</a>)}</div>
        </div>
      )}
    </section>
  );

  const list = (
    <section class="mainc" aria-label="Where it is used">
      <div class="sechead">
        <h2>Used on {p.uses.length} page{p.uses.length === 1 ? "" : "s"}{wide ? ", in build order" : ""}</h2>
        <span class="small muted">{wide ? "Open a page to see this part highlighted" : "build order"}</span>
      </div>
      {p.uses.length === 0 && <p class="muted">Not referenced on any loaded page yet.</p>}
      <ol class="uses">
        {uses.map((u) => (
          <li>
            <a href={href.page(u.page, pn)}>
              {wide ? <img class="thumb lg" src={`/img/thumb/${u.page}.webp`} alt="" loading="lazy" /> : <span class={`dot${u.page === here ? " here" : ""}`} />}
              <span style="flex: 1; min-width: 0">
                <span class="pid">{u.page}</span>{" "}
                <span class="small muted">
                  {u.steps.length ? `step${u.steps.length > 1 ? "s" : ""} ${u.steps.join(", ")}` : ""}
                  {u.page === here ? (u.steps.length ? " · you are here" : "you are here") : ""}
                </span>
                <span class="role" style="display: block">{u.role || pageTitle(u.page)}</span>
                {u.actions.length > 0 && <span class="row" style="gap: 6px">{u.actions.map((a) => <span class="chip accent">{a}</span>)}</span>}
              </span>
              {!wide && <span class="muted" style="padding-top: 4px"><Icon.right /></span>}
            </a>
          </li>
        ))}
      </ol>
      {uses.length < p.uses.length && (
        <button type="button" class="btn" style="margin-top: 14px" onClick={() => setShowAll(true)}>Show {p.uses.length - uses.length} more pages</button>
      )}
    </section>
  );

  return (
    <>
      {bar}
      <div class={wide ? "split" : "stack padded"}>
        {details}
        {list}
      </div>
    </>
  );
}

export function PartsIndex({ meta }: { meta: Meta }) {
  const [parts, setParts] = useState<Record<string, Part> | null>(null);
  const [filter, setFilter] = useState("");
  const [showUnnamed, setShowUnnamed] = useState(false);
  useEffect(() => {
    getParts().then(setParts);
  }, []);
  const recent = getRecentParts();
  if (!parts) return <p class="muted">Loading parts…</p>;
  const f = filter.trim().toUpperCase();
  const rows = Object.entries(parts)
    .filter(([pn, p]) => p.uses.length > 0 && (showUnnamed || !!p.name) && (!f || pn.includes(f) || (p.name ?? "").toUpperCase().includes(f)))
    .sort(([a, pa], [b, pb]) => (pa.uses[0]?.page ?? "zz").localeCompare(pb.uses[0]?.page ?? "zz") || a.localeCompare(b));
  const shown = rows.slice(0, 300);

  return (
    <div style="display: flex; flex-direction: column; gap: 18px">
      <h1 style="margin: 0; font-size: 24px">Parts</h1>
      {recent.length > 0 && (
        <div>
          <h2 class="eyebrow">Recent</h2>
          <div class="partchips">{recent.map((r) => <a href={href.part(r)}>{r}</a>)}</div>
        </div>
      )}
      <div class="row">
        <label class="sr-only" for="parts-filter">Filter parts</label>
        <input
          id="parts-filter"
          type="search"
          placeholder="Filter by number or name"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          style="flex: 1 1 280px; min-height: 44px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit"
        />
        <label class="row" style="gap: 8px; font-size: 14px; min-height: 44px">
          <input type="checkbox" checked={showUnnamed} onChange={(e) => setShowUnnamed((e.target as HTMLInputElement).checked)} style="width: 18px; height: 18px; accent-color: var(--accent)" />
          Include unnamed references
        </label>
      </div>
      <p class="small muted" style="margin: 0">
        {rows.length} parts{rows.length > shown.length ? `, showing the first ${shown.length}` : ""} · ordered by where they first appear
      </p>
      <div class="list">
        {shown.map(([pn, p]) => (
          <a href={href.part(pn)}>
            <span class="mono" style="font-weight: 600; min-width: 9em">{pn}</span>
            <span class="grow">
              <div>{p.name ? titleCase(p.name) : <span class="muted">—</span>}</div>
              <div class="sub">{p.uses.length ? `${p.uses[0].page}${p.uses.length > 1 ? ` + ${p.uses.length - 1} more` : ""}` : "not on a loaded page"}</div>
            </span>
            <span class="muted"><Icon.right /></span>
          </a>
        ))}
      </div>
      <span class="sr-only">{meta.model}</span>
    </div>
  );
}
