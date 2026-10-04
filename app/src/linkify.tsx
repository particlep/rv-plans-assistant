// Turn page ids ("09-04") and part numbers ("E-00907-L-1") into in-app links.
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ComponentChildren } from "preact";
import { href } from "./router";

const TOKEN_RE =
  /(?<![\w-])((?:AN|MS|NAS)\d[\w.-]*\w|[A-Z]{1,4}-\d{2,5}[A-Z]{0,3}(?:-[A-Z0-9]{1,4})*|[A-Z]{1,3}\d{1,4}-\d{1,3}[A-Z]?|\d{2}[AB]?-\d{2})(?![\w])/g;

let pages = new Set<string>();
let parts = new Set<string>();
export function setKnown(pageIds: string[], partNumbers: string[]) {
  pages = new Set(pageIds);
  parts = new Set(partNumbers);
}

function target(tok: string): string | null {
  if (pages.has(tok)) return href.page(tok);
  if (parts.has(tok)) return href.part(tok);
  return null;
}

export function linkifyText(text: string, hl?: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const tok = m[1];
    const to = target(tok);
    if (!to) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <a href={to} class="mono">
        {tok === hl ? <mark>{tok}</mark> : tok}
      </a>,
    );
    last = m.index! + tok.length;
  }
  out.push(text.slice(last));
  return out;
}

export function markdownToHtml(md: string): string {
  const html = DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: true }) as string);
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (!n.parentElement?.closest("a")) nodes.push(n);
  }
  for (const n of nodes) {
    const text = n.data;
    let last = 0;
    const frag = document.createDocumentFragment();
    for (const m of text.matchAll(TOKEN_RE)) {
      const to = target(m[1]);
      if (!to) continue;
      frag.append(text.slice(last, m.index));
      const a = document.createElement("a");
      a.href = to;
      a.className = "mono";
      a.textContent = m[1];
      frag.append(a);
      last = m.index! + m[1].length;
    }
    if (last > 0) {
      frag.append(text.slice(last));
      n.replaceWith(frag);
    }
  }
  return tpl.innerHTML;
}
