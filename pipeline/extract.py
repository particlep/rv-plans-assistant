"""Deterministic per-page extraction: title block, text blocks, part mentions with
positions, and page images.

Outputs
  build/raw/{page_id}.json
  app/public/img/view/{id}.webp    ~3600px wide, for pinch-zoom in the app
  app/public/img/ai/{id}.webp      2576px long edge, what Claude sees for the full page
  app/public/img/ai/{id}_q{1-4}.webp  2x2 overlapping quadrants for close-up reading
  app/public/img/thumb/{id}.webp   small list thumbnails

Usage: python extract.py [--sections 06,07] [--force-images]
"""
from __future__ import annotations

import argparse
import io
import json
import re

import pymupdf
from PIL import Image

from common import IMG_DIR, PARTS_INDEX_SECTION, RAW_DIR, discover, find_parts, page_id

VIEW_W = 3600
AI_LONG = 2576
THUMB_W = 480
QUAD_OVERLAP = 0.06
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{2}$")


def norm(rect, page) -> list[float]:
    w, h = page.rect.width, page.rect.height
    return [round(rect[0] / w, 4), round(rect[1] / h, 4), round(rect[2] / w, 4), round(rect[3] / h, 4)]


def title_block(page, pid: str) -> dict:
    """Revision and date live in the title block along the bottom edge (left on even
    pages, right on odd pages)."""
    h = page.rect.height
    words = [w for w in page.get_text("words") if w[1] > h - 50]
    labels = [w for w in words if w[4] == "REVISION:"]
    nums = [w for w in words if re.fullmatch(r"\d{1,2}", w[4])]
    rev = None
    if labels and nums:
        def dist(n):
            return min(((n[0] - l[2]) ** 2 + (n[1] - l[1]) ** 2) for l in labels)
        rev = min(nums, key=dist)[4]
    dates = [w for w in words if DATE_RE.match(w[4])]
    date = None
    if dates:
        dl = [w for w in words if w[4] == "DATE:"] or labels
        date = min(dates, key=lambda d: min(abs(d[0] - l[2]) + abs(d[1] - l[1]) for l in dl) if dl else 0)[4]
    if date is None:  # first pages of a section carry the block elsewhere
        m = re.search(r"\b(\d{2}/\d{2}/\d{2})\b", page.get_text())
        date = m.group(1) if m else None
    return {"rev": rev, "date": date}


STOP_WORDS = ("PARTICIPANTS", "NOTE", "DATE", "PAGE", "REVISION", "VAN'S", "STEP", "PART NUMBER", "NOMENCLATURE", "FIGURE")


def guess_section_title(page) -> str | None:
    """First pages usually carry 'SECTION 6: / VERTICAL / STABILIZER' - used when the
    sections file has no title for this section."""
    lines = [l.strip() for l in page.get_text().splitlines() if l.strip()]
    for i, line in enumerate(lines):
        m = re.match(r"^SECTION\s+\d+[A-Z]?\s*:\s*(.*)$", line)
        if not m:
            continue
        first = re.sub(r"^RV-\d+[A-Z]?\s*", "", m.group(1)).strip()
        words = [first] if first else []
        for nxt in lines[i + 1 : i + 5]:
            nxt = re.sub(r"^RV-\d+[A-Z]?\s*", "", nxt)
            if not nxt:
                continue
            if (nxt.startswith(STOP_WORDS) or not re.fullmatch(r"[A-Z0-9 &/.\-]+", nxt)
                    or re.search(r"\d{2}/\d{2}", nxt) or find_parts(nxt)):
                break
            words.append(nxt)
            if len(" ".join(words).split()) >= 5:
                break
        title = " ".join(w for w in words if w).strip()
        if title:
            return title.title()
    return None


def text_blocks(page) -> list[dict]:
    out = []
    for b in page.get_text("blocks", sort=True):
        x0, y0, x1, y1, text, _, btype = b
        text = " ".join(text.split())
        if btype == 0 and text:
            out.append({"bbox": norm((x0, y0, x1, y1), page), "text": text})
    return out


def part_mentions(page) -> dict[str, list[list[float]]]:
    found: dict[str, list] = {}
    for w in page.get_text("words"):
        for pn in find_parts(w[4]):
            found.setdefault(pn, []).append(norm(w[:4], page))
    return found


def save_webp(pix, path, quality=80):
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    img.save(path, "WEBP", quality=quality, method=5)


def render(page, pid: str, force: bool):
    view = IMG_DIR / "view" / f"{pid}.webp"
    if view.exists() and not force:
        return
    for sub in ("view", "ai", "thumb"):
        (IMG_DIR / sub).mkdir(parents=True, exist_ok=True)
    r = page.rect
    save_webp(page.get_pixmap(matrix=pymupdf.Matrix(VIEW_W / r.width, VIEW_W / r.width)), view, 78)
    z = AI_LONG / max(r.width, r.height)
    save_webp(page.get_pixmap(matrix=pymupdf.Matrix(z, z)), IMG_DIR / "ai" / f"{pid}.webp", 85)
    zt = THUMB_W / r.width
    save_webp(page.get_pixmap(matrix=pymupdf.Matrix(zt, zt)), IMG_DIR / "thumb" / f"{pid}.webp", 70)
    # quadrants: q1 top-left, q2 top-right, q3 bottom-left, q4 bottom-right
    hw, hh = r.width / 2, r.height / 2
    ow, oh = r.width * QUAD_OVERLAP, r.height * QUAD_OVERLAP
    quads = [
        pymupdf.Rect(0, 0, hw + ow, hh + oh),
        pymupdf.Rect(hw - ow, 0, r.width, hh + oh),
        pymupdf.Rect(0, hh - oh, hw + ow, r.height),
        pymupdf.Rect(hw - ow, hh - oh, r.width, r.height),
    ]
    for i, q in enumerate(quads, 1):
        zq = AI_LONG / max(q.width, q.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zq, zq), clip=q)
        save_webp(pix, IMG_DIR / "ai" / f"{pid}_q{i}.webp", 85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sections", help="comma list, e.g. 06,07 (default: all)")
    ap.add_argument("--force-images", action="store_true")
    args = ap.parse_args()
    only = set(args.sections.split(",")) if args.sections else None

    for f in discover():
        if only and f.section not in only:
            continue
        doc = pymupdf.open(f.path)
        print(f"section {f.section}: {f.path.name} ({doc.page_count} pages)")
        for i, page in enumerate(doc):
            pid = page_id(f.section, i)
            rec = {
                "id": pid,
                "section": f.section,
                "index": i + 1,
                "source": f.path.name,
                "is_build": f.is_build,
                "width": page.rect.width,
                "height": page.rect.height,
                **title_block(page, pid),
                "blocks": text_blocks(page),
                # The parts index lists every part; mentions there are not "uses".
                "parts": {} if f.section == PARTS_INDEX_SECTION else part_mentions(page),
                "section_title_guess": guess_section_title(page) if i == 0 else None,
            }
            (RAW_DIR / f"{pid}.json").write_text(json.dumps(rec))
            render(page, pid, args.force_images)


if __name__ == "__main__":
    main()
