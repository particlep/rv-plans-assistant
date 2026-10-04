import { useState } from "preact/hooks";
import type { Meta } from "../data";
import { href } from "../router";

export function SectionView({ meta, code }: { meta: Meta; code: string }) {
  const sec = meta.sections.find((s) => s.code === code);
  const [saving, setSaving] = useState<string | null>(null);
  if (!sec) return <p>Section {code} isn't loaded.</p>;
  const pages = meta.pages.filter((p) => p.section === code);

  // Warm the service-worker cache so the section works without signal.
  async function saveOffline() {
    let done = 0;
    for (const p of pages) {
      setSaving(`Saving ${++done}/${pages.length}…`);
      await Promise.all([fetch(`/data/pages/${p.id}.json`), fetch(`/img/view/${p.id}.webp`), fetch(`/img/thumb/${p.id}.webp`)]).catch(() => {});
    }
    setSaving("Saved for offline ✓");
  }

  return (
    <div>
      <h1>
        <span class="muted">{sec.code}</span> {sec.title}
      </h1>
      <div class="row-btns">
        <button class="btn" onClick={saveOffline} disabled={!!saving && saving.startsWith("Saving")}>
          {saving ?? "⤓ Save section for offline"}
        </button>
        <a class="btn" href={href.ask(undefined, pages[0]?.id)}>💬 Ask about this section</a>
      </div>
      <div class="list">
        {pages.map((p) => (
          <a href={href.page(p.id)}>
            <img class="thumb" src={`/img/thumb/${p.id}.webp`} alt="" loading="lazy" />
            <span class="grow">
              <div class="title">{p.id}</div>
              <div class="sub">{p.title || <span class="muted">—</span>}</div>
              {p.rev && <span class="chip">Rev {p.rev}{p.date ? ` · ${p.date}` : ""}</span>}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
