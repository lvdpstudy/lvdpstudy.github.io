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
| Introduction (`/lv/dp/introduction/`) | published |
| Part I, Chapter 1 and its 6 sections | published |
| Preface, Charts 1–3, the remaining 12 chapters | placeholder pages |

Placeholder pages say that the translation is not published yet; they exist so the
navigation has the same shape as the English edition.

## Repository layout

```
content/lv/dp/…            Markdown sources — the only files to edit by hand
tools/nav.json             navigation: parts, chapters, sections, titles, URLs
tools/build.mjs            renders content + nav into HTML (no dependencies)
tools/extract.py           one-off .docx → Markdown converter (kept for reference)
tools/check_fidelity.py    compares Markdown word-for-word with the Word source
assets/css/site.css        stylesheet
lv/…, index.html, 404.html generated pages — do not edit by hand
```

## Editing the text

1. Open the Markdown file under `content/lv/dp/`.
2. Edit paragraphs, headings or footnotes (`[^1]` … `[^1]: text`).
3. Rebuild and publish:

```powershell
node tools/build.mjs
git add -A
git commit -m "Update Chapter 1 wording"
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
