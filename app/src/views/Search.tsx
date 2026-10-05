import { useEffect, useState } from "preact/hooks";
import { getIndex, getParts, getRecentParts, type Meta, type Part } from "../data";
import { href } from "../router";
import { search, snippet, tokenize, type Hit } from "../shared/search";
import { highlight, Icon, useWide } from "../ui";

type Kind = "step" | "figure" | "note" | "page";
const KIND_LABEL: Record<string, string> = { step: "Step", figure: "Figure", note: "Note", topic: "Topic", page: "Summary" };
const kindOf = (h: Hit): Kind => (h.kind === "topic" ? "note" : (h.kind as Kind));

export function SearchView({ meta, q }: { meta: Meta; q: string }) {
  const wide = useWide();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [partHits, setPartHits] = useState<[string, Part][]>([]);
  const [section, setSection] = useState("");
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ step: true, figure: true, note: true, page: true });

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      setPartHits([]);
      return;
    }
    setHits(null);
    Promise.all([getIndex(), getParts()]).then(([idx, parts]) => {
      setHits(search(idx, q, { limit: 400 }).filter((h) => h.kind !== "part"));
      const Q = q.trim().toUpperCase();
      const direct = Object.entries(parts).filter(([pn]) => pn.includes(Q));
      direct.sort(([a], [b]) => (a.startsWith(Q) ? 0 : 1) - (b.startsWith(Q) ? 0 : 1) || a.localeCompare(b));
      const byName = Q.length > 2 ? Object.entries(parts).filter(([pn, p]) => !pn.includes(Q) && p.name?.toUpperCase().includes(Q)) : [];
      setPartHits([...direct, ...byName].filter(([, p]) => p.uses.length > 0 || direct.length < 5).slice(0, 12));
    });
  }, [q]);

  if (!q.trim()) {
    const recent = getRecentParts();
    return (
      <div style="display: flex; flex-direction: column; gap: 18px">
        <p class="muted" style="margin: 0">Search part numbers (E-00901A, AN426AD3-3.5) or words (trim tab hinge, close-out tab, prime).</p>
        {recent.length > 0 && (
          <div>
            <h2 class="eyebrow">Recent parts</h2>
            <div class="partchips">{recent.map((r) => <a href={href.part(r)}>{r}</a>)}</div>
          </div>
        )}
        <div><a class="btn" href={href.parts()}><Icon.list />Browse all parts</a></div>
      </div>
    );
  }

  const terms = tokenize(q);
  const all = hits ?? [];
  const sectionCounts = new Map<string, number>();
  for (const h of all) sectionCounts.set(h.section, (sectionCounts.get(h.section) ?? 0) + 1);
  const visible = all.filter((h) => (!section || h.section === section) && kinds[kindOf(h)]);
  // Group hits by page, pages in order of their best hit.
  const groups: { page: string; hits: Hit[] }[] = [];
  const byPage = new Map<string, Hit[]>();
  for (const h of visible) {
    if (!byPage.has(h.page)) {
      byPage.set(h.page, []);
      groups.push({ page: h.page, hits: byPage.get(h.page)! });
    }
    byPage.get(h.page)!.push(h);
  }
  const pageTitle = (id: string) => meta.pages.find((p) => p.id === id)?.title ?? "";
  const partInQuery = partHits.find(([pn]) => pn === q.trim().toUpperCase())?.[0];
  const secTitle = (code: string) => meta.sections.find((s) => s.code === code)?.title ?? "";
  const sections = [...sectionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const askLink = (
    <a class="card row" href={href.ask(undefined, { q })} style="gap: 10px; color: var(--ink); font-size: 14px">
      <span style="color: var(--accent)"><Icon.chat /></span>
      <span>Ask Claude about <b>“{q}”</b> instead</span>
    </a>
  );

  const filters = wide ? (
    <aside class="filters aside" aria-label="Filters" style="flex: 0 1 240px">
      <fieldset>
        <legend class="eyebrow">Section</legend>
        <label><input type="radio" name="sec" checked={!section} onChange={() => setSection("")} />All sections<span class="count">{all.length}</span></label>
        {sections.map(([code, n]) => (
          <label><input type="radio" name="sec" checked={section === code} onChange={() => setSection(code)} />{code} {secTitle(code)}<span class="count">{n}</span></label>
        ))}
      </fieldset>
      <fieldset>
        <legend class="eyebrow">Show</legend>
        {(["step", "figure", "note", "page"] as Kind[]).map((k) => (
          <label>
            <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: (e.target as HTMLInputElement).checked })} />
            {{ step: "Steps", figure: "Figures", note: "Notes & reference", page: "Page summaries" }[k]}
          </label>
        ))}
      </fieldset>
      {askLink}
    </aside>
  ) : (
    <div class="chiprow" role="group" aria-label="Section filter">
      <button type="button" aria-pressed={!section} onClick={() => setSection("")}>All {all.length}</button>
      {sections.map(([code, n]) => (
        <button type="button" aria-pressed={section === code} onClick={() => setSection(code)}>{code} · {n}</button>
      ))}
    </div>
  );

  return (
    <div class={wide ? "split" : "stack"}>
      {filters}
      <div class="mainc" style="display: flex; flex-direction: column; gap: 24px">
        {partHits.length > 0 && (
          <section aria-label="Matching parts">
            <h2 class="eyebrow">Parts</h2>
            <div class="partgrid">
              {partHits.map(([pn, p]) => (
                <a href={href.part(pn)}>
                  <div class="pn">{pn}</div>
                  <div class="small">{p.name ?? ""}</div>
                  <div class="small muted">{p.uses.length ? `${p.uses.length} page${p.uses.length === 1 ? "" : "s"}` : "not on a loaded page"}</div>
                </a>
              ))}
            </div>
          </section>
        )}
        <section aria-label="Matches in the plans">
          <div class="sechead">
            <h2>{hits === null ? "Searching…" : `${visible.length} match${visible.length === 1 ? "" : "es"} on ${groups.length} page${groups.length === 1 ? "" : "s"}`}</h2>
            {wide && <span class="small muted">Grouped by page</span>}
          </div>
          {hits?.length === 0 && <p class="muted">No text matches. Try fewer words or part of a number.</p>}
          {groups.slice(0, 60).map((g) => (
            <article class="hitgroup">
              <a class="pid" href={href.page(g.page, partInQuery)}>{g.page}</a>
              <div class="hits">
                <a class="ptitle" href={href.page(g.page, partInQuery)}>{pageTitle(g.page)}</a>
                {g.hits.slice(0, 3).map((h) => (
                  <a class="hit" href={href.page(g.page, partInQuery)}>
                    <span class="k">{h.kind === "topic" ? h.title.slice(0, 24) : `${KIND_LABEL[h.kind]}${h.ref && h.kind !== "note" ? ` ${h.ref}` : ""}`}</span>
                    <span>{highlight(snippet(h.text, terms, 220), terms)}</span>
                  </a>
                ))}
                {g.hits.length > 3 && <span class="small muted">+ {g.hits.length - 3} more on this page</span>}
              </div>
            </article>
          ))}
        </section>
        {!wide && askLink}
      </div>
    </div>
  );
}
