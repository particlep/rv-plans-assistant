"""Shared config, paths, section discovery and part-number matching for the plans pipeline.

Everything aircraft-specific comes from plans.config.json at the repo root (copy
plans.config.example.json to start).
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = ROOT / "plans.config.json"

if not CONFIG_FILE.exists():
    sys.exit("plans.config.json not found - copy plans.config.example.json and edit it (or run `make setup`).")
CONFIG: dict = json.loads(CONFIG_FILE.read_text())


def _path(key: str, default: str) -> Path:
    p = Path(CONFIG.get(key, default)).expanduser()
    return p if p.is_absolute() else (ROOT / p).resolve()


MODEL = CONFIG.get("model", "RV")
PLANS_DIR = _path("plansDir", "plans")    # your PDFs (keep private)
ENRICH_DIR = _path("enrichDir", "enrich")  # Claude's reading of each page (plan content - keep private)
SECTIONS_FILE = _path("sectionsFile", "models/rv14.json")
PARTS_INDEX_SECTION = CONFIG.get("partsIndexSection", "04")
FIRST_BUILD_SECTION = int(CONFIG.get("firstBuildSection", 6))

BUILD = ROOT / "build"
RAW_DIR = BUILD / "raw"            # per-page deterministic extraction
PUBLIC = ROOT / "app" / "public"
IMG_DIR = PUBLIC / "img"
DATA_DIR = PUBLIC / "data"

for d in (BUILD, RAW_DIR, ENRICH_DIR, IMG_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)


def section_number(code: str) -> int:
    return int(re.sub(r"\D", "", code) or 0)


@dataclass
class PlanFile:
    path: Path
    section: str  # two-digit section code, optionally with a letter suffix ("40A")

    @property
    def is_build(self) -> bool:
        return section_number(self.section) >= FIRST_BUILD_SECTION


def _normalize(code: str) -> str:
    m = re.fullmatch(r"(\d+)([A-Z]?)", code.upper())
    return f"{int(m.group(1)):02d}{m.group(2)}" if m else code.upper()


def discover() -> list[PlanFile]:
    """Match PDFs in PLANS_DIR against filePatterns. A pattern is either a regex with a
    `section` group, or {"pattern": ..., "section": "00"} for one-off files."""
    rules = []
    for p in CONFIG.get("filePatterns", []):
        if isinstance(p, dict):
            rules.append((re.compile(p["pattern"], re.I), p.get("section")))
        else:
            rules.append((re.compile(p, re.I), None))
    files = []
    for path in sorted(PLANS_DIR.glob("*.pdf")):
        for rx, fixed in rules:
            if m := rx.fullmatch(path.name):
                files.append(PlanFile(path, _normalize(fixed or m.group("section"))))
                break
        else:
            print(f"  ! skipping PDF that matches no filePatterns entry: {path.name}")
    return sorted(files, key=lambda f: (section_number(f.section), f.section))


def load_sections() -> dict[str, str]:
    """Section code -> title from sectionsFile (optional; titles detected from the PDFs fill gaps)."""
    if SECTIONS_FILE.exists():
        return json.loads(SECTIONS_FILE.read_text())
    return {}


def page_id(section: str, idx: int) -> str:
    return f"{section}-{idx + 1:02d}"


# Van's part numbers: "E-00901A", "F-01410-L", "HS-00904-1", "VS-410PP", "WD-1014", "AN426AD3-3",
# "MS20470AD4-4", "NAS1149F0363P", "K1000-3", "CS4-4", "LP4-3", "AS3-032X1X1", "VA-140" ...
PART_RE = re.compile(
    r"""(?<![A-Z0-9-])(
        (?:AN|MS|NAS)\d{2,6}[A-Z0-9]*(?:-[A-Z0-9.]+)*      # AN/MS/NAS hardware
      | [A-Z]{1,4}-\d{2,5}[A-Z]{0,3}(?:-[A-Z0-9]{1,4})*     # Van's style: E-00901A, F-01410-L-1, VS-410PP
      | [A-Z]{1,3}\d{1,4}-\d{1,3}[A-Z]?                    # K1000-3, CS4-4, LP4-3
      | AS3-[\dX.]+                                        # sheet stock
    )(?![A-Z0-9])""",
    re.X,
)

# Tokens the regex likes that are not parts (model names, page refs).
NOT_PART_RE = re.compile(r"^(RV-|PAGE|FIGURE|STEP|\d)")


def find_parts(text: str) -> list[str]:
    out = []
    for m in PART_RE.finditer(text):
        t = m.group(1).rstrip(".-")
        if NOT_PART_RE.match(t):
            continue
        out.append(t)
    return out
