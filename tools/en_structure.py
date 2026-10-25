"""Build the reference structure: chapter -> sections -> subsections."""

import json
from pathlib import Path

from lxml import html as LH

REF = Path(r"D:\projects\LV_DP_Study\.ref\en.html")
OUT = Path(r"D:\projects\LV_DP_Study\.work\en-structure.json")


def main():
    doc = LH.parse(str(REF)).getroot()
    anchors = []
    for a in doc.xpath("//a[starts-with(@href,'/en/dp')]"):
        href = a.get("href")
        text = " ".join(a.text_content().split())
        if not text:
            continue
        path, _, frag = href.partition("#")
        parts = [p for p in path.split("/") if p not in ("", "en", "dp")]
        anchors.append({"slug": parts[-1] if parts else "", "frag": frag, "title": text, "depth": len(parts)})

    structure = {"front": [], "part1": [], "part2": []}
    part = "front"
    chapter = None
    section = None

    for item in anchors:
        if item["depth"] == 1:
            section = None
            if item["slug"] in ("preface", "introduction"):
                structure["front"].append({"slug": item["slug"], "title": item["title"], "sections": []})
                chapter = None
                continue
            if item["slug"] == "introduction-to-restoration":
                part = "part2"
            if item["slug"] == "principle-of-creation":
                part = "part1"
            chapter = {"slug": item["slug"], "title": item["title"], "sections": []}
            structure[part].append(chapter)
            continue
        if item["depth"] == 2 and item["frag"]:
            if section is not None:
                section["subs"].append(item["title"])
            continue
        if item["depth"] == 2 and chapter is not None:
            section = {"slug": item["slug"], "title": item["title"], "subs": []}
            chapter["sections"].append(section)

    OUT.write_text(json.dumps(structure, ensure_ascii=False, indent=1), encoding="utf-8")
    for key in ("front", "part1", "part2"):
        print(f"=== {key}")
        for chapter in structure[key]:
            subs = sum(len(s["subs"]) for s in chapter["sections"])
            print(f"  {chapter['slug']}: {len(chapter['sections'])} sections, {subs} subsections | {chapter['title'][:55]}")


if __name__ == "__main__":
    main()
