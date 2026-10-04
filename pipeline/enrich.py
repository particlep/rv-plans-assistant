"""Have Claude read each page image (plus its exact extracted text) and produce
structured content: ordered steps, figure descriptions, notes, and what happens to
each part on the page.

Outputs enrich/{page_id}.json (committed to git - costs money to regenerate).

Usage:
  python enrich.py --sections 06,07,08           # sync, a few pages at a time
  python enrich.py --sections 09 --batch          # Message Batches API (50% cheaper, slower)
  python enrich.py --pages 09-04 --force          # redo specific pages
  python enrich.py --sections 06 --dry-run        # show what would run + cost estimate
  python enrich.py --all --batch                  # everything not yet enriched

Needs ANTHROPIC_API_KEY in the environment or in a .env file at the project root.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import json
import os
import sys
import time
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel, Field

from common import BUILD, ENRICH_DIR, IMG_DIR, MODEL, PARTS_INDEX_SECTION, RAW_DIR, ROOT, load_sections

MODEL = "claude-opus-5-5"
PROMPT_VERSION = 1
EFFORT = "medium"

Action = Literal[
    "fabricate", "trim", "cut", "bend", "flute", "file", "drill", "match-drill", "final-drill",
    "countersink", "dimple", "deburr", "machine", "prime", "paint", "seal", "rivet", "cleco",
    "fasten", "torque", "safety-wire", "label", "mark", "measure", "fit", "align", "inspect",
    "remove", "install", "assemble", "disassemble", "set-aside", "reference", "other",
]


class Step(BaseModel):
    number: Optional[str] = Field(description="Step number as printed, e.g. '3'; null for unnumbered instructions")
    text: str = Field(description="The full step text, transcribed faithfully in reading order")
    figures: list[str] = Field(description="Figure numbers this step refers to, e.g. ['3']")
    parts: list[str] = Field(description="Part/hardware numbers involved in this step, exactly as printed")
    actions: list[Action]
    tools: list[str] = Field(description="Drill/reamer sizes, dies, special tools named, e.g. '#40', '#30 countersink', 'hand seamer'")


class Figure(BaseModel):
    number: Optional[str]
    title: str
    description: str = Field(
        description="What the drawing shows that the text alone does not: orientation, which parts mate where, "
        "edges/flanges/directions, dimensions, hole callouts, rivet callouts, views (exploded, section, detail)."
    )
    parts: list[str]
    dimensions: list[str] = Field(description="Dimension callouts shown, e.g. '11/16 [17.5 mm] from aft edge of spar'")


class Note(BaseModel):
    kind: Literal["NOTE", "CAUTION", "WARNING", "TIP", "INFO"]
    text: str


class Topic(BaseModel):
    heading: str
    text: str = Field(description="Faithful transcription of this explanatory section (reference/manual pages)")


class PartUse(BaseModel):
    part: str = Field(description="Part number exactly as printed")
    name: str = Field(description="Name used on this page, e.g. 'Left Top Skin'")
    role: str = Field(description="One short sentence: what is done to/with this part on this page")
    steps: list[str] = Field(description="Step numbers where it appears")
    figures: list[str]


class PageEnrichment(BaseModel):
    title: str = Field(description="Short descriptive title for the page, e.g. 'Elevator skin close-out tabs; trim tab hinge'")
    summary: str = Field(description="2-4 sentences: what gets done on this page and why it matters")
    revision: Optional[str]
    date: Optional[str]
    steps: list[Step]
    figures: list[Figure]
    notes: list[Note]
    topics: list[Topic] = Field(description="For reference/manual pages without numbered steps; otherwise empty")
    parts: list[PartUse]
    keywords: list[str] = Field(description="Search terms a builder might use for this page, including synonyms")


SYSTEM = f"""You are digitizing the construction plans for a Van's Aircraft {MODEL} kit airplane so a builder can search them and ask questions in the shop.

You receive one plans page as: the full page image, four overlapping close-up quadrants (top-left, top-right, bottom-left, bottom-right) for reading small callouts, and the text extracted from the PDF with normalized positions (x,y from top-left, 0-1). The extracted text is exact but its order is jumbled; use positions and the images to recover reading order. Some pages have no extractable text (text converted to outlines) - transcribe from the images.

