import { useEffect, useState } from "preact/hooks";
import { fetchJSON, getBookmarks, getLastPage, getRecentParts, type Meta, type Section } from "../data";
import { href } from "../router";
import { Icon } from "../ui";

interface ConvSummary { id: string; title: string; updated: number }

function SectionList({ sections, current }: { sections: Section[]; current?: string }) {
  return (
    <nav class="list">
      {sections.map((s) => (
        <a href={href.section(s.code)} style={s.code === current ? "font-weight: 600" : ""}>
          <span class="code" style={s.code === current ? "color: var(--accent)" : ""}>{s.code}</span>
          <span class="grow">{s.title}</span>
          <span class="small muted" style="font-weight: 400">{s.pages.length} pp</span>
        </a>
      ))}
    </nav>
  );
}

export function Home({ meta }: { meta: Meta }) {
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  useEffect(() => {
    fetchJSON<ConvSummary[]>("/api/conversations").then((c) => setConvs(c.slice(0, 3))).catch(() => {});
  }, []);
  const last = meta.pages.find((p) => p.id === getLastPage());
  const bookmarks = getBookmarks().filter((b) => meta.pages.some((p) => p.id === b));
  const recentParts = getRecentParts().slice(0, 8);

  return (
    <div style="display: flex; flex-direction: column; gap: 22px">
      {last && (
        <a href={href.page(last.id)} class="card" style="display: flex; gap: 14px; align-items: center; border: 1.5px solid var(--ink); color: var(--ink); max-width: 640px">
          <img class="thumb" src={`/img/thumb/${last.id}.webp`} alt="" loading="lazy" />
          <span style="flex: 1; min-width: 0">
            <span class="eyebrow" style="color: var(--accent); display: block; margin: 0">Continue</span>
            <span class="mono" style="font-weight: 600; font-size: 18px; display: block">{last.id}</span>
            <span class="small" style="color: var(--ink-2); display: block">{last.title}</span>
          </span>
          <Icon.right />
        </a>
      )}

      <div class="split" style="gap: 22px">
        <section class="mainc" aria-label="Build sections" style="flex-basis: 420px">
          <h2 class="eyebrow">Build sections</h2>
          <SectionList sections={meta.sections.filter((s) => s.isBuild)} current={last?.section} />
        </section>
        <div class="aside" style="flex-basis: 320px; gap: 22px">
          {bookmarks.length > 0 && (
            <section aria-label="Bookmarks">
              <h2 class="eyebrow">Bookmarks</h2>
              <div class="list">
                {bookmarks.map((b) => (
                  <a href={href.page(b)}>
                    <span class="code">{b}</span>
                    <span class="grow sub">{meta.pages.find((p) => p.id === b)?.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {convs.length > 0 && (
            <section aria-label="Recent questions">
              <h2 class="eyebrow">Recent questions</h2>
              <div class="list">
                {convs.map((c) => (
                  <a href={href.ask(c.id)}>
                    <span style="color: var(--accent)"><Icon.chat /></span>
                    <span class="grow">{c.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {recentParts.length > 0 && (
            <section aria-label="Recent parts">
              <h2 class="eyebrow">Recent parts</h2>
              <div class="partchips">{recentParts.map((pn) => <a href={href.part(pn)}>{pn}</a>)}</div>
            </section>
          )}
          <section aria-label="Reference">
            <h2 class="eyebrow">Reference</h2>
            <SectionList sections={meta.sections.filter((s) => !s.isBuild)} />
          </section>
        </div>
      </div>
      <p class="small muted" style="margin: 0">Data version {meta.version}</p>
    </div>
  );
}
