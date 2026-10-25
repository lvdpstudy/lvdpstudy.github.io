"""Generate the Latvian colour map for one section from the reference site data.

Korean supplies the colours (primary source); English supplies the paragraph and
sentence boundaries (secondary), because the Latvian translation follows the
English edition paragraph by paragraph.

Output: content/lv/dp/colors/<section>.json
Each entry is keyed by a hash of the paragraph text and holds exact Latvian
substrings with a colour, so the build can wrap them without guessing.
"""

import hashlib
import json
import re
from pathlib import Path

from lxml import html as LH

REF = Path(r"D:\projects\LV_DP_Study\.ref\en-dual.html")
CONTENT = Path(r"D:\projects\LV_DP_Study\content\lv\dp\principle-of-creation\the-dual-characteristics-of-god-and-the-created-universe.md")
OUT = Path(r"D:\projects\LV_DP_Study\content\lv\dp\colors\the-dual-characteristics-of-god-and-the-created-universe.json")

# LV block index -> list of (reference paragraph index, segment indices or None)
MAPPING = {
    1: [(0, None)],                       # heading 1.1
    2: [(1, [0, 1])],                     # question + Paul quote
    3: [(1, [2])],
    4: [(2, None)],
    5: [(3, None)],
    6: [(4, None)],
    7: [(5, None)],
    8: [(6, None)],
    9: [(7, None)],
    10: [(8, None)],
    11: [(9, None)],
    12: [(10, None)],
    13: [(11, None)],
    14: [(12, None)],
    15: [(13, None)],
    16: [(14, None), (15, None)],
    17: [(16, None)],
    18: [(17, None)],
    19: [(18, None), (19, None)],
    20: [(20, None)],
    21: [(21, None)],
    22: [(22, None)],                     # heading 1.2
    23: [(23, None)],
    24: [(24, None)],
    25: [(25, None)],
    26: [(26, None), (27, None)],
    27: [(28, None)],
    28: [(29, None), (30, None)],
}

ABBREVIATIONS = (
    "t.i", "t.i.", "u.c", "u.c.", "utt", "utt.", "sk", "sk.", "nr", "nr.",
    "1.moz", "2.moz", "1.moz.", "2.moz.", "rom", "rom.", "mt", "mt.", "jņ", "jņ.",
    "kor", "kor.", "1.kor", "1.kor.", "ps", "ps.", "jes", "jes.", "ef", "ef.",
    "st", "st.",
)

# Paragraphs where automatic proportional mapping misplaces a boundary.
# Colours per Latvian sentence, read against the Korean/English spans.
MANUAL_COLORS = {
    2: ["red", "red", "blue"],
    11: ["blue", "blue", "yellow", "yellow", "yellow", "blue", "blue", "blue", "blue", "blue"],
    16: ["yellow", "yellow", "yellow", "yellow", "yellow", "red", "red", "red"],
    19: ["blue", "red", "red", "red", "red", "red"],
    25: ["red", "red", "blue", "blue"],
    28: ["yellow", "yellow", "yellow", "yellow", "yellow", "yellow", "yellow", None, None],
}


def hash_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:10]


def segments(content):
    if not content:
        return []
    node = LH.fragment_fromstring(content, create_parent="div")
    out = []
    for span in node.xpath(".//span[starts-with(@class,'dp-')]"):
        color = [c for c in span.get("class", "").split() if c.startswith("dp-")][0].replace("dp-", "")
        text = " ".join(span.text_content().split())
        if text:
            out.append((color, text))
    return out


def reference_paragraphs():
    doc = LH.parse(str(REF)).getroot()
    data = json.loads(doc.xpath("//script[@id='__NEXT_DATA__']/text()")[0])
    return data["props"]["pageProps"]["booksectionData"]


def split_sentences(text: str):
    """Split into sentence strings, keeping the text exact."""
    spans = []
    start = 0
    for match in re.finditer(r"[.!?]+(?=\s|$)", text):
        end = match.end()
        rest = text[end:].lstrip()
        if not rest:
            continue
        if not (rest[0].isupper() or rest[0] in "„\"«"):
            continue
        before = text[max(0, match.start() - 8):match.start() + 1].lower()
        if any(before.endswith(abbr) for abbr in ABBREVIATIONS):
            continue
        spans.append((start, end))
        start = end
    if start < len(text):
        spans.append((start, len(text)))
    return [text[a:b] for a, b in spans]


