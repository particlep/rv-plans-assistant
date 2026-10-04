"""Merge raw extraction + Claude enrichment + parts index into the static data the
app and the chat Worker read.

Outputs (app/public/data/)
  meta.json          sections, page list with titles/summaries
  parts.json         every part: index info + where it is used, in build order
  search-docs.json   flat documents for full-text search (steps, figures, notes, topics, pages, parts)
  pages/{id}.json    full content of one page
"""
from __future__ import annotations

import hashlib
import json
import re

import make_icons
from common import BUILD, DATA_DIR, ENRICH_DIR, MODEL, RAW_DIR, load_sections, section_number, FIRST_BUILD_SECTION

# --- standard hardware decoding -------------------------------------------------

FRACTION_16 = {1: "1/16", 2: "1/8", 3: "3/16", 4: "1/4", 5: "5/16", 6: "3/8", 7: "7/16", 8: "1/2",
               9: "9/16", 10: "5/8", 11: "11/16", 12: "3/4", 14: "7/8", 16: "1"}
RIVET_HEADS = {"426": "flush (100° countersunk head) rivet", "470": "universal (round head) rivet"}
BOLT_DIA = {"3": "#10-32", "4": "1/4-28", "5": "5/16-24", "6": "3/8-24", "7": "7/16-20", "8": "1/2-20"}


def _len16(s: str) -> str:
    """Rivet length code in 1/16ths; may carry a half, e.g. '3.5'."""
    try:
        v = float(s)
    except ValueError:
        return s
    whole = int(v)
    if v != whole:
        return f"{int(v * 2)}/32\""
    return f"{FRACTION_16.get(whole, f'{whole}/16')}\""


