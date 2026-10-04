// Tools Claude uses to look things up in the plans.
import type Anthropic from "@anthropic-ai/sdk";
import { search, snippet, tokenize } from "../src/shared/search";
import { loadData, loadPage, REGIONS, type Region } from "./data";
import type { Env } from "./env";

type Tool = Anthropic.Beta.BetaTool;

export const TOOLS: Tool[] = [
  {
    name: "search_plans",
    description:
      "Full-text search across every plans page: step text, figure descriptions, notes/cautions, reference topics, page summaries and the parts index. " +
      "Use plain builder words or part numbers (e.g. 'trim tab hinge', 'close-out tab bend', 'E-00907', 'prime'). Returns ranked hits with page id, kind, ref (step/figure number) and a snippet.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        section: { type: ["string", "null"], description: "Optional two-digit section code to restrict to, e.g. '09'" },
      },
      required: ["query", "section"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_part",
    description:
      "Look up a part or hardware number: its name, material, sub-kit and section from the Van's parts index, plus every page where it is used in build order, " +
      "with the steps and what is done to it (drill, dimple, prime, rivet...). Accepts partial numbers and returns close matches.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { part_number: { type: "string" } },
      required: ["part_number"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page",
    description:
      "Get the full structured content of one plans page by id (e.g. '09-04'): title, summary, ordered steps, figure descriptions with dimensions, notes/cautions, parts. " +
      "Text only - use view_page to see the drawing.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { page_id: { type: "string", description: "Page id like '09-04'" } },
      required: ["page_id"],
      additionalProperties: false,
    },
  },
  {
    name: "view_page",
    description:
      "Look at the actual drawing for a plans page. 'full' shows the whole page; the quadrant regions show that quarter of the page at roughly double resolution " +
      "for reading small callouts, dimensions and rivet/hole symbols. Use this when the answer depends on geometry, orientation, or anything shown rather than written.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        region: { type: "string", enum: Object.keys(REGIONS) },
      },
      required: ["page_id", "region"],
      additionalProperties: false,
    },
  },
  {
    name: "list_section",
    description: "List the pages of a section with their titles and one-paragraph summaries, in order. Good for 'what happens in section 9' or finding where a sub-assembly starts.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { section: { type: "string", description: "Two-digit section code, e.g. '06' or '40A'" } },
      required: ["section"],
      additionalProperties: false,
    },
  },
];

export const TOOL_LABELS: Record<string, (i: any) => string> = {
  search_plans: (i) => `Searching “${i.query}”${i.section ? ` in section ${i.section}` : ""}`,
  lookup_part: (i) => `Looking up ${i.part_number}`,
  get_page: (i) => `Reading page ${i.page_id}`,
  view_page: (i) => `Looking at page ${i.page_id}${i.region !== "full" ? ` (${i.region})` : ""}`,
  list_section: (i) => `Listing section ${i.section}`,
};

/** A stored, compact stand-in for an image tool result; rehydrated before each API call. */
export interface ImageRef { type: "image_ref"; page: string; region: Region }

export type ToolOutput = { text: string } | { image: ImageRef; text: string } | { error: string };

export async function runTool(env: Env, name: string, input: any): Promise<ToolOutput> {
  const { meta, parts, index } = await loadData(env);
  switch (name) {
    case "search_plans": {
      const hits = search(index, String(input.query ?? ""), { section: input.section, limit: 15 });
      if (!hits.length) return { text: "No matches. Try different words, a shorter part number, or list_section." };
      const terms = tokenize(String(input.query));
      return {
        text: hits
          .map((h) => `[${h.page || "-"}] ${h.kind}${h.ref ? ` ${h.ref}` : ""} — ${h.title}: ${snippet(h.text, terms, 220)}`)
          .join("\n"),
      };
    }
    case "lookup_part": {
      const q = String(input.part_number ?? "").trim().toUpperCase();
      const exact = parts[q];
      const matches = exact ? [q] : Object.keys(parts).filter((pn) => pn.includes(q)).slice(0, 25);
      if (!matches.length) return { text: `No part matching ${q}. Try search_plans.` };
      if (!exact && matches.length > 1) {
        return { text: `No exact match for ${q}. Close matches:\n` + matches.map((pn) => `- ${pn}: ${parts[pn].name ?? ""}`).join("\n") };
      }
      const pn = matches[0];
      const p = parts[pn];
      const lines = [
        `${pn}: ${p.name ?? "(not in parts index)"}`,
        p.material ? `Material: ${p.material}` : "",
        p.type ? `Type: ${p.type}` : "",
        p.subkit ? `Sub-kit: ${p.subkit}` : "",
        p.section ? `Parts-index section: ${p.section}` : "",
        `Used on ${p.uses.length} page(s), in build order:`,
        ...p.uses.map(
          (u) => `- [${u.page}]${u.steps.length ? ` steps ${u.steps.join(", ")}` : ""}${u.actions.length ? ` (${u.actions.join(", ")})` : ""}${u.role ? ` — ${u.role}` : ""}`,
        ),
      ];
      return { text: lines.filter(Boolean).join("\n") };
    }
    case "get_page": {
      const pg = await loadPage(env, String(input.page_id));
      if (!pg) return { error: `No page ${input.page_id}` };
      return { text: formatPage(pg) };
    }
    case "view_page": {
      const id = String(input.page_id);
      const region = (input.region in REGIONS ? input.region : "full") as Region;
      if (!meta.pages.some((p) => p.id === id)) return { error: `No page ${id}` };
      return { image: { type: "image_ref", page: id, region }, text: `Page ${id} (${region})` };
    }
    case "list_section": {
      const sec = meta.sections.find((s) => s.code === String(input.section).padStart(2, "0") || s.code === input.section);
      if (!sec) return { error: `No section ${input.section}. Loaded sections: ${meta.sections.map((s) => s.code).join(", ")}` };
      const pages = meta.pages.filter((p) => p.section === sec.code);
      return { text: `Section ${sec.code}: ${sec.title}\n` + pages.map((p) => `[${p.id}] ${p.title}${p.summary ? ` — ${p.summary}` : ""}`).join("\n") };
    }
  }
  return { error: `Unknown tool ${name}` };
}

function formatPage(pg: any): string {
  const out = [`Page ${pg.id} — Section ${pg.section} ${pg.sectionTitle} (rev ${pg.rev ?? "?"}, ${pg.date ?? "?"})`, `Title: ${pg.title}`];
  if (pg.summary) out.push(`Summary: ${pg.summary}`);
  for (const n of pg.notes ?? []) out.push(`${n.kind}: ${n.text}`);
  for (const s of pg.steps ?? []) {
    out.push(`Step ${s.number ?? "-"}: ${s.text}${s.figures.length ? ` [figs ${s.figures.join(", ")}]` : ""}${s.tools.length ? ` [tools: ${s.tools.join(", ")}]` : ""}`);
  }
  for (const f of pg.figures ?? []) {
    out.push(`Figure ${f.number ?? "-"}: ${f.title} — ${f.description}${f.dimensions.length ? ` Dimensions: ${f.dimensions.join("; ")}` : ""}`);
  }
  for (const t of pg.topics ?? []) out.push(`## ${t.heading}\n${t.text}`);
  if (pg.partUses?.length) out.push("Parts on this page:\n" + pg.partUses.map((p: any) => `- ${p.part} ${p.name}: ${p.role}`).join("\n"));
  if (!pg.enriched) out.push("(This page has not been processed by the drawing reader yet; raw text follows.)\n" + pg.text);
  return out.join("\n");
}
