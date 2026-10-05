// Inline stroke icons and small shared UI helpers.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

const S = (props: { d: ComponentChildren; size?: number; fill?: string }) => (
  <svg class="icon" width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24" fill={props.fill ?? "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {props.d}
  </svg>
);

export const Icon = {
  search: () => <S d={<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>} />,
  left: () => <S d={<path d="M15 6l-6 6 6 6" />} />,
  right: () => <S d={<path d="M9 6l6 6-6 6" />} />,
  bookmark: (p: { on?: boolean }) => <S fill={p.on ? "currentColor" : "none"} d={<path d="M6 3h12v18l-6-4-6 4z" />} />,
  chat: () => <S d={<path d="M4 5h16v11H9l-5 4z" />} />,
  expand: () => <S d={<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />} />,
  close: () => <S d={<path d="M6 6l12 12M18 6L6 18" />} />,
  plus: () => <S d={<path d="M12 5v14M5 12h14" />} />,
  plans: () => <S d={<path d="M4 4h7v16H4zM13 4h7v16h-7z" />} />,
  parts: () => <S d={<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></>} />,
  doc: () => <S d={<path d="M6 3h9l3 3v15H6z" />} />,
  eye: () => <S d={<><rect x="3" y="5" width="18" height="14" /><circle cx="12" cy="12" r="3" /></>} />,
  list: () => <S d={<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />} />,
  send: () => <S d={<path d="M5 12h14M13 6l6 6-6 6" />} />,
};

/** True at desktop widths (matches the CSS breakpoint). */
export function useWide(): boolean {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function fmtCost(usd?: number): string {
  if (usd == null || usd <= 0) return "";
  return usd < 1 ? `~${Math.max(1, Math.round(usd * 100))}¢` : `~$${usd.toFixed(2)}`;
}

/** Wrap occurrences of the search terms in <mark>. */
export function highlight(text: string, terms: string[]): ComponentChildren[] {
  const ts = terms.filter((t) => t.length >= 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ts.length) return [text];
  const re = new RegExp(`(${ts.join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark>{part}</mark> : part));
}