def decode_hardware(pn: str) -> str | None:
    if m := re.fullmatch(r"(?:AN|MS20)(426|470)(AD|A|B|D|DD)(\d)-(\d+(?:\.5)?)", pn):
        head, mat, dia, ln = m.groups()
        alloy = {"AD": "2117-T4", "A": "1100", "B": "5056", "D": "2017-T4", "DD": "2024-T4"}[mat]
        dia_s = {"3": "3/32", "4": "1/8", "5": "5/32", "6": "3/16", "8": "1/4"}.get(dia, f"{dia}/32")
        return f"{RIVET_HEADS[head].capitalize()}, {alloy}, {dia_s}\" dia x {_len16(ln)} long"
    if m := re.fullmatch(r"AN(\d)-(\d+)(A?)", pn):
        dia, ln, a = m.groups()
        if dia in BOLT_DIA:
            n = int(ln)
            inches, eighths = (n // 10, n % 10)
            length = f"{inches} {eighths}/8\"" if inches else f"{eighths}/8\""
            drilled = "undrilled shank" if a else "drilled shank"
            return f"AN bolt, {BOLT_DIA[dia]}, ~{length} grip-length code {ln} ({drilled})"
    if re.fullmatch(r"AN960-\w+L?", pn):
        return "Flat washer (AN960)" + (", thin" if pn.endswith("L") else "")
    if re.fullmatch(r"AN970-\w+", pn):
        return "Large-area flat washer (AN970)"
    if re.fullmatch(r"AN365-\w+", pn):
        return "Elastic stop nut, nylon insert (AN365)"
    if re.fullmatch(r"MS21042L?-\w+", pn):
        return "All-metal reduced-height lock nut (MS21042)"
    if re.fullmatch(r"AN310-\w+", pn):
        return "Castellated nut (AN310)"
    if re.fullmatch(r"AN526C?-\w+", pn):
        return "Truss-head screw (AN526)"
    if re.fullmatch(r"AN50[79]-\w+", pn):
        return "100° flush machine screw (AN507/AN509)"
    if re.fullmatch(r"AN515-\w+", pn) or re.fullmatch(r"AN525-\w+", pn):
        return "Washer-head screw (AN525)"
    if re.fullmatch(r"MS24693-\w+", pn):
        return "100° flush machine screw (MS24693)"
    if re.fullmatch(r"K1000-\d+", pn):
        return "Nutplate, 2-lug floating anchor"
    if re.fullmatch(r"K1100-\d+", pn):
        return "Nutplate, 100° countersunk 2-lug"
    if re.fullmatch(r"(?:CS4|CCR-264SS)-\d+(?:-\d+)?", pn):
        return "Flush blind (pop) rivet"
    if re.fullmatch(r"LP4-\d+", pn):
        return "Blind (pop) rivet, dome head"
    if re.fullmatch(r"AN257-P\d+", pn):
        return "Piano hinge (AN257)"
    fittings = {"816": "Flared tube nipple (AN816)", "818": "Flare nut (AN818)", "819": "Flare sleeve (AN819)",
                "822": "90° elbow, flare to pipe (AN822)", "823": "45° elbow, flare to pipe (AN823)",
                "832": "Bulkhead union (AN832)", "833": "90° bulkhead elbow (AN833)", "837": "45° bulkhead elbow (AN837)"}
    if (m := re.fullmatch(r"AN-?(81[689]|82[23]|83[237])(?:-.+)?", pn)):
        return fittings[m.group(1)]
    if re.fullmatch(r"CR-321[234]-\d+-\d+", pn):
        return "CherryMAX blind rivet"
    if re.fullmatch(r"NAS1149\w+", pn):
        return "Flat washer (NAS1149)"
    return None


# --- assembly -------------------------------------------------------------------

def sort_key(pid: str):
    sec, page = pid.rsplit("-", 1)
    return (int(re.sub(r"\D", "", sec)), sec, int(page))


def compact_enrichment(e: dict | None) -> dict:
    if not e:
        return {}
    return e["data"]


def main():
    sections = load_sections()
    parts_index = json.loads((BUILD / "parts_index.json").read_text())
    raws = sorted((json.loads(p.read_text()) for p in RAW_DIR.glob("*.json")), key=lambda r: sort_key(r["id"]))
    # Fill titles the sections file doesn't have from what extract.py found on each first page.
    for r in raws:
        if r.get("section_title_guess") and not sections.get(r["section"]):
            sections[r["section"]] = r["section_title_guess"]
    for code in {r["section"] for r in raws}:
        sections.setdefault(code, f"Section {code}")

    (DATA_DIR / "pages").mkdir(parents=True, exist_ok=True)
    meta_pages, docs = [], []
    uses: dict[str, list] = {}

    for raw in raws:
        pid = raw["id"]
        ef = ENRICH_DIR / f"{pid}.json"
        enr = compact_enrichment(json.loads(ef.read_text()) if ef.exists() else None)

        title = enr.get("title") or next(
            (b["text"][:80] for b in raw["blocks"] if b["text"].startswith(("SECTION", "FIGURE"))), ""
        )
        page = {
            "id": pid,
            "section": raw["section"],
            "sectionTitle": sections.get(raw["section"], ""),
            "isBuild": raw["is_build"],
            "rev": raw["rev"] or enr.get("revision"),
            "date": raw["date"] or enr.get("date"),
            "aspect": raw["height"] / raw["width"],
            "title": title,
            "summary": enr.get("summary", ""),
            "enriched": bool(enr),
            "steps": enr.get("steps", []),
            "figures": enr.get("figures", []),
            "notes": enr.get("notes", []),
            "topics": enr.get("topics", []),
            "partUses": enr.get("parts", []),
            "keywords": enr.get("keywords", []),
            "hotspots": raw["parts"],  # part number -> list of normalized bboxes on the page image
            "text": "\n".join(b["text"] for b in raw["blocks"]),
        }
        (DATA_DIR / "pages" / f"{pid}.json").write_text(json.dumps(page, separators=(",", ":")))
        meta_pages.append({k: page[k] for k in ("id", "section", "isBuild", "rev", "date", "aspect", "title", "summary", "enriched")})

        # --- part uses on this page
        on_page: dict[str, dict] = {}
        for pn in raw["parts"]:
            on_page.setdefault(pn, {"page": pid, "steps": [], "actions": [], "role": ""})
        for pu in enr.get("parts", []):
            u = on_page.setdefault(pu["part"], {"page": pid, "steps": [], "actions": [], "role": ""})
            u["role"] = pu["role"]
            u["steps"] = sorted(set(u["steps"]) | set(pu["steps"]), key=lambda s: (len(s), s))
        for st in enr.get("steps", []):
            for pn in st["parts"]:
                u = on_page.setdefault(pn, {"page": pid, "steps": [], "actions": [], "role": ""})
                if st["number"] and st["number"] not in u["steps"]:
                    u["steps"].append(st["number"])
                u["actions"] = sorted(set(u["actions"]) | set(st["actions"]) - {"reference", "other"})
        for pn, u in on_page.items():
            uses.setdefault(pn, []).append(u)

        # --- search docs
        base = {"page": pid, "section": raw["section"]}
        if enr:
            docs.append({**base, "kind": "page", "ref": "", "title": title,
                         "text": " ".join([enr.get("summary", ""), " ".join(enr.get("keywords", []))])})
            for st in enr.get("steps", []):
                docs.append({**base, "kind": "step", "ref": st["number"] or "", "title": f"Step {st['number']}" if st["number"] else "Instruction",
                             "text": st["text"], "parts": " ".join(st["parts"])})
            for fg in enr.get("figures", []):
                docs.append({**base, "kind": "figure", "ref": fg["number"] or "", "title": f"Figure {fg['number'] or ''}: {fg['title']}",
                             "text": fg["description"] + " " + " ".join(fg["dimensions"]), "parts": " ".join(fg["parts"])})
            for nt in enr.get("notes", []):
                docs.append({**base, "kind": "note", "ref": nt["kind"], "title": nt["kind"], "text": nt["text"]})
            for tp in enr.get("topics", []):
                docs.append({**base, "kind": "topic", "ref": "", "title": tp["heading"], "text": tp["text"]})
        else:
            docs.append({**base, "kind": "page", "ref": "", "title": title, "text": page["text"], "parts": " ".join(raw["parts"])})

    # --- parts table
    parts = {}
    for pn in sorted(set(parts_index) | set(uses)):
        info = dict(parts_index.get(pn, {}))
        hw = decode_hardware(pn)
        if hw and not info:
            info = {"name": hw, "type": "HARDWARE"}
        parts[pn] = {**info, "uses": sorted(uses.get(pn, []), key=lambda u: sort_key(u["page"]))}
    for pn, p in parts.items():
        docs.append({"page": p["uses"][0]["page"] if p["uses"] else "", "section": p.get("section", ""),
                     "kind": "part", "ref": pn, "title": pn, "text": " ".join(filter(None, [p.get("name"), p.get("material"), p.get("subkit")])),
                     "parts": pn})

    for i, d in enumerate(docs):
        d["id"] = i

    sec_list = []
    for code, name in sorted(sections.items(), key=lambda kv: (section_number(kv[0]), kv[0])):
        pages = [p["id"] for p in meta_pages if p["section"] == code]
        if pages:
            sec_list.append({"code": code, "title": name, "pages": pages, "isBuild": section_number(code) >= FIRST_BUILD_SECTION})

    blob = json.dumps(docs, separators=(",", ":"))
    version = hashlib.sha1((blob + json.dumps(meta_pages)).encode()).hexdigest()[:10]
    (DATA_DIR / "meta.json").write_text(json.dumps({"version": version, "model": MODEL, "sections": sec_list, "pages": meta_pages}, separators=(",", ":")))
    (DATA_DIR / "parts.json").write_text(json.dumps(parts, separators=(",", ":")))
    (DATA_DIR / "search-docs.json").write_text(blob)
    manifest = {
        "name": f"{MODEL} Plans", "short_name": MODEL,
        "description": f"Searchable Van's {MODEL} construction plans with a build assistant",
        "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any",
        "background_color": "#14202e", "theme_color": "#14202e",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (DATA_DIR.parent / "manifest.webmanifest").write_text(json.dumps(manifest, indent=1))
    make_icons.main()
    enriched = sum(p["enriched"] for p in meta_pages)
    print(f"data v{version}: {len(meta_pages)} pages ({enriched} enriched), {len(parts)} parts, {len(docs)} search docs")


if __name__ == "__main__":
    main()