def target_colors(ko_paras, en_paras, mapping):
    """Return list of (color, sentence) for a Latvian block."""
    result = []
    for ref_index, seg_indices in mapping:
        en_segments = segments(en_paras[ref_index].get("content2"))
        ko_segments = segments(ko_paras[ref_index].get("content2"))
        ko_colors = {color for color, _ in ko_segments}
        # Korean primacy: a single Korean colour overrides English colouring.
        if len(ko_colors) == 1:
            forced = next(iter(ko_colors))
            en_segments = [(forced, text) for _, text in en_segments]
        chosen = en_segments if seg_indices is None else [en_segments[i] for i in seg_indices if i < len(en_segments)]
        for color, text in chosen:
            for sentence in split_sentences(text):
                result.append((color, sentence))
    return result


def assign(lv_text, targets):
    """Map Latvian sentences onto target colours by position."""
    lv_sentences = split_sentences(lv_text)
    if not lv_sentences:
        return [(None, lv_text)]
    if not targets:
        return [(None, lv_text)]
    out = []
    n, m = len(lv_sentences), len(targets)
    for i, sentence in enumerate(lv_sentences):
        index = min(m - 1, round(i * (m - 1) / max(1, n - 1))) if n > 1 else 0
        out.append((targets[index][0], sentence))
    return out


def main():
    bs = reference_paragraphs()
    en = bs["en"]["speechparagraphs"]
    ko = bs["ko"]["speechparagraphs"]

    lines = [line.strip() for line in CONTENT.read_text(encoding="utf-8").splitlines() if line.strip()]
    blocks = []
    for line in lines:
        if line.startswith("#"):
            blocks.append(("h", line.lstrip("# ").strip()))
        elif line.startswith("[^"):
            continue
        else:
            blocks.append(("p", line))

    def parts_for(block_index):
        kind, text = blocks[block_index]
        if kind == "h":
            targets = target_colors(ko, en, MAPPING[block_index]) if block_index not in MANUAL_COLORS else []
            color = next((c for c, _ in targets if c), None)
            if color is None and block_index in MANUAL_COLORS:
                color = MANUAL_COLORS[block_index][0]
            return [(color, text)]
        if block_index in MANUAL_COLORS:
            sentences = split_sentences(text)
            colors = MANUAL_COLORS[block_index]
            if len(sentences) != len(colors):
                raise SystemExit(f"manual colour count {len(colors)} != {len(sentences)} sentences in block {block_index}")
            return list(zip(colors, sentences))
        return assign(text, target_colors(ko, en, MAPPING[block_index]))

    entries = {}
    stats = {"paragraphs": 0, "colored": 0, "uncolored": 0, "segments": 0}
    for block_index, mapping in MAPPING.items():
        kind, text = blocks[block_index]
        parts = parts_for(block_index)
        rebuilt = "".join(part for _, part in parts)
        if rebuilt != text:
            raise SystemExit(f"reconstruction failed for block {block_index}")
        if all(color is None for color, _ in parts):
            stats["uncolored"] += 1
            continue
        entries[hash_text(text)] = {
            "kind": kind,
            "segments": [{"color": color, "text": part} for color, part in parts],
        }
        stats["paragraphs"] += 1
        stats["colored"] += 1
        stats["segments"] += len(parts)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "section": OUT.stem,
        "source": "Korean colours, English segmentation",
        "generated": "2026-10-25",
        "reference": "https://principle.study/en/dp/principle-of-creation/the-dual-characteristics-of-god-and-the-created-universe",
        "stats": stats,
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT, stats)

    # show the mixed paragraphs for review
    for block_index in (2, 11, 16, 19, 25, 28):
        parts = parts_for(block_index)
        print(f"\n--- block {block_index} ({len(parts)} segments) ---")
        for color, part in parts:
            print(f"  [{color}] {part[:90]}")


if __name__ == "__main__":
    main()
