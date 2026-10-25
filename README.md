# Dievišķais Princips — latviešu tulkojums

Latvian translation of *Exposition of the Divine Principle*, published as a static
site with GitHub Pages: **https://lvdpstudy.github.io/lv/**

The layout deliberately mirrors the page addresses of the English edition at
`https://principle.study/en/dp/...` so the translation can later be handed over
without rewriting any links: every page here is `/lv/dp/<same-slug>/` where the
English original is `/en/dp/<same-slug>/`.

## Status

| Content | State |
| --- | --- |
| Preface | placeholder — no Word source |
| Introduction | published |
| Part I, chapters 1–7 (6 + 6 + 5 + 2 + 3 + 4 + 4 sections) | published |
| Part II, introduction and chapters 1–6 (3 + 3 + 3 + 4 + 7 + 4 + 5 sections) | published |
| Charts 1–3 | placeholders — pages missing from the scan set |

All 13 chapter files were converted with a word-for-word fidelity check
(`tools/check_fidelity.py`, zero differences per chapter). Five subsection
headings are unnumbered in the Word sources (two in Chapter 2, three in Part II
Chapter 2) and are published as plain headings; two headings are missing entirely
in Part II Chapter 5 section 3 (numbering jumps 3.1.2 → 3.2 and 3.2 → 3.4).

## Repository layout

```
content/lv/dp/…            frozen original Markdown (tag original-1) — do not edit
corrections/               proposals, committee decisions, glossary, frozen manifest
tools/nav.json             navigation: parts, chapters, sections, titles, URLs
tools/build.mjs            renders content + corrections into HTML (no dependencies)
tools/corrections.mjs      resolves proposals, applies decisions, word/char diffs
tools/review.mjs           builds the offline review pack for one round
tools/apply.mjs            merges a review pack export into corrections/
tools/extract.py           one-off .docx → Markdown converter (kept for reference)
tools/check_fidelity.py    compares Markdown word-for-word with the Word source
assets/css/site.css        stylesheet
assets/js/site.js          drawer, theme, font size, bookmarks, text versions
assets/fonts/              self-hosted Source Sans 3 (SIL Open Font License)
lv/…, index.html, 404.html generated pages — do not edit by hand
```

## Design

The layout follows `principle.study`: a dark utility bar (text size, fullscreen,
dark mode), a white header with the gold site title, a table-of-contents drawer
behind the hamburger icon, and reading pages with gold chapter titles, dark
section titles, indented paragraphs, previous/next chevrons and a bookmark rail.

Typography uses Source Sans 3 at the same scale as the reference (48px page
titles, 34px section headings, 28px body text at desktop). Gold is `#bd9f47`,
body text `#212121`, links `#0369a1`.

Not implemented yet, because they belong to later steps: the teaching toolbar
from the reference (slides, dictionary, Red/Blue/Yellow text colouring), search
across pages, and a bookmarks page (bookmarked pages are stored in the browser
and listed in the drawer).

## Editing the text

Chapter 1 is frozen as the original (tag `original-1`, hashes in
`corrections/FROZEN.md`). From now on `content/lv/dp/` is never edited directly.
Corrections live in `corrections/` and are applied at build time:

```powershell
node tools/review.mjs r1-principle-of-creation   # build review/r1-….html for the committee
node tools/apply.mjs <exported-decisions>.json  # store the returned decisions
node tools/build.mjs                            # apply accepted edits, build diff + changelog
```

Reading pages with accepted corrections get a *Labotais / Oriģināls / Salīdzinājums*
switch, and every accepted change appears in `/lv/izmainas/`. The full workflow is
described in [`corrections/README.md`](corrections/README.md).

Rebuild and publish as before:

```powershell
git add -A
git commit -m "Apply review round 1"
git push
```

GitHub Pages serves the `main` branch directly, so the site updates a minute after
the push. There is no CI build; generated HTML is committed.

## Adding a chapter that is still in Word

The source texts are legacy `.doc` files. Convert one to `.docx` first (LibreOffice),
then:

```powershell
python tools/extract.py --docx <chapter>.docx --mode chapter --out-dir content/lv/dp/<slug> --slugs-file <slugs>.json
python tools/check_fidelity.py <chapter>.docx content/lv/dp/<slug>/index.md content/lv/dp/<slug>/*.md
```

`check_fidelity.py` must report `differences=0`; it proves that no word was lost in
the conversion. Add the slugs and titles to `tools/nav.json`, rebuild, and the
placeholder page is replaced by the real text.

## Attribution

Original: *Exposition of the Divine Principle*. Latvian translation published for
study purposes.
