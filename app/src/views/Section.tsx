import { useState } from "preact/hooks";
import type { Meta } from "../data";
import { href } from "../router";
import { Icon, useWide } from "../ui";

export function SectionView({ meta, code }: { meta: Meta; code: string }) {
  const wide = useWide();
  const [saving, setSaving] = useState<string | null>(null);
  const sec = meta.sections.find((s) => s.code === code);
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
    <div style="display: flex; flex-direction: column; gap: 16px">
      <div class="crumb"><a href={href.home()}>Plans</a> / Section {sec.code}</div>
      <h1 style="margin: 0; font-size: 24px">
        <span class="mono muted">{sec.code}</span> {sec.title}
      </h1>
      <div class="row">
        <a class="btn primary" href={href.page(pages[0].id)}>Start at {pages[0].id}</a>
        <button type="button" class="btn" onClick={saveOffline} disabled={!!saving && saving.startsWith("Saving")}>
          {saving ?? "Save section for offline"}
        </button>
        <a class="btn" href={href.ask(undefined, { page: pages[0].id })}><Icon.chat />Ask about this section</a>
      </div>
      {wide ? (
        <div class="partgrid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px">
          {pages.map((p) => (
            <a href={href.page(p.id)} style="padding: 10px">
              <img class="thumb" style="width: 100%" src={`/img/thumb/${p.id}.webp`} alt="" loading="lazy" />
              <div class="row" style="justify-content: space-between; padding-top: 8px">
                <span class="pn">{p.id}</span>
                {p.rev && <span class="chip outline">REV {p.rev}</span>}
              </div>
              <div class="small" style="color: var(--ink-2)">{p.title}</div>
            </a>
          ))}
        </div>
      ) : (
        <div class="list">
          {pages.map((p) => (
            <a href={href.page(p.id)}>
              <img class="thumb" src={`/img/thumb/${p.id}.webp`} alt="" loading="lazy" />
              <span class="grow">
                <div class="mono" style="font-weight: 600">{p.id}</div>
                <div class="sub">{p.title}</div>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
