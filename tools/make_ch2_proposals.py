"""Build the Chapter 2 proposal round from a curated list, with occurrence checks."""

import json
import re
from pathlib import Path

ROOT = Path(r"D:\projects\LV_DP_Study")
CHAPTER = ROOT / "content" / "lv" / "dp" / "the-human-fall"
OUT = ROOT / "corrections" / "rounds" / "r2-the-human-fall.json"

# Specific fixes first: they must apply before the chapter-wide abbreviation pass.
SPECIFIC = [
    ("1.Moz.1:26", "1. Moz. 1:26", "tipogrāfija", "Trūkst atstarpes starp grāmatas saīsinājumu un nodaļu.", 0.95, False),
    ("būdu radījis", "būtu radījis", "pareizrakstība", "Drukas kļūda: „būdu” → „būtu”.", 0.99, False),
    ("Vasarassvētku", "Vasarsvētku", "pareizrakstība", "Svētku nosaukums ir „Vasarsvētki”.", 0.98, False),
    ("izbēgsit", "izbēgsiet", "gramatika", "Nākotnes 2. personas daudzskaitļa forma ir „izbēgsiet”.", 0.98, False),
    ("jālaiž pasaulē labā bērni", "jālaiž pasaulē labos bērnus", "gramatika", "„Laist pasaulē” prasa akuzatīvu: „labos bērnus”.", 0.95, False),
    ("jāiepazīst eņģelis", "jāiepazīst eņģeļus", "gramatika", "„Jāiepazīst” prasa akuzatīvu: „eņģeļus”.", 0.92, False),
    ("Tas ir acīmredzami, ka šī „vecā čūska”", "Ir acīmredzami, ka šī „vecā čūska”", "stils", "Konstrukcija „tas ir acīmredzami, ka” ir neveikla; dabiski „ir acīmredzami, ka”.", 0.7, False),
    ("Tas ir acīmredzami, ka viņi kaunējās", "Ir acīmredzami, ka viņi kaunējās", "stils", "Tā pati konstrukcija kā iepriekš.", 0.7, False),
    ("Un tā kā, pirms viņa tika nomesta", "Un tā kā pirms viņa tika nomesta", "pieturzīmes", "Komats pēc „kā” šeit nav vajadzīgs.", 0.9, False),
    ("Kā tad tas, ko mēs ēdam varēja", "Kā tad tas, ko mēs ēdam, varēja", "pieturzīmes", "Palīgteikums „ko mēs ēdam” jānoslēdz ar komatu.", 0.92, False),
    ("Bet tādā gadījumā, mums var rasties", "Bet tādā gadījumā mums var rasties", "pieturzīmes", "Komats pēc „gadījumā” nav vajadzīgs.", 0.9, False),
    ("sodam,” (", "sodam” (", "pieturzīmes", "Komats pieder aiz noslēdzošās pēdiņas, nevis iekšpusē.", 0.9, False),
    ("„pēdējam Ādamam”, (", "„pēdējam Ādamam” (", "pieturzīmes", "Komats pirms iekavām nav vajadzīgs.", 0.9, False),
    ("Neprincipiālas mīlestības", "Neprincipiālās mīlestības", "saskaņa", "Citā vietā lietots „Neprincipiālās”; jāsaglabā noteiktā galotne.", 0.8, False),
    ("līdz pat šai dienai dzima grēkā un turpināja", "līdz pat šai dienai dzimst grēkā un turpina", "gramatika", "Tagadnes nozīmē jālieto „dzimst … turpina”.", 0.85, False),
    ("Kā vārdā cilvēks būtu riskējis", "Kāda vārdā cilvēks būtu riskējis", "leksika", "Iespējams, domāts „kāda vārdā” (kālab). Jāapstiprina komitejai.", 0.55, False),
]

SYSTEMATIC = [
    ("1.Moz.", "1. Moz.", "tipogrāfija", "Atstarpe starp grāmatas saīsinājumu un nodaļu (21 vieta).", 0.95, True),
    ("1.Kor.", "1. Kor.", "tipogrāfija", "Tas pats 1. Korintiešiem (3 vietas).", 0.95, True),
    ("Jņ.atkl.", "Jņ. atkl.", "tipogrāfija", "„Jņ. atkl.” ar atstarpi (5 vietas).", 0.95, True),
    ("Ap.d.", "Ap. d.", "tipogrāfija", "„Ap. d.” ar atstarpēm (2 vietas).", 0.95, True),
    ("2.Pēt.", "2. Pēt.", "tipogrāfija", "„2. Pēt.” ar atstarpēm.", 0.95, True),
    ("Sal.pam.", "Sal. pam.", "tipogrāfija", "„Sal. pam.” ar atstarpēm (2 vietas).", 0.95, True),
    ("ercenģeļ", "erceņģeļ", "pareizrakstība", "Pareizi „erceņģelis”, nevis „ercenģelis”.", 0.97, True),
]

RANGES = [
    ("20:1-3", "20:1–3"),
    ("12:7-10", "12:7–10"),
    ("20:1-15", "20:1–15"),
]


def chapter_text():
    parts = []
    for path in sorted(CHAPTER.glob("*.md")):
        parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def main():
    text = chapter_text()
    proposals = []
    index = 0

    def add(find, replace, category, note, confidence, all_occurrences):
        nonlocal index
        index += 1
        proposals.append({
            "id": f"h{index:02d}",
            "category": category,
            "confidence": confidence,
            "note": note,
            "edits": [{"find": find, "replace": replace, **({"all": True} if all_occurrences else {})}],
        })

    for item in SPECIFIC:
        find = item[0]
        count = text.count(find)
        if count != 1:
            raise SystemExit(f"specific find occurs {count}x: {find[:50]}")
        add(*item)

    # numeric ranges as one proposal with three edits
    index += 1
    proposals.append({
        "id": f"h{index:02d}",
        "category": "tipogrāfija",
        "confidence": 0.92,
        "note": "Skaitļu intervālos lietojama domuzīme (–), nevis defise.",
        "edits": [{"find": a, "replace": b} for a, b in RANGES],
    })

    for item in SYSTEMATIC:
        find = item[0]
        count = text.count(find)
        if count < 1:
            raise SystemExit(f"systematic find not found: {find}")
        add(*item)

    payload = {
        "round": 2,
        "scope": "the-human-fall",
        "title": "2. nodaļa. Grēkākrišana",
        "created": "2026-10-25",
        "author": "ai",
        "note": "Pirmais priekšlikumu aplis 2. nodaļai. Ietver mehāniskas tipogrāfijas korekcijas visā nodaļā un valodas labojumus pirmajās divās iedaļās; pārējās iedaļas tiks pievienotas nākamajā aplī.",
        "proposals": proposals,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} with {len(proposals)} proposals")


if __name__ == "__main__":
    main()
