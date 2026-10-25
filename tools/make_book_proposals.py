"""Create round-3 proposal files for chapters 3-14: mechanical rules applied by regex."""

import json
import re
from pathlib import Path

ROOT = Path(r"D:\projects\LV_DP_Study")
CONTENT = ROOT / "content" / "lv" / "dp"
OUT = ROOT / "corrections" / "rounds"

CHAPTERS = [
    ("eschatology", "esc"),
    ("the-messiah", "mes"),
    ("resurrection", "res"),
    ("predestination", "pre"),
    ("christology", "chr"),
    ("introduction-to-restoration", "itr"),
    ("the-providence-to-lay-the-foundation", "plf"),
    ("moses-and-jesus", "moj"),
    ("the-periods-in-providential-history", "pph"),
    ("the-parallels-between-the-two-ages", "pta"),
    ("the-period-of-preparation-for-the-second-advent-of-the-messiah", "pps"),
    ("the-second-advent", "sea"),
]

RULES = [
    {
        "key": "abbr",
        "find": r"(\d)\.([A-ZĀ-Ž][a-zā-ž]{1,12})\.",
        "replace": "$1. $2.",
        "regex": True,
        "category": "tipogrāfija",
        "note": "Bībeles grāmatu saīsinājumi rakstāmi ar atstarpi: „1. Moz.”, nevis „1.Moz.”.",
        "confidence": 0.95,
    },
    {
        "key": "jnatkl",
        "find": "Jņ.atkl.",
        "replace": "Jņ. atkl.",
        "category": "tipogrāfija",
        "note": "„Jņ. atkl.” rakstāms ar atstarpi.",
        "confidence": 0.95,
    },
    {
        "key": "apd",
        "find": "Ap.d.",
        "replace": "Ap. d.",
        "category": "tipogrāfija",
        "note": "„Ap. d.” rakstāms ar atstarpēm.",
        "confidence": 0.95,
    },
    {
        "key": "salpam",
        "find": "Sal.pam.",
        "replace": "Sal. pam.",
        "category": "tipogrāfija",
        "note": "„Sal. pam.” rakstāms ar atstarpēm.",
        "confidence": 0.95,
    },
    {
        "key": "salpam2",
        "find": "Sal.pam ",
        "replace": "Sal. pam. ",
        "category": "tipogrāfija",
        "note": "Trūkst punkta un atstarpes: „Sal. pam.”.",
        "confidence": 0.9,
    },
    {
        "key": "ranges",
        "find": r"(\d+):(\d+)-(\d+)",
        "replace": "$1:$2–$3",
        "regex": True,
        "category": "tipogrāfija",
        "note": "Skaitļu intervālos lietojama domuzīme (–), nevis defise.",
        "confidence": 0.92,
    },
    {
        "key": "years",
        "find": r"\b(1[5-9]\d{2}|20\d{2})-(1[5-9]\d{2}|20\d{2})\b",
        "replace": "$1–$2",
        "regex": True,
        "category": "tipogrāfija",
        "note": "Gadu intervālos lietojama domuzīme (–).",
        "confidence": 0.9,
    },
    {
        "key": "quotes",
        "find": "\u201c",
        "replace": "„",
        "category": "tipogrāfija",
        "note": "Atverošā pēdiņa latviešu tekstā ir „, nevis angļu “.",
        "confidence": 0.95,
    },
    {
        "key": "tadejadi",
        "find": "Tādejādi",
        "replace": "Tādējādi",
        "category": "pareizrakstība",
        "note": "Pareizi „Tādējādi”.",
        "confidence": 0.99,
    },
    {
        "key": "acimredzami",
        "find": "Tas ir acīmredzami, ka",
        "replace": "Ir acīmredzami, ka",
        "category": "stils",
        "note": "Dabiskāka konstrukcija: „Ir acīmredzami, ka”.",
        "confidence": 0.7,
    },
]


def pages_text(scope):
    folder = CONTENT / scope
    parts = []
    for path in sorted(folder.glob("*.md")):
        parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts), folder


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for scope, code in CHAPTERS:
        text, folder = pages_text(scope)
        title = (folder / "index.md").read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
        proposals = []
        for rule in RULES:
            if rule.get("regex"):
                count = len(re.findall(rule["find"], text))
            else:
                count = text.count(rule["find"])
            if not count:
                continue
            edit = {"find": rule["find"], "replace": rule["replace"]}
            if rule.get("regex"):
                edit["regex"] = True
            else:
                edit["all"] = True
            proposals.append({
                "id": f"{code}{len(proposals) + 1:02d}",
                "group": rule["key"],
                "groupNote": rule["note"],
                "category": rule["category"],
                "confidence": rule["confidence"],
                "note": rule["note"] + (f" ({count} vietas)" if count > 1 else ""),
                "edits": [edit],
            })
        if not proposals:
            print(f"{scope}: nothing to propose")
            continue
        payload = {
            "round": 3,
            "scope": scope,
            "title": title,
            "created": "2026-10-25",
            "author": "ai",
            "note": "Visa grāmata vienā aplī: mehāniskas tipogrāfijas un pareizrakstības korekcijas.",
            "proposals": proposals,
        }
        (OUT / f"r3-{scope}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        total += len(proposals)
        print(f"{scope}: {len(proposals)} proposals")
    print("total proposals:", total)


if __name__ == "__main__":
    main()
