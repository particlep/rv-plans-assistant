"""Parse Section 4 (Parts Index) into build/parts_index.json.

The table is printed rotated 90 degrees: each table row is a vertical strip of
spans sharing an x position, and each cell is bottom-aligned (y1) with its
column header.
"""
from __future__ import annotations

import json
from collections import defaultdict

import pymupdf

from common import BUILD, PARTS_INDEX_SECTION, discover

COLUMNS = {
    "PART NUMBER": "pn",
    "NOMENCLATURE": "name",
    "MAKE FROM MATERIAL": "material",
    "PART TYPE": "type",
    "SUB-KIT": "subkit",
    "SECT#": "section",
    "LANDING GEAR": "gear",
    "QB": "qb",
}


def spans(page):
    for b in page.get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            if line["dir"] != (0.0, -1.0):
                continue
            for s in line["spans"]:
                t = s["text"].strip()
                if t:
                    yield s["bbox"], t


def parse_page(page) -> list[dict]:
    all_spans = list(spans(page))
    headers = {}
    for bbox, t in all_spans:
        if t in COLUMNS and COLUMNS[t] not in headers:
            headers[COLUMNS[t]] = bbox
    if "pn" not in headers:
        return []
    header_x = headers["pn"][0]
    col_y1 = {k: v[3] for k, v in headers.items()}

    # Row anchors: part-number cells (bottom-aligned with the PART NUMBER header).
    rows = sorted(
        bbox[0] for bbox, t in all_spans
        if abs(bbox[3] - col_y1["pn"]) < 4 and bbox[0] > header_x + 6
    )
    cells: dict[float, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for bbox, t in all_spans:
        if bbox[0] <= header_x + 6:
            continue
        row = min(rows, key=lambda r: abs(r - bbox[0]), default=None)
        if row is None or abs(row - bbox[0]) > 9:
            continue
        col = min(col_y1, key=lambda k: abs(col_y1[k] - bbox[3]))
        if abs(col_y1[col] - bbox[3]) > 12:
            continue
        cells[row][col].append((bbox[0], t))

    out = []
    for row in rows:
        rec = {k: " ".join(t for _, t in sorted(v)) for k, v in cells[row].items()}
        if rec.get("pn"):
            out.append(rec)
    return out


def main():
    f = next((f for f in discover() if f.section == PARTS_INDEX_SECTION), None)
    out = BUILD / "parts_index.json"
    if not f:
        print(f"  ! parts index (section {PARTS_INDEX_SECTION}) PDF not found - parts will have no names/materials")
        out.write_text("{}")
        return
    parts: dict[str, dict] = {}
    for page in pymupdf.open(f.path):
        for rec in parse_page(page):
            pn = rec.pop("pn")
            # A part can appear in several rows (e.g. used in two sections); merge.
            if pn in parts:
                prev = parts[pn]
                for k, v in rec.items():
                    if v and v not in prev.get(k, "").split(", "):
                        prev[k] = f"{prev[k]}, {v}" if prev.get(k) else v
            else:
                parts[pn] = rec
    out.write_text(json.dumps(parts, indent=1, sort_keys=True))
    print(f"parts index: {len(parts)} parts")
    if not parts:
        print("  ! no rows parsed - this model's parts index layout may differ (see parse_page)")


if __name__ == "__main__":
    main()
