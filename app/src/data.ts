import type MiniSearch from "minisearch";
import { buildIndex, type SearchDoc } from "./shared/search";

export interface PageMeta {
  id: string; section: string; isBuild: boolean; rev: string | null; date: string | null;
  aspect: number; title: string; summary: string; enriched: boolean;
}
export interface Section { code: string; title: string; pages: string[]; isBuild: boolean }
export interface Meta { version: string; model: string; sections: Section[]; pages: PageMeta[] }
export interface PartUse { page: string; steps: string[]; actions: string[]; role: string }
export interface Part {
  name?: string; material?: string; type?: string; subkit?: string; section?: string; gear?: string; uses: PartUse[];
}
export interface Step { number: string | null; text: string; figures: string[]; parts: string[]; actions: string[]; tools: string[] }
export interface Figure { number: string | null; title: string; description: string; parts: string[]; dimensions: string[] }
export interface Page extends PageMeta {
  sectionTitle: string;
  steps: Step[];
  figures: Figure[];
  notes: { kind: string; text: string }[];
  topics: { heading: string; text: string }[];
  partUses: { part: string; name: string; role: string; steps: string[]; figures: string[] }[];
  keywords: string[];
  hotspots: Record<string, number[][]>;
  text: string;
}

/** Raised when Access redirected us to its login page (session expired) or we're offline. */
export class SessionError extends Error {}

const listeners = new Set<(e: SessionError) => void>();
export const onSessionError = (fn: (e: SessionError) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    const e = new SessionError("Can't reach the server (offline, or your login expired).");
    listeners.forEach((l) => l(e));
    throw e;
  }
  const type = res.headers.get("content-type") ?? "";
  if ((res.redirected && !res.url.startsWith(location.origin)) || !type.includes("json")) {
    const e = new SessionError("Your login session expired.");
    listeners.forEach((l) => l(e));
    throw e;
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => {
    p ??= fn().catch((e) => {
      p = undefined;
      throw e;
    });
    return p;
  };
}

export const getMeta = once(() => fetchJSON<Meta>("/data/meta.json"));
export const getParts = once(() => fetchJSON<Record<string, Part>>("/data/parts.json"));
export const getIndex = once(async (): Promise<MiniSearch<SearchDoc>> => buildIndex(await fetchJSON<SearchDoc[]>("/data/search-docs.json")));

const pageCache = new Map<string, Promise<Page>>();
export function getPage(id: string): Promise<Page> {
  let p = pageCache.get(id);
  if (!p) {
    p = fetchJSON<Page>(`/data/pages/${id}.json`);
    p.catch(() => pageCache.delete(id));
    pageCache.set(id, p);
  }
  return p;
}

// --- per-device conveniences (bookmarks, last page) ------------------------------
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
export const getBookmarks = () => load<string[]>("bookmarks", []);
export function toggleBookmark(id: string): boolean {
  const b = getBookmarks();
  const on = !b.includes(id);
  store("bookmarks", on ? [...b, id].sort() : b.filter((x) => x !== id));
  return on;
}
export const getLastPage = () => load<string | null>("lastPage", null);
export const setLastPage = (id: string) => store("lastPage", id);
export const getRecentParts = () => load<string[]>("recentParts", []);
export const pushRecentPart = (pn: string) => store("recentParts", [pn, ...getRecentParts().filter((x) => x !== pn)].slice(0, 12));
