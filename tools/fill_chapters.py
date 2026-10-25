"""Convert the remaining Word chapters, verify fidelity and update nav.json.

Run from the repository root:  python tools/fill_chapters.py
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(r"D:\projects\LV_DP_Study")
DOCX = ROOT / ".work" / "docx"
WORK = ROOT / ".work"
CONTENT = ROOT / "content" / "lv" / "dp"
PY = sys.executable

CHAPTERS = [
    ("02 grekakrishana", "the-human-fall"),
    ("03 eshatologija", "eschatology"),
    ("04 Mesija", "the-messiah"),
    ("05 augshamcelshanas", "resurrection"),
    ("06 predestinacija", "predestination"),
    ("07 kristologija", "christology"),
    ("08 Ievads atjaunoshana", "introduction-to-restoration"),
    ("09 pamats atjaunoshanai", "the-providence-to-lay-the-foundation"),
    ("10 Mozus un Jezus", "moses-and-jesus"),
    ("11 Periodi", "the-periods-in-providential-history"),
    ("12 paraleles", "the-parallels-between-the-two-ages"),
    ("13 sagatavoshanas periods", "the-period-of-preparation-for-the-second-advent-of-the-messiah"),
    ("14 otra advente", "the-second-advent"),
]

EXTRA_HEADINGS = {
    "02 grekakrishana": [
        {"text": "Dzīvības koks un laba un ļauna atzīšanas koks", "level": 2},
        {"text": "Dzīvības koks", "level": 3},
    ],
    "10 Mozus un Jezus": [
        {"text": "Pirmais pamats saiešanas teltij", "level": 4},
        {"text": "Otrais pamats saiešanas teltij", "level": 4},
        {"text": "Trešais pamats saiešanas teltij", "level": 4},
    ],
}


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(map(str, args))}\n{result.stdout}\n{result.stderr}")
    return result.stdout


def section_slugs(structure, chapter_slug):
    for part in ("part1", "part2"):
        for chapter in structure[part]:
            if chapter["slug"] == chapter_slug:
                return [s["slug"] for s in chapter["sections"] if not s["slug"].startswith("chart-")]
    raise SystemExit(f"chapter not found: {chapter_slug}")


def main():
    structure = json.loads((WORK / "en-structure.json").read_text(encoding="utf-8"))
    nav_path = ROOT / "tools" / "nav.json"
    nav = json.loads(nav_path.read_text(encoding="utf-8"))
    by_slug = {item["slug"]: item for part in nav["parts"] for item in part["pages"]}

    summary = []
    for docx_name, slug in CHAPTERS:
        docx = DOCX / f"{docx_name}.docx"
        slugs = section_slugs(structure, slug)
        out_dir = CONTENT / slug
        slugs_file = WORK / f"slugs-{slug}.json"
        slugs_file.write_text(json.dumps(slugs, ensure_ascii=False), encoding="utf-8")

        args = [PY, str(ROOT / "tools" / "extract.py"), "--docx", str(docx),
                "--mode", "chapter", "--out-dir", str(out_dir), "--slugs-file", str(slugs_file)]
        extras = EXTRA_HEADINGS.get(docx_name)
        if extras:
            extra_file = WORK / f"extra-{slug}.json"
            extra_file.write_text(json.dumps(extras, ensure_ascii=False), encoding="utf-8")
            args += ["--extra-headings", str(extra_file)]
        run(args)

        # Fidelity: compare docx words with the produced Markdown files.
        md_files = [str(out_dir / "index.md")] + [str(out_dir / f"{s}.md") for s in slugs]
        fidelity = run([PY, str(ROOT / "tools" / "check_fidelity.py"), str(docx)] + md_files)
        first_line = fidelity.strip().splitlines()[0]
        if "differences=0" not in first_line:
            raise SystemExit(f"fidelity failed for {docx_name}: {first_line}\n" + fidelity)

        title = (out_dir / "index.md").read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
        sections = []
        for section_slug in slugs:
            heading = (out_dir / f"{section_slug}.md").read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
            sections.append({"slug": section_slug, "title": heading})

        item = by_slug.get(slug)
        if item is None:
            raise SystemExit(f"nav item missing: {slug}")
        item["title"] = title
        item["sections"] = sections
        summary.append((slug, title, len(sections), first_line))

    nav_path.write_text(json.dumps(nav, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for slug, title, count, fidelity in summary:
        print(f"{slug:60} {count:2} sections | {title[:50]}")
        print(f"    {fidelity}")
    print("nav.json updated")


if __name__ == "__main__":
    main()
