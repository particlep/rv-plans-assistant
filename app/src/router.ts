import { useEffect, useState } from "preact/hooks";

export interface Route { parts: string[]; query: URLSearchParams; n: number }

let counter = 0;
function parse(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  return { parts: path ? path.split("/").map(decodeURIComponent) : [], query: new URLSearchParams(qs ?? ""), n: ++counter };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export const go = (path: string) => {
  location.hash = path.startsWith("#") ? path : `#${path}`;
};

export const href = {
  home: () => "#/",
  section: (code: string) => `#/s/${code}`,
  page: (id: string, hl?: string) => `#/p/${id}${hl ? `?hl=${encodeURIComponent(hl)}` : ""}`,
  part: (pn: string) => `#/part/${encodeURIComponent(pn)}`,
  parts: () => "#/parts",
  search: (q: string) => `#/search${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  ask: (id?: string, opts: { page?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.page) qs.set("page", opts.page);
    if (opts.q) qs.set("q", opts.q);
    return `#/ask${id ? `/${id}` : ""}${qs.toString() ? `?${qs}` : ""}`;
  },
};
