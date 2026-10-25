"""Extract the Latvian Divine Principle Word documents into Markdown.

Source documents are legacy .doc files converted first to .docx with the
LibreOffice kit. Headings are not consistently tagged with Word styles, so
they are recognised by their numbering ("1. nodaļa.", "2. iedaļa.", "2.3.1.")
plus bold formatting.

Usage:
    python tools/extract.py --docx <file.docx> --mode intro  --out <file.md>
    python tools/extract.py --docx <file.docx> --mode chapter --out-dir <dir> --slugs <json>

Output is plain Markdown with [^n] footnote markers; tools/build.mjs renders it.
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

import docx
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def q(tag: str) -> str:
    return "{%s}%s" % (W, tag)


CHAPTER_RE = re.compile(r"^(\d+)\.\s*nodaļa\b", re.I)
SECTION_RE = re.compile(r"^(\d+)\.\s*iedaļa\b", re.I)
NUM_RE = re.compile(r"^(\d+(?:\.\d+)+)\.\s*")
MAX_HEADING_JOIN = 220


def footnote_texts(path: Path) -> dict:
    with zipfile.ZipFile(path) as z:
        if "word/footnotes.xml" not in z.namelist():
            return {}
        root = etree.fromstring(z.read("word/footnotes.xml"))
    notes = {}
    for fn in root.findall(q("footnote")):
        fid = fn.get(q("id"))
        text = "".join(t.text or "" for t in fn.iter(q("t"))).strip()
        text = re.sub(r"^\*+\s*", "", text)
        if text:
            notes[fid] = text
    return notes


def paragraph_tokens(paragraph):
    """Inline tokens: ('text', value, bold, italic) or ('fn', id)."""
    tokens = []
    for run in paragraph.runs:
        for ref in run._r.findall(".//" + q("footnoteReference")):
            tokens.append(("fn", ref.get(q("id"))))
        text = run.text
        if text:
            tokens.append(("text", text, bool(run.bold), bool(run.italic)))
    # The visible "*" marks are typed text; the real anchor is the footnote ref.
    cleaned = []
    for token in tokens:
        if token[0] == "fn" and cleaned and cleaned[-1][0] == "text":
            prev = cleaned[-1]
            cleaned[-1] = ("text", re.sub(r"\*+(?=[.,;:!?)\]]*$)", "", prev[1]), prev[2], prev[3])
        if token[0] == "text" and cleaned and cleaned[-1][0] == "fn":
            token = ("text", token[1].lstrip("*"), token[2], token[3])
        cleaned.append(token)
    result = []
    for token in cleaned:
        if token[0] == "text" and token[1].strip("*") == "":
            continue  # standalone visible asterisks belong to the footnote mark
        if token[0] == "text" and result and result[-1][0] == "fn":
            token = ("text", token[1].lstrip("*"), token[2], token[3])
            if not token[1]:
                continue
        result.append(token)
    return [t for t in result if t[0] != "text" or t[1]]


def plain(tokens) -> str:
    return re.sub(r"\s+", " ", "".join(t[1] for t in tokens if t[0] == "text")).strip()


def bold_ratio(tokens) -> float:
    runs = [t for t in tokens if t[0] == "text" and t[1].strip()]
    if not runs:
        return 0.0
    return sum(1 for t in runs if t[2]) / len(runs)


def classify(paragraph, tokens, used_notes):
    text = plain(tokens)
    if not text:
        return None
    style = (paragraph.style.name or "").lower()
    style_heading = style.startswith("heading")
    level = 1
    if style_heading:
        m = re.search(r"(\d+)", style)
        level = int(m.group(1)) if m else 1
    strong = bold_ratio(tokens) == 1.0
    if CHAPTER_RE.match(text) and len(text) < 160:
        return {"kind": "chapter", "tokens": tokens, "text": text}
    if SECTION_RE.match(text) and len(text) < 160:
        return {"kind": "section", "tokens": tokens, "text": text}
    numbered = NUM_RE.match(text)
    if numbered and len(text) < 140:
        depth = numbered.group(1).count(".")  # "1.1" -> 1, "2.3.1" -> 2
        return {"kind": "num", "depth": depth, "tokens": tokens, "text": text}
    if strong:
        return {"kind": "bold", "tokens": tokens, "text": text}
    if style_heading:
        return {"kind": "title", "level": level, "tokens": tokens, "text": text}
    return {"kind": "para", "tokens": tokens, "text": text}


def blocks(path: Path, extra_headings=None):
    extras = {re.sub(r"\s+", " ", item["text"]).strip(): item for item in (extra_headings or [])}
    document = docx.Document(str(path))
    out = []
    for paragraph in document.paragraphs:
        tokens = paragraph_tokens(paragraph)
        text = re.sub(r"\s+", " ", plain(tokens)).strip()
        if text in extras:
            item = extras[text]
            label = (item.get("number") + " " if item.get("number") else "") + text
            out.append({
                "kind": "num",
                "depth": int(item.get("level", 2)) - 1,
                "tokens": [("text", label, False, False)],
                "text": label,
            })
            continue
        block = classify(paragraph, tokens, None)
        if not block:
            continue
        # Bold headings that wrap onto a second line: "2. iedaļa. ... četrpozīciju" + "pamats"
        if (block["kind"] in ("chapter", "section", "num", "bold")
                and out and out[-1]["kind"] in ("chapter", "section", "num", "bold")
                and len(block["text"]) < 60
                and len(out[-1]["text"]) < MAX_HEADING_JOIN
                and not re.match(r"^\d", block["text"])):
            previous = out[-1]
            previous["text"] = (previous["text"] + " " + block["text"]).strip()
            previous["tokens"] = (previous["tokens"]
                                  + [("text", " ", False, False)]
                                  + block["tokens"])
            continue
        if block["kind"] == "bold":
            block["kind"] = "para"
        out.append(block)
    return out


def clean_ws(text: str) -> str:
    return re.sub(r"[ \t\u00a0]+", " ", text).strip()


def wrap_mark(value: str, mark: str) -> str:
    """Wrap a run in **/* while keeping boundary spaces outside the marker."""
    if not value.strip():
        return value
    lead = value[: len(value) - len(value.lstrip())]
    trail = value[len(value.rstrip()):]
    return lead + mark + value.strip() + mark + trail


def md_inline(tokens, note_ids) -> str:
    parts = []
    for token in tokens:
        if token[0] == "fn":
            fid = token[1]
            if fid in note_ids:
                parts.append("[^%s]" % note_ids[fid])
        else:
            _, value, bold, italic = token
            value = re.sub(r"[ \t\u00a0]+", " ", value)
            if not value:
                continue
            if bold:
                value = wrap_mark(value, "**")
            if italic:
                value = wrap_mark(value, "*")
            parts.append(value)
    text = "".join(parts)
    text = re.sub(r"[ \t\u00a0]{2,}", " ", text)
    return text.strip()


def assign_notes(all_blocks, notes):
    """Number footnotes per output page in order of appearance."""
    mapping, used = {}, set()
    for block in all_blocks:
        for token in block["tokens"]:
            if token[0] == "fn" and token[1] in notes and token[1] not in used:
                mapping[token[1]] = len(used) + 1
                used.add(token[1])
    return mapping, used


def heading_md(block) -> str:
    if block["kind"] in ("chapter", "section"):
        return "# " + clean_ws(block["text"])
    if block["kind"] == "title":
        return "#" * max(1, block.get("level", 1)) + " " + clean_ws(block["text"])
    return "#" * min(4, block["depth"] + 1) + " " + clean_ws(block["text"])


def render_page(blocks_, notes) -> str:
    mapping, _ = assign_notes(blocks_, notes)
    lines = []
    for block in blocks_:
        if block["kind"] in ("chapter", "section", "num", "title"):
            lines.append("")
            lines.append(heading_md(block))
            lines.append("")
        else:
            lines.append("")
            lines.append(md_inline(block["tokens"], mapping))
    body = "\n".join(lines).strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    if mapping:
        body += "\n\n"
        for fid, number in sorted(mapping.items(), key=lambda kv: kv[1]):
            body += "[^%d]: %s\n" % (number, clean_ws(notes[fid]))
    return body + "\n"


def slug_for(block_text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", block_text.lower()).strip("-")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", required=True)
    parser.add_argument("--mode", choices=["intro", "chapter"], required=True)
    parser.add_argument("--out")
    parser.add_argument("--out-dir")
    parser.add_argument("--slugs", help="JSON list of section slugs in order")
    parser.add_argument("--slugs-file", help="path to a JSON file with the section slugs")
    parser.add_argument("--extra-headings", help="JSON file with unnumbered headings to mark explicitly")
    args = parser.parse_args()

    path = Path(args.docx)
    notes = footnote_texts(path)
    extras = []
    if args.extra_headings:
        extras = json.loads(Path(args.extra_headings).read_text(encoding="utf-8-sig"))
    all_blocks = blocks(path, extras)

    if args.mode == "intro":
        markdown = render_page(all_blocks, notes)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(markdown, encoding="utf-8")
        print("wrote", args.out, len(markdown), "chars")
        return 0

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.slugs_file:
        slugs = json.loads(Path(args.slugs_file).read_text(encoding="utf-8-sig"))
    else:
        slugs = json.loads(args.slugs) if args.slugs else []

    intro_blocks, sections, current = [], [], None
    for block in all_blocks:
        if block["kind"] == "section":
            current = {"title": clean_ws(block["text"]), "blocks": []}
            sections.append(current)
        elif current is None:
            intro_blocks.append(block)
        else:
            current["blocks"].append(block)

    if not sections:
        raise SystemExit("no section headings found")

    chapter_title = next((b["text"] for b in intro_blocks if b["kind"] in ("chapter", "title")), "Nodaļa")
    chapter_blocks = [b for b in intro_blocks]
    (out_dir / "index.md").write_text(render_page(chapter_blocks, notes), encoding="utf-8")
    print("wrote", out_dir / "index.md", "|", chapter_title)

    if len(slugs) != len(sections):
        raise SystemExit("slug count %d != section count %d" % (len(slugs), len(sections)))

    manifest = []
    for slug, section in zip(slugs, sections):
        body = render_page([{"kind": "section", "text": section["title"],
                             "tokens": [("text", section["title"], False, False)]}] + section["blocks"],
                           notes)
        target = out_dir / (slug + ".md")
        target.write_text(body, encoding="utf-8")
        manifest.append({"slug": slug, "title": section["title"]})
        print("wrote", target, "|", section["title"])

    (out_dir / "sections.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
