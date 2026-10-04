// Shared by the browser and the Worker so Claude searches exactly what the UI searches.
import MiniSearch, { type SearchResult } from "minisearch";

export interface SearchDoc {
  id: number;
  page: string;
  section: string;
  kind: "page" | "step" | "figure" | "note" | "topic" | "part";
  ref: string;
  title: string;
  text: string;
  parts?: string;
}

export type Hit = SearchResult & Omit<SearchDoc, "id">;

// Keep part numbers whole ("E-00907-L-1") and also index their pieces, so both
// "E-00907-L-1" and "00907" find it. Lower-cased for matching.
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;:()\[\]"'“”]+/)) {
    const w = raw.replace(/^[^\w#]+|[^\w]+$/g, "").toLowerCase();
    if (!w) continue;
    out.push(w);
    if (/[-/.]/.test(w)) for (const p of w.split(/[-/.]+/)) if (p && p !== w) out.push(p);
  }
  return out;
}

export function buildIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const ms = new MiniSearch<SearchDoc>({
    fields: ["title", "text", "parts"],
    storeFields: ["page", "section", "kind", "ref", "title", "text", "parts"],
    tokenize,
    searchOptions: { boost: { parts: 3, title: 2 } },
  });
  ms.addAll(docs);
  return ms;
}

const KIND_BOOST: Record<string, number> = { part: 1.6, step: 1.3, figure: 1.2, note: 1.1, topic: 1, page: 0.9 };

export function search(ms: MiniSearch<SearchDoc>, query: string, opts: { section?: string | null; limit?: number } = {}): Hit[] {
  const q = query.trim();
  if (!q) return [];
  const run = (combineWith: "AND" | "OR") =>
    ms.search(q, {
      combineWith,
      prefix: (term) => term.length >= 3,
      fuzzy: (term) => (term.length > 4 && !/\d/.test(term) ? 0.2 : false),
      boostDocument: (_id, _term, stored) => KIND_BOOST[(stored as SearchDoc | undefined)?.kind ?? "page"] ?? 1,
      filter: opts.section ? (r) => r.section === opts.section : undefined,
    }) as Hit[];
  let hits = run("AND");
  if (hits.length === 0) hits = run("OR");
  return hits.slice(0, opts.limit ?? 50);
}

export function snippet(text: string, terms: string[], len = 180): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    at = lower.indexOf(t.toLowerCase());
    if (at >= 0) break;
  }
  if (at < 0 || text.length <= len) return text.slice(0, len) + (text.length > len ? "…" : "");
  const start = Math.max(0, at - Math.floor(len / 3));
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (start + len < text.length ? "…" : "");
}
