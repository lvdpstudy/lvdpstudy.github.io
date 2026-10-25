# Dievišķais Princips — latviešu tulkojums

Latvian translation of *Exposition of the Divine Principle*, published as a static
site with GitHub Pages: **https://lvdpstudy.github.io/lv/**

Page addresses mirror the English edition at `https://principle.study/en/dp/...`
so the translation can later be handed over without rewriting links: every page
here is `/lv/dp/<same-slug>/` where the English original is `/en/dp/<same-slug>/`.
The three chart pages are nested inside their chapters on both sites.

## Status

| Content | State |
| --- | --- |
| Preface | published — transcribed from the OCR of book page 5 |
| Introduction | published |
| Part I, chapters 1–7 (6 + 6 + 5 + 2 + 3 + 4 + 4 sections) | published |
| Part II, introduction and chapters 1–6 (3 + 3 + 3 + 4 + 7 + 4 + 5 sections) | published |
| Charts 1–3 | 3 placeholders — nested under Ch. 3, Part II Ch. 3 and Part II Ch. 4; the diagram pages are missing from the scan set |

That is **75 text pages and 3 placeholders** (78 pages in the navigation).
All 13 chapter files were converted with a word-for-word fidelity check
(`tools/check_fidelity.py`, zero differences per chapter). Five subsection
headings are unnumbered in the Word sources (two in Chapter 2, three in Part II
Chapter 2) and are published as plain headings; two headings are missing entirely
in Part II Chapter 5 section 3 (numbering jumps 3.1.2 → 3.2 and 3.2 → 3.4).

## Repository layout

```
content/lv/dp/…            published Markdown (the original layer — edited only by new conversions)
corrections/               proposals, committee decisions, glossary, frozen manifest, batches
corrections/rounds/        r1/r2 curated rounds, r3-<chapter> mechanical rounds, decisions
corrections/batches/       batch-1.json: the whole-book review batch
tools/nav.json             navigation: parts, chapters, sections, titles, URLs
tools/build.mjs            renders content + corrections into HTML (no dependencies)
tools/corrections.mjs      resolves proposals (literal and regex), applies decisions, diffs
tools/review.mjs           builds the offline review pack (one round or a whole batch)
tools/apply.mjs            stores a review pack export in corrections/
tools/en_structure.py      extracts chapter → section → subsection tree from the reference HTML
tools/fill_chapters.py     converts the remaining chapters and updates tools/nav.json
tools/make_book_proposals.py  rule-based proposals (citations, ranges, quotes) per chapter
tools/make_ch2_proposals.py   curated Chapter 2 proposals
tools/extract.py           .docx → Markdown converter (chapter and single-page modes)
tools/check_fidelity.py    compares Markdown word-for-word with the Word source
assets/css/site.css        stylesheet
assets/js/site.js          drawer, theme, text size, bookmarks, text versions
assets/fonts/              self-hosted Source Sans 3 (SIL Open Font License)
lv/…, index.html, 404.html generated pages — do not edit by hand
review/                    generated review packs (git-ignored)
```

## Design

The layout follows `principle.study`: a dark utility bar (text size, fullscreen,
dark mode), a white header with the gold site title, a table-of-contents drawer
behind the hamburger icon, and reading pages with gold chapter titles, dark
section titles, indented paragraphs, previous/next chevrons and a bookmark rail.

Typography uses Source Sans 3 at the same scale as the reference (48px page
titles, 34px section headings, 28px body text at desktop). Gold is `#bd9f47`,
body text `#212121`, links `#0369a1`. The A−/A+ buttons change **only the reading
text** (`--font-step`), not headings or interface chrome, matching the reference.

Not implemented yet: the teaching toolbar from the reference (slides, dictionary),
search across pages, and a bookmarks page. Red/blue/yellow text colouring was
built and deliberately reverted — it will be regenerated after the grammar rounds,
because the colour map is keyed to paragraph text.

## Review workflow

Corrections live in `corrections/` and are applied at build time; the original
Markdown is never rewritten. A review batch groups one or more rounds so the
committee can decide everything in one pass:

```powershell
node tools/review.mjs --batch batch-1        # → review/all-chapters.html
node tools/apply.mjs <exported-decisions>.json   # store the committee's decisions
node tools/build.mjs                         # apply accepted edits, build diff + changelog
```

The current batch (`corrections/batches/batch-1.json`) contains **14 round files —
81 proposals covering 427 locations**: curated language proposals for Chapters 1
and 2, and rule-based typography proposals for Chapters 3–14 (Bible abbreviation
spacing, verse ranges with en dashes, quote style, `Tādejādi`). Identical rules
from different chapters are shown as one grouped card and decided once; the
export still records a decision per proposal id.

Reading pages with accepted corrections get a *Labotais / Oriģināls /
Salīdzinājums* switch, and every accepted change appears in `/lv/izmainas/`.
The full process — layers, statuses, grouped proposals, batch files and decisions
— is described in [`corrections/README.md`](corrections/README.md).

Rebuild and publish as before:

```powershell
git add -A
git commit -m "Apply review decisions"
git push
```

GitHub Pages serves the `main` branch directly, so the site updates a minute after
the push. There is no CI build; generated HTML is committed.

## Adding or completing content

Chapters are converted from legacy `.doc` files. Convert to `.docx` first, then:

```powershell
python tools/extract.py --docx <chapter>.docx --mode chapter --out-dir content/lv/dp/<slug> --slugs-file <slugs>.json
python tools/check_fidelity.py <chapter>.docx content/lv/dp/<slug>/index.md content/lv/dp/<slug>/*.md
```

`check_fidelity.py` must report `differences=0`; it proves no word was lost.
`tools/fill_chapters.py` does this for all remaining chapters and updates
`tools/nav.json`; unnumbered headings in the source can be marked explicitly with
`--extra-headings`. Single-page texts (Preface, Introduction) live at
`content/lv/dp/<slug>.md`.

The charts still need their diagram images: place the Latvian chart pages under
`content/lv/dp/<chapter>/chart-….md` (or as images) and remove the placeholder by
adding content at the path already listed in `tools/nav.json`.

## Attribution

Original: *Exposition of the Divine Principle*. Latvian translation published for
study purposes.
