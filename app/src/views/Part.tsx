import { useEffect, useState } from "preact/hooks";
import { getParts, pushRecentPart, type Meta, type Part } from "../data";
import { href } from "../router";

export function PartView({ meta, pn }: { meta: Meta; pn: string }) {
  const [parts, setParts] = useState<Record<string, Part> | null>(null);
  useEffect(() => {
    getParts().then(setParts);
  }, []);
  useEffect(() => {
    if (parts?.[pn]) pushRecentPart(pn);
  }, [parts, pn]);
  if (!parts) return <p class="muted">Loading…</p>;

  const p = parts[pn];
  // Related: same base number, e.g. E-00907-1 / E-00907-L-1 / E-00907-R-1
  const base = pn.match(/^([A-Z]{1,4}-\d{3,5})/)?.[1];
  const related = base ? Object.keys(parts).filter((k) => k !== pn && k.startsWith(base)).slice(0, 20) : [];

  if (!p) {
    return (
      <div>
        <h1 class="mono">{pn}</h1>
        <p>Not found in the parts index or on any loaded page.</p>
        <a class="btn" href={href.search(pn)}>Search for “{pn}”</a>
      </div>
    );
  }
  const title = (id: string) => meta.pages.find((x) => x.id === id)?.title ?? "";

  return (
    <div>
      <h1 class="mono">{pn}</h1>
      <div class="card">
        <div style="font-weight:600">{p.name ?? "Not in the Van's parts index"}</div>
        {p.material && <div class="small">Material: {p.material}</div>}
        <div style="margin-top:6px">
          {p.type && <span class="chip">{p.type}</span>}
          {p.subkit && <span class="chip">{p.subkit} kit</span>}
          {p.section && <a class="chip accent" href={href.section(p.section)}>Section {p.section}</a>}
          {p.gear && p.gear !== "ALL" && <span class="chip warn">{p.gear} only</span>}
        </div>
      </div>
      <div class="row-btns">
        <a class="btn" href={href.ask(undefined) + `?q=${encodeURIComponent(`Where and how is ${pn} used?`)}`}>💬 Ask about {pn}</a>
        <a class="btn" href={href.search(pn)}>🔎 Full-text search</a>
      </div>

      <h2>Used on {p.uses.length} page{p.uses.length === 1 ? "" : "s"} (build order)</h2>
      {p.uses.length === 0 && <p class="muted">Not referenced on any loaded page yet.</p>}
      <div class="list">
        {p.uses.map((u) => (
          <a href={href.page(u.page, pn)}>
            <img class="thumb" src={`/img/thumb/${u.page}.webp`} alt="" loading="lazy" />
            <span class="grow">
              <div class="title">
                {u.page}
                {u.steps.length > 0 && <span class="muted small"> · step {u.steps.join(", ")}</span>}
              </div>
              <div class="sub">{u.role || title(u.page)}</div>
              <div>{u.actions.map((a) => <span class="chip accent">{a}</span>)}</div>
            </span>
          </a>
        ))}
      </div>

      {related.length > 0 && (
        <>
          <h2>Related part numbers</h2>
          <div>
            {related.map((r) => (
              <a class="chip mono" href={href.part(r)}>{r}</a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
