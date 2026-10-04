import { getBookmarks, getLastPage, getRecentParts, type Meta } from "../data";
import { href } from "../router";

export function Home({ meta }: { meta: Meta }) {
  const last = getLastPage();
  const lastMeta = meta.pages.find((p) => p.id === last);
  const bookmarks = getBookmarks().filter((b) => meta.pages.some((p) => p.id === b));
  const recentParts = getRecentParts();
  const ref = meta.sections.filter((s) => !s.isBuild);
  const build = meta.sections.filter((s) => s.isBuild);

  return (
    <div>
      {lastMeta && (
        <a class="card" href={href.page(lastMeta.id)} style="display:flex;gap:12px;align-items:center;color:inherit">
          <img class="thumb" src={`/img/thumb/${lastMeta.id}.webp`} alt="" loading="lazy" />
          <div>
            <div class="muted small">Continue where you left off</div>
            <div class="title" style="font-weight:700">{lastMeta.id}</div>
            <div class="small">{lastMeta.title}</div>
          </div>
        </a>
      )}

      {bookmarks.length > 0 && (
        <>
          <h2>Bookmarks</h2>
          <div class="list">
            {bookmarks.map((b) => {
              const p = meta.pages.find((x) => x.id === b)!;
              return (
                <a href={href.page(b)}>
                  <span class="code">{b}</span>
                  <span class="grow sub">{p.title}</span>
                  <span class="chev">›</span>
                </a>
              );
            })}
          </div>
        </>
      )}

      {recentParts.length > 0 && (
        <>
          <h2>Recent parts</h2>
          <div>
            {recentParts.map((pn) => (
              <a class="chip accent mono" href={href.part(pn)}>{pn}</a>
            ))}
          </div>
        </>
      )}

      <h2>Build sections</h2>
      <div class="list">
        {build.map((s) => (
          <a href={href.section(s.code)}>
            <span class="code">{s.code}</span>
            <span class="grow">
              <div class="title">{s.title}</div>
              <div class="sub">{s.pages.length} pages</div>
            </span>
            <span class="chev">›</span>
          </a>
        ))}
      </div>

      <h2>Reference</h2>
      <div class="list">
        {ref.map((s) => (
          <a href={href.section(s.code)}>
            <span class="code">{s.code}</span>
            <span class="grow">
              <div class="title">{s.title}</div>
              <div class="sub">{s.pages.length} pages</div>
            </span>
            <span class="chev">›</span>
          </a>
        ))}
      </div>
      <p class="muted small">Data version {meta.version}</p>
    </div>
  );
}
