import { useEffect, useState } from "preact/hooks";
import { getIndex, getParts, type Meta, type Part } from "../data";
import { href } from "../router";
import { search, snippet, tokenize, type Hit } from "../shared/search";

const KIND_LABEL: Record<string, string> = { step: "Step", figure: "Figure", note: "Note", topic: "Topic", page: "Page", part: "Part" };

export function SearchView({ meta, q }: { meta: Meta; q: string }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [partHits, setPartHits] = useState<[string, Part][]>([]);
  const [section, setSection] = useState<string>("");

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      setPartHits([]);
      return;
    }
    setHits(null);
    Promise.all([getIndex(), getParts()]).then(([idx, parts]) => {
      setHits(search(idx, q, { section: section || null, limit: 80 }).filter((h) => h.kind !== "part"));
      const Q = q.trim().toUpperCase();
      const direct = Object.entries(parts).filter(([pn]) => pn.includes(Q));
      direct.sort(([a], [b]) => (a.startsWith(Q) ? 0 : 1) - (b.startsWith(Q) ? 0 : 1) || a.localeCompare(b));
      const byName = Q.length > 2 ? Object.entries(parts).filter(([pn, p]) => !pn.includes(Q) && p.name?.toUpperCase().includes(Q)) : [];
      setPartHits([...direct, ...byName].slice(0, 30));
    });
  }, [q, section]);

  if (!q.trim()) return <p class="muted">Search part numbers (E-00901A, AN426AD3-3.5) or words (trim tab hinge, close-out tab, prime).</p>;
  const terms = tokenize(q);
  const titleOf = (id: string) => meta.pages.find((p) => p.id === id)?.title ?? "";
  const partInQuery = partHits.find(([pn]) => pn === q.trim().toUpperCase())?.[0];

  return (
    <div>
      <div class="seg">
        <button class={section === "" ? "on" : ""} onClick={() => setSection("")}>All</button>
        {meta.sections.map((s) => (
          <button class={section === s.code ? "on" : ""} onClick={() => setSection(s.code)}>{s.code}</button>
        ))}
      </div>

      {partHits.length > 0 && (
        <>
          <h2>Parts</h2>
          <div class="list">
            {partHits.map(([pn, p]) => (
              <a href={href.part(pn)}>
                <span class="grow">
                  <span class="mono" style="font-weight:600">{pn}</span> <span class="small">{p.name}</span>
                  <div class="sub">{p.uses.length ? `Used on ${p.uses.map((u) => u.page).join(", ")}` : "Not on a loaded page"}</div>
                </span>
                <span class="chev">›</span>
              </a>
            ))}
          </div>
        </>
      )}

      <h2>In the plans</h2>
      {hits === null && <p class="muted">Searching…</p>}
      {hits?.length === 0 && <p class="muted">No text matches.</p>}
      <div class="list">
        {hits?.map((h) => (
          <a href={href.page(h.page, partInQuery)}>
            <span class="code">{h.page}</span>
            <span class="grow">
              <div class="small">
                <span class="chip">{KIND_LABEL[h.kind]}{h.ref && h.kind !== "note" ? ` ${h.ref}` : ""}</span>
                <span class="muted">{h.kind === "figure" || h.kind === "topic" ? h.title : titleOf(h.page)}</span>
              </div>
              <div class="sub">{snippet(h.text, terms, 200)}</div>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
