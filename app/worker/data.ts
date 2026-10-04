// Loads the static plans data (served as assets) once per isolate.
import type MiniSearch from "minisearch";
import { buildIndex, type SearchDoc } from "../src/shared/search";
import type { Env } from "./env";

export interface PartUse { page: string; steps: string[]; actions: string[]; role: string }
export interface Part {
  name?: string; material?: string; type?: string; subkit?: string; section?: string; gear?: string;
  uses: PartUse[];
}
export interface PageMeta { id: string; section: string; isBuild: boolean; rev: string | null; date: string | null; title: string; summary: string; enriched: boolean }
export interface Meta { version: string; model: string; sections: { code: string; title: string; pages: string[]; isBuild: boolean }[]; pages: PageMeta[] }

let cache: { meta: Meta; parts: Record<string, Part>; index: MiniSearch<SearchDoc> } | undefined;
let loading: Promise<typeof cache> | undefined;

export async function asset(env: Env, path: string): Promise<Response> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!res.ok) throw new Error(`asset ${path}: ${res.status}`);
  return res;
}

async function json<T>(env: Env, path: string): Promise<T> {
  return (await asset(env, path)).json() as Promise<T>;
}

export async function loadData(env: Env) {
  if (cache) return cache;
  loading ??= (async () => {
    const [meta, parts, docs] = await Promise.all([
      json<Meta>(env, "/data/meta.json"),
      json<Record<string, Part>>(env, "/data/parts.json"),
      json<SearchDoc[]>(env, "/data/search-docs.json"),
    ]);
    cache = { meta, parts, index: buildIndex(docs) };
    return cache;
  })();
  try {
    return (await loading)!;
  } finally {
    loading = undefined;
  }
}

export async function loadPage(env: Env, id: string): Promise<any | null> {
  if (!/^\d{2}[AB]?-\d{2}$/.test(id)) return null;
  try {
    return await json(env, `/data/pages/${id}.json`);
  } catch {
    return null;
  }
}

export const REGIONS = { full: "", "top-left": "_q1", "top-right": "_q2", "bottom-left": "_q3", "bottom-right": "_q4" } as const;
export type Region = keyof typeof REGIONS;

export async function pageImageBase64(env: Env, id: string, region: Region): Promise<string> {
  const res = await asset(env, `/img/ai/${id}${REGIONS[region]}.webp`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