Rules:
- Transcribe step text, notes and cautions faithfully. Do not paraphrase instructions; fix only line-break artifacts.
- Part numbers must be exactly as printed (e.g. E-00907-L-1, AN426AD3-3.5). Never invent a part number. Prefer the spelling in the extracted text when it exists.
- Figure descriptions should capture what a builder needs from the drawing: orientation (fwd/aft, inbd/outbd, up/down), which flange or edge, which parts mate and in what order, dimensions, hole sizes, rivet callouts and quantities, special views.
- Distinguish manufactured parts (letter-prefix like E-, F-, VS-, HS-, R-) from hardware (AN/MS/NAS rivets, bolts, nuts, washers; CS/LP pop rivets).
- For reference and manual pages (tools, general information, introduction) put the content in topics and leave steps empty.
- If something is unreadable, say so rather than guessing."""


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def b64(path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode()


def image_block(path):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/webp", "data": b64(path)}}


def section_title(sec: str) -> str:
    first = RAW_DIR / f"{sec}-01.json"
    return (json.loads(first.read_text()).get("section_title_guess") or "") if first.exists() else ""


def build_request(pid: str, parts_index: dict, sections: dict) -> dict:
    raw = json.loads((RAW_DIR / f"{pid}.json").read_text())
    lines = [f"[x={b['bbox'][0]:.2f} y={b['bbox'][1]:.2f}] {b['text']}" for b in raw["blocks"]]
    known = []
    for pn in sorted(raw["parts"]):
        info = parts_index.get(pn)
        known.append(f"- {pn}: {info['name']} ({info.get('material', '')})" if info else f"- {pn}")
    sec = raw["section"]
    header = (
        f"Page {pid} - Section {sec}: {sections.get(sec) or section_title(sec)}"
        f" ({'build instructions' if raw['is_build'] else 'reference/manual page'})."
    )
    text = (
        f"{header}\n\nExtracted text:\n" + ("\n".join(lines) or "(none - text is outlined; read from images)")
        + "\n\nPart numbers found in the extracted text"
        + (" with parts-index names:\n" + "\n".join(known) if known else ": (none)")
    )
    content = [image_block(IMG_DIR / "ai" / f"{pid}.webp")]
    for i, label in enumerate(["top-left", "top-right", "bottom-left", "bottom-right"], 1):
        content.append({"type": "text", "text": f"Close-up quadrant {i} ({label}):"})
        content.append(image_block(IMG_DIR / "ai" / f"{pid}_q{i}.webp"))
    content.append({"type": "text", "text": text})
    return {
        "model": MODEL,
        "max_tokens": 16000,
        "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        "output_config": {"effort": EFFORT},
        "messages": [{"role": "user", "content": content}],
    }


def save(pid: str, data: PageEnrichment, usage, raw_parts: set[str], parts_index: dict):
    claimed = {p.part for p in data.parts} | {p for s in data.steps for p in s.parts}
    unverified = sorted(p for p in claimed if p not in raw_parts and p not in parts_index)
    out = {
        "id": pid,
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "usage": {"input": usage.input_tokens, "output": usage.output_tokens,
                  "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0},
        "unverified_parts": unverified,  # parts Claude named that the text/index can't confirm
        "data": data.model_dump(),
    }
    (ENRICH_DIR / f"{pid}.json").write_text(json.dumps(out, indent=1))
    return out


def needs_run(pid: str, force: bool) -> bool:
    f = ENRICH_DIR / f"{pid}.json"
    if force or not f.exists():
        return True
    return json.loads(f.read_text()).get("prompt_version") != PROMPT_VERSION


def run_sync(client, pids, parts_index, sections, workers=4):
    def one(pid):
        req = build_request(pid, parts_index, sections)
        for attempt in range(3):
            try:
                resp = client.messages.parse(output_format=PageEnrichment, **req)
                if resp.stop_reason == "refusal":
                    return pid, f"refused ({resp.stop_details})"
                if resp.parsed_output is None:
                    return pid, f"no parsed output (stop_reason={resp.stop_reason})"
                raw = json.loads((RAW_DIR / f"{pid}.json").read_text())
                out = save(pid, resp.parsed_output, resp.usage, set(raw["parts"]), parts_index)
                u = out["usage"]
                return pid, f"ok  in={u['input']} out={u['output']} unverified={out['unverified_parts']}"
            except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
                time.sleep(20 * (attempt + 1))
                err = e
        return pid, f"failed: {err}"

    with cf.ThreadPoolExecutor(workers) as ex:
        for pid, msg in ex.map(one, pids):
            print(f"  {pid}: {msg}", flush=True)


def run_batch(client, pids, parts_index, sections):
    from anthropic.types.messages.batch_create_params import Request

    schema = anthropic.transform_schema(PageEnrichment) if hasattr(anthropic, "transform_schema") else None
    requests = []
    for pid in pids:
        req = build_request(pid, parts_index, sections)
        req["output_config"]["format"] = {"type": "json_schema", "schema": schema or PageEnrichment.model_json_schema()}
        requests.append(Request(custom_id=pid, params=req))
    batch = client.messages.batches.create(requests=requests)
    print(f"batch {batch.id} submitted ({len(pids)} pages); polling...")
    (BUILD / "last_batch.txt").write_text(batch.id)
    while True:
        batch = client.messages.batches.retrieve(batch.id)
        if batch.processing_status == "ended":
            break
        print(f"  {batch.request_counts.processing} processing...", flush=True)
        time.sleep(60)
    for r in client.messages.batches.results(batch.id):
        pid = r.custom_id
        if r.result.type != "succeeded":
            print(f"  {pid}: {r.result.type}")
            continue
        msg = r.result.message
        text = next((b.text for b in msg.content if b.type == "text"), "")
        try:
            data = PageEnrichment.model_validate_json(text)
        except Exception as e:  # noqa: BLE001
            print(f"  {pid}: invalid output ({e})")
            continue
        raw = json.loads((RAW_DIR / f"{pid}.json").read_text())
        out = save(pid, data, msg.usage, set(raw["parts"]), parts_index)
        print(f"  {pid}: ok unverified={out['unverified_parts']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sections", help="comma list, e.g. 06,07")
    ap.add_argument("--all", action="store_true", help="every extracted page")
    ap.add_argument("--pages", help="comma list of page ids, e.g. 09-04,09-05")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--batch", action="store_true", help="use the Message Batches API (50%% cheaper)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    all_ids = sorted(p.stem for p in RAW_DIR.glob("*.json"))
    if args.pages:
        pids = args.pages.split(",")
    elif args.sections:
        secs = set(args.sections.split(","))
        pids = [p for p in all_ids if p.rsplit("-", 1)[0] in secs]
    elif args.all:
        pids = all_ids
    else:
        sys.exit("pass --sections, --pages or --all")
    pids = [p for p in pids if not p.startswith(f"{PARTS_INDEX_SECTION}-")]  # parts index is parsed, not enriched
    pids = [p for p in pids if needs_run(p, args.force)]

    # Rough estimate: 5 images at ~4.8k tokens, ~3k text in, ~6k out incl. thinking.
    est = len(pids) * ((5 * 4800 + 3000) * 4 + 6000 * 20) / 1e6
    if args.batch:
        est /= 2
    print(f"{len(pids)} pages to enrich, est. ${est:.2f}: {' '.join(pids)}")
    if args.dry_run or not pids:
        return

    load_env()
    # Org-level (non-workspace) keys must name a workspace on every request.
    ws = os.environ.get("ANTHROPIC_WORKSPACE_ID")
    client = anthropic.Anthropic(default_headers={"anthropic-workspace-id": ws} if ws else None)
    parts_index = json.loads((BUILD / "parts_index.json").read_text())
    sections = load_sections()
    if args.batch:
        run_batch(client, pids, parts_index, sections)
    else:
        run_sync(client, pids, parts_index, sections, args.workers)


if __name__ == "__main__":
    main()
