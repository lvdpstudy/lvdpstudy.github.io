/**
 * Build the static site from tools/nav.json + content/lv/dp/*.md.
 *
 * Run from the repository root:  node tools/build.mjs
 * Output is generated directly into the repository root so GitHub Pages can
 * serve it from the main branch without any workflow.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  acceptedEdits, blocksToMarkdown, diffChars, loadDecisions, parseBlocks, resolveAll,
} from "./corrections.mjs";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content", "lv", "dp");
const NAV = JSON.parse(readFileSync(join(ROOT, "tools", "nav.json"), "utf8"));
const BASE = NAV.site.base; // "/lv/dp/"
const SITE_TITLE = NAV.site.title;
const ORIGIN = "https://lvdpstudy.github.io";

/* ------------------------------------------------------------------ text */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (value) => value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);

const LATVIAN = { ā: "a", č: "c", ē: "e", ģ: "g", ī: "i", ķ: "k", ļ: "l", ņ: "n", š: "s", ū: "u", ž: "z" };

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[āčēģīķļņšūž]/g, (c) => LATVIAN[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headingId(text, used) {
  const numbered = /^(\d+(?:\.\d+)*)\.\s/.exec(text);
  let id = numbered ? "s" + numbered[1].replace(/\./g, "-") : slugify(text).slice(0, 60) || "sadaļa";
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}-${n++}`;
  used.add(candidate);
  return candidate;
}

/* ----------------------------------------------------------------- icons */

const ICONS = {
  menu: "M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z",
  search: "M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z",
  close: "M256-200l-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
  home: "M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Z",
  chevronLeft: "M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z",
  chevronRight: "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
  bookmark: "M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Zm80-122 200-86 200 86v-518H280v518Zm0-518h400-400Z",
  expand: "M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z",
  moon: "M481-140q-142 0-241-99t-99-241q0-142 99-241t241-99q11 0 21 .5t20 2.5q-32 35-49.5 78.5T455-480q0 92 33.5 172T583-172q-24 16-50 24t-52 8Z",
};

const icon = (name, size = 24) =>
  `<svg viewBox="0 -960 960 960" width="${size}" height="${size}" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

/* -------------------------------------------------------------- markdown */

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const definitions = new Map();
  for (const line of lines) {
    const match = /^\[\^(\d+)\]:\s*(.*)$/.exec(line);
    if (match) definitions.set(match[1], match[2].trim());
  }

  const blocks = [];
  const headings = [];
  const used = new Set();
  let paragraph = [];

  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\[\^\d+\]:/.test(line)) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = headingId(text, used);
      headings.push({ level, text, id });
      blocks.push({ type: "h", level, text, id });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();

  const footnoteNumbers = new Map();
  const order = [];
  const noteRef = (source) => {
    if (!definitions.has(source)) return null;
    if (!footnoteNumbers.has(source)) {
      order.push(source);
      footnoteNumbers.set(source, order.length);
    }
    const number = footnoteNumbers.get(source);
    return `<sup class="fn"><a href="#fn-${number}" id="fnref-${number}">${number}</a></sup>`;
  };

  const inline = (text) => {
    let html = "";
    let emphasis = null;
    let index = 0;
    while (index < text.length) {
      if (text.startsWith("[^", index)) {
        const match = /^\[\^(\d+)\]/.exec(text.slice(index));
        if (match) {
          const ref = noteRef(match[1]);
          if (ref) {
            html += ref;
            index += match[0].length;
            continue;
          }
        }
      }
      if (text.startsWith("**", index)) {
        html += emphasis === "strong" ? "</strong>" : "<strong>";
        emphasis = emphasis === "strong" ? null : "strong";
        index += 2;
        continue;
      }
      if (text[index] === "*") {
        html += emphasis === "em" ? "</em>" : "<em>";
        emphasis = emphasis === "em" ? null : "em";
        index += 1;
        continue;
      }
      let end = index;
      while (end < text.length && text[end] !== "*" && !text.startsWith("[^", end)) end += 1;
      html += escapeHtml(text.slice(index, end));
      index = end;
    }
    if (emphasis === "strong") html += "</strong>";
    if (emphasis === "em") html += "</em>";
    return html;
  };

  let html = "";
  for (const block of blocks) {
    if (block.type === "h") {
      html += `<h${block.level} id="${block.id}">${inline(block.text)}</h${block.level}>\n`;
    } else {
      html += `<p>${inline(block.text)}</p>\n`;
    }
  }

  if (order.length) {
    html += `<section class="notes">\n<p class="notes-title">Piezīmes</p>\n<ol class="notes-list">\n`;
    for (const source of order) {
      const number = footnoteNumbers.get(source);
      html += `<li id="fn-${number}">${inline(definitions.get(source))} `
        + `<a class="fn-back" href="#fnref-${number}" aria-label="Atgriezties pie teksta">↩</a></li>\n`;
    }
    html += `</ol>\n</section>\n`;
  }

  return { html, headings };
}

/* ------------------------------------------------------------------ pages */

const pages = [];
for (const part of NAV.parts) {
  for (const item of part.pages) {
    if (Array.isArray(item.sections)) {
      pages.push({
        type: "chapter", slug: item.slug, title: item.title, part,
        url: `${BASE}${item.slug}/`,
        mdPath: join(CONTENT, item.slug, "index.md"),
      });
      for (const section of item.sections) {
        pages.push({
          type: "section", slug: section.slug, title: section.title, part,
          chapter: item, url: `${BASE}${item.slug}/${section.slug}/`,
          mdPath: join(CONTENT, item.slug, `${section.slug}.md`),
        });
      }
    } else {
      pages.push({
        type: item.type === "chart" ? "chart" : "page", slug: item.slug,
        title: item.title, part, url: `${BASE}${item.slug}/`,
        mdPath: join(CONTENT, `${item.slug}.md`),
      });
    }
  }
}

const byUrl = new Map(pages.map((page) => [page.url, page]));

const PLACEHOLDER = {
  chapter: "Šīs nodaļas tulkojums vēl nav publicēts.",
  chart: "Šīs shēmas tulkojums vēl nav publicēts.",
  page: "Šīs daļas tulkojums vēl nav publicēts.",
  section: "Šīs iedaļas tulkojums vēl nav publicēts.",
};

/* ---------------------------------------------------------- corrections */

const correctionState = acceptedEdits(NAV);
const correctionsBySlug = correctionState.perPage;
if (correctionState.conflicts.length) {
  console.warn("Reviewer conflicts (later file wins):");
  for (const conflict of correctionState.conflicts) {
    console.warn(`  ${conflict.id}: ${conflict.previous} vs ${conflict.next} (${conflict.file})`);
  }
}

function noteMap(blocks) {
  const map = new Map();
  let number = 1;
  for (const block of blocks) {
    const match = /^\[\^(\d+)\]:/.exec(block.text);
    if (match) map.set(match[1], number++);
  }
  return map;
}

function inlineText(text, notes) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/\[\^(\d+)\]/g, (whole, id) =>
    (notes.has(id) ? `<sup class="fn"><a href="#fn-${notes.get(id)}">${notes.get(id)}</a></sup>` : whole));
  return html;
}

function diffTokensHtml(before, after) {
  return diffChars(before, after)
    .map((token) => {
      if (token.type === "eq") return escapeHtml(token.text);
      if (token.type === "del") return `<del>${escapeHtml(token.text)}</del>`;
      return `<ins>${escapeHtml(token.text)}</ins>`;
    })
    .join("");
}

function diffArticle(originalBlocks, correctedBlocks) {
  const notes = noteMap(originalBlocks);
  let html = "";
  for (let index = 0; index < originalBlocks.length; index += 1) {
    const before = originalBlocks[index];
    const after = correctedBlocks[index];
    if (before.kind === "blank") continue;
    if (before.kind === "h") {
      const hashes = /^#+/.exec(before.text)[0];
      const level = Math.min(6, hashes.length);
      if (level === 1) continue; // page title is rendered by the layout
      const beforeText = before.text.replace(/^#+\s*/, "");
      const afterText = after.text.replace(/^#+\s*/, "");
      const body = beforeText === afterText ? inlineText(beforeText, notes) : diffTokensHtml(beforeText, afterText);
      html += `<h${level}>${body}</h${level}>\n`;
      continue;
    }
    const changed = before.text !== after.text;
    const body = changed ? diffTokensHtml(before.text, after.text) : inlineText(before.text, notes);
    html += `<p class="diff-p${changed ? " changed" : ""}">${body}</p>\n`;
  }
  return html;
}

function variantBar() {
  return `<div class="variant-bar" role="group" aria-label="Teksta versija">
  <span class="variant-label">Teksts</span>
  <button class="variant-btn is-active" data-variant="current" aria-pressed="true">Labotais</button>
  <button class="variant-btn" data-variant="original" aria-pressed="false">Oriģināls</button>
  <button class="variant-btn" data-variant="diff" aria-pressed="false">Salīdzinājums</button>
  <a class="variant-link" href="/lv/izmainas/">Kas mainīts?</a>
</div>`;
}

/* --------------------------------------------------------------- drawer */

function drawerNav(activeUrl) {
  const link = (page, label, extra = "") => {
    const active = page.url === activeUrl;
    const current = active ? ' aria-current="page"' : "";
    const classes = [extra, active ? "active" : ""].filter(Boolean).join(" ");
    const cls = classes ? ` class="${classes}"` : "";
    return `<li><a${cls} href="${page.url}"${current}>${escapeHtml(label)}</a>`;
  };

  let html = '<nav class="drawer-nav" aria-label="Satura rādītājs">\n';
  for (const part of NAV.parts) {
    html += '<div class="drawer-part">\n';
    if (part.title) html += `<p class="toc-part">${escapeHtml(part.title)}</p>\n`;
    html += '<ul class="toc-list">\n';
    for (const item of part.pages) {
      if (Array.isArray(item.sections)) {
        const chapterPage = byUrl.get(`${BASE}${item.slug}/`);
        const expanded = pages.some((p) => p.type === "section" && p.chapter === item && p.url === activeUrl);
        html += `<li><details${expanded ? " open" : ""}><summary class="chapter-link">${escapeHtml(item.title)}</summary>\n`;
        html += '<ul class="drawer-sub">\n';
        html += link(chapterPage, "Nodaļas sākums");
        html += "</li>\n";
        for (const section of item.sections) {
          html += link(byUrl.get(`${BASE}${item.slug}/${section.slug}/`), section.title);
          html += "</li>\n";
        }
        html += "</ul>\n</details></li>\n";
      } else {
        html += link(byUrl.get(`${BASE}${item.slug}/`), item.title);
        html += "</li>\n";
      }
    }
    html += "</ul>\n</div>\n";
  }
  html += `<div class="drawer-bookmarks" hidden>\n<p class="toc-part">Grāmatzīmes</p>\n`
    + `<ul class="bookmark-list"></ul>\n</div>\n`;
  html += "</nav>";
  return html;
}

/* ----------------------------------------------------------- page shell */

function head({ title, description, canonical, activeUrl = null }) {
  return `<!DOCTYPE html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<link rel="preload" href="/assets/fonts/source-sans-3-latin-ext.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<a class="skip" href="#content">Pāriet uz saturu</a>
<div class="topbar">
  <div class="topbar-inner">
    <button class="font-btn" data-font="down" aria-label="Mazāks teksts">A−</button>
    <button class="font-btn" data-font="up" aria-label="Lielāks teksts">A+</button>
    <button data-action="fullscreen" aria-label="Pilnekrāns">${icon("expand", 18)}</button>
    <button data-action="theme" aria-label="Tumšais režīms" aria-pressed="false">${icon("moon", 18)}</button>
    <span class="lang">Latviešu</span>
  </div>
</div>
<header class="site-header">
  <div class="header-inner">
    <button class="icon-btn" data-action="menu" aria-label="Satura rādītājs" aria-expanded="false" aria-controls="drawer">${icon("menu")}</button>
    <a class="brand" href="/lv/">${SITE_TITLE}</a>
    <div class="end"><button class="icon-btn" data-action="search" aria-label="Meklēt saturā">${icon("search")}</button></div>
  </div>
</header>
<div class="overlay" data-action="close"></div>
<aside class="drawer" id="drawer" aria-label="Satura rādītājs" aria-hidden="true">
  <div class="drawer-head">
    <span class="drawer-title">${SITE_TITLE}</span>
    <button class="icon-btn" data-action="close" aria-label="Aizvērt">${icon("close")}</button>
  </div>
  <div class="drawer-filter"><input type="search" id="toc-filter" placeholder="Meklēt saturā…" aria-label="Meklēt saturā"></div>
  ${drawerNav(activeUrl)}
</aside>
`;
}

function footer() {
  return `<footer class="site-footer">
  <p>Oriģināls: <em>Exposition of the Divine Principle</em>. Latviešu tulkojums publicēts studiju nolūkiem.</p>
  <p>Original: <em>Exposition of the Divine Principle</em>. Latvian translation published for study purposes.</p>
  <p><a href="/lv/izmainas/">Labojumu žurnāls</a> · <a href="/lv/">Satura rādītājs</a></p>
</footer>
<script src="/assets/js/site.js" defer></script>
</body>
</html>
`;
}

function breadcrumb(page) {
  const crumbs = [`<a class="home" href="/lv/" aria-label="Sākums">${icon("home", 18)}</a>`];
  if (page.type === "section") {
    const chapterPage = byUrl.get(`${BASE}${page.chapter.slug}/`);
    crumbs.push(`<a href="${chapterPage.url}">${escapeHtml(chapterPage.title)}</a>`);
    crumbs.push(`<span class="current">${escapeHtml(page.title)}</span>`);
  } else {
    crumbs.push(`<span class="current">${escapeHtml(page.title)}</span>`);
  }
  return `<nav class="breadcrumb" aria-label="Atrašanās vieta">${crumbs.join('<span class="sep">›</span>')}</nav>`;
}

function pageHead(page, titleText) {
  if (page.type === "chapter") {
    const match = /^(\d+\.\s*nodaļa\.)\s*(.+)$/i.exec(titleText);
    if (match) {
      return `<div class="page-head"><p class="eyebrow">${escapeHtml(match[1])}</p>`
        + `<h1 class="page-title">${escapeHtml(match[2])}</h1></div>`;
    }
  }
  return `<div class="page-head"><h1 class="page-title is-dark">${escapeHtml(titleText)}</h1></div>`;
}

function sectionToc(page) {
  const sections = pages.filter((p) => p.type === "section" && p.chapter && p.chapter.slug === page.slug);
  if (!sections.length) return "";
  let html = '<nav class="section-toc" aria-label="Satura rādītājs"><p class="toc-label">Satura rādītājs</p>';
  for (const section of sections) {
    html += `<div class="toc-section"><a class="toc-section-title" href="${section.url}">${escapeHtml(section.title)}</a>`;
    if (existsSync(section.mdPath)) {
      const subs = renderMarkdown(readFileSync(section.mdPath, "utf8")).headings
        .filter((heading) => heading.level === 2);
      if (subs.length) {
        html += '<ul class="toc-sub">';
        for (const sub of subs) {
          html += `<li><a href="${section.url}#${sub.id}">${escapeHtml(sub.text)}</a></li>`;
        }
        html += "</ul>";
      }
    }
    html += "</div>";
  }
  return html + "</nav>";
}

function writePage(url, html) {
  const target = join(ROOT, url.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, "utf8");
}

/* -------------------------------------------------------------- rendering */

rmSync(join(ROOT, "lv"), { recursive: true, force: true });
writeFileSync(join(ROOT, ".nojekyll"), "");

let built = 0;
let placeholders = 0;

for (const page of pages) {
  const exists = existsSync(page.mdPath);
  const markdown = exists ? readFileSync(page.mdPath, "utf8") : "";
  const rendered = exists ? renderMarkdown(markdown) : { html: "", headings: [] };
  const firstHeading = rendered.headings.find((heading) => heading.level === 1);
  let titleText = firstHeading ? firstHeading.text : page.title;

  let article = "";
  let description = PLACEHOLDER[page.type] || PLACEHOLDER.page;
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];

  if (exists) {
    const edits = correctionsBySlug.get(page.slug);
    let markdownForText = markdown;

    if (edits && edits.size) {
      const originalBlocks = parseBlocks(markdown);
      const correctedBlocks = originalBlocks.map((block, blockIndex) =>
        (edits.has(blockIndex) ? { ...block, text: edits.get(blockIndex) } : block));
      markdownForText = blocksToMarkdown(correctedBlocks);
      const corrected = renderMarkdown(markdownForText);
      const correctedHeading = corrected.headings.find((heading) => heading.level === 1);
      if (correctedHeading) titleText = correctedHeading.text;

      const currentHtml = corrected.html.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "");
      const originalHtml = rendered.html.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "");
      const diffHtml = `<p class="diff-legend">Salīdzinājums: <span class="lg-ins">zaļš — labotais</span> ·
        <span class="lg-del">svītrots — oriģinālais</span></p>` + diffArticle(originalBlocks, correctedBlocks);
      article = variantBar()
        + `<div class="variant" data-variant-panel="current">${currentHtml}</div>`
        + `<div class="variant" data-variant-panel="original" hidden>${originalHtml}</div>`
        + `<div class="variant" data-variant-panel="diff" hidden>${diffHtml}</div>`;
    } else {
      // The page title is rendered by the layout, so drop the first heading.
      article = rendered.html.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "");
    }

    description = markdownForText
      .split("\n")
      .find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("[^"))
      ?.replace(/[*_`]/g, "")
      .replace(/\[\^\d+\]/g, "")
      .slice(0, 200) || description;
    built += 1;
  } else {
    article = `<div class="placeholder"><p>${description}</p><p>Tulkojums tiek sagatavots.</p>`
      + `<p><a href="/lv/">Atgriezties uz saturu</a></p></div>`;
    placeholders += 1;
  }

  const toc = page.type === "chapter" && exists ? sectionToc(page) : "";

  const pager = `<nav class="mobile-pager" aria-label="Lapas navigācija">${
    previous ? `<a class="prev" href="${previous.url}"><span>Iepriekšējā</span>${escapeHtml(previous.title)}</a>` : "<span></span>"
  }${
    next ? `<a class="next" href="${next.url}"><span>Nākamā</span>${escapeHtml(next.title)}</a>` : "<span></span>"
  }</nav>`;

  const chevrons = `${
    previous ? `<a class="page-chevron prev" href="${previous.url}" aria-label="Iepriekšējā: ${escapeHtml(previous.title)}">${icon("chevronLeft", 34)}</a>` : ""
  }${
    next ? `<a class="page-chevron next" href="${next.url}" aria-label="Nākamā: ${escapeHtml(next.title)}">${icon("chevronRight", 34)}</a>` : ""
  }`;

  const rail = `<aside class="side-rail">
  <button class="rail-btn" data-bookmark="${page.url}" data-title="${escapeHtml(titleText)}" aria-pressed="false" aria-label="Pievienot grāmatzīmēm">${icon("bookmark", 22)}</button>
  <button class="rail-tab" data-action="menu">Saturs</button>
</aside>`;

  const body = head({
    title: `${titleText} — ${SITE_TITLE}`,
    description,
    canonical: `${ORIGIN}${page.url}`,
    activeUrl: page.url,
  }) + `<main id="content">
<div class="container">
${breadcrumb(page)}
${pageHead(page, titleText)}
<article>
${article}
</article>
${toc}
${pager}
</div>
</main>
${chevrons}
${rail}
${footer()}`;

  writePage(page.url, body);
}

/* ------------------------------------------------------------- changelog */

function diffSnippet(before, after) {
  const tokens = diffChars(before, after);
  const first = tokens.findIndex((token) => token.type !== "eq");
  if (first < 0) return "";
  const start = Math.max(0, first - 8);
  const end = Math.min(tokens.length, first + 24);
  const body = tokens.slice(start, end).map((token) => {
    if (token.type === "eq") return escapeHtml(token.text);
    if (token.type === "del") return `<del>${escapeHtml(token.text)}</del>`;
    return `<ins>${escapeHtml(token.text)}</ins>`;
  }).join("");
  return `${start > 0 ? "… " : ""}${body}${end < tokens.length ? " …" : ""}`;
}

function buildChangelog() {
  const rounds = resolveAll(NAV);
  const decisions = new Map();
  for (const item of loadDecisions()) {
    for (const decision of item.data.decisions || []) decisions.set(decision.id, decision);
  }
  let accepted = 0;
  let rejected = 0;
  let pending = 0;
  const sections = [];

  for (const round of rounds) {
    const rows = [];
    for (const proposal of round.resolved) {
      const decision = decisions.get(proposal.id);
      const status = decision ? decision.status : "proposed";
      if (status === "rejected") { rejected += 1; continue; }
      if (status !== "accepted") { pending += 1; continue; }
      accepted += 1;
      const edits = proposal.edits;
      const first = edits[0];
      const target = pages.find((entry) => entry.slug === first.page);
      if (!target) continue;
      const more = edits.length > 1
        ? `<details class="change-more"><summary>Vēl ${edits.length - 1} vietas</summary><ul>${
          edits.slice(1).map((edit) => `<li>${diffSnippet(edit.original, edit.corrected)}</li>`).join("")
        }</ul></details>`
        : "";
      rows.push(`<li class="change">
  <p class="change-meta"><a href="${target.url}">${escapeHtml(target.title)}</a>
    <span class="tag">${escapeHtml(proposal.category)}</span></p>
  <p class="change-note">${escapeHtml(proposal.note)}</p>
  <p class="change-diff">${diffSnippet(first.original, first.corrected)}</p>
  ${more}
</li>`);
    }
    if (rows.length) {
      sections.push(`<section class="round">
<h2>${round.round}. aplis — ${escapeHtml(round.title || round.scope)}</h2>
<ul class="changes">
${rows.join("\n")}
</ul>
</section>`);
    }
  }

  const empty = `<p class="empty">Pagaidām neviens labojums nav publicēts — teksts ir oriģinālajā versijā.</p>`;
  const article = `<article class="changelog">
<h1>Labojumu žurnāls</h1>
<p class="lead">Katrs priekšlikums tiek fiksēts atsevišķi. Publicētajā tekstā nonāk tikai tie labojumi,
kuriem recenzenti un atbildīgais redaktors devuši piekrišanu; oriģināls vienmēr paliek pieejams.</p>
<p class="changelog-stats"><strong>${accepted}</strong> pieņemti priekšlikumi ·
<strong>${rejected}</strong> noraidīti · <strong>${pending}</strong> gaida lēmumu</p>
${sections.join("\n") || empty}
</article>`;

  const html = head({
    title: `Labojumu žurnāls — ${SITE_TITLE}`,
    description: "Pieņemto labojumu saraksts ar pirms/ pēc salīdzinājumu.",
    canonical: `${ORIGIN}/lv/izmainas/`,
    activeUrl: null,
  }) + `<main id="content"><div class="container">
<nav class="breadcrumb" aria-label="Atrašanās vieta"><a class="home" href="/lv/" aria-label="Sākums">${icon("home", 18)}</a><span class="sep">›</span><span class="current">Labojumu žurnāls</span></nav>
${article}
</div></main>
${footer()}`;
  writePage("/lv/izmainas/", html);
  return { accepted, rejected, pending };
}

const changelogStats = buildChangelog();

/* ---------------------------------------------------------------- home */

function homeBody() {
  const front = NAV.parts.find((part) => !part.title);
  let html = `<h1 class="home-title">${SITE_TITLE}</h1>`;

  if (front) {
    html += '<ul class="home-list home-front">';
    for (const item of front.pages) {
      const page = byUrl.get(`${BASE}${item.slug}/`);
      const pending = existsSync(page.mdPath) ? "" : '<span class="pending">tulkojums tiek sagatavots</span>';
      html += `<li><a href="${page.url}">${escapeHtml(item.title)}</a>${pending}</li>`;
    }
    html += "</ul>";
  }

  for (const part of NAV.parts) {
    if (!part.title) continue;
    html += `<p class="home-part">${escapeHtml(part.title)}</p><ul class="home-list">`;
    for (const item of part.pages) {
      const page = byUrl.get(`${BASE}${item.slug}/`);
      const ready = existsSync(page.mdPath);
      if (Array.isArray(item.sections) && ready) {
        html += `<li><details><summary>${escapeHtml(item.title)}</summary><ul class="home-sub">`;
        for (const section of item.sections) {
          const sectionPage = byUrl.get(`${BASE}${item.slug}/${section.slug}/`);
          html += `<li><a href="${sectionPage.url}">${escapeHtml(section.title)}</a></li>`;
        }
        html += "</ul></details></li>";
      } else {
        html += `<li><a href="${page.url}">${escapeHtml(item.title)}</a>`;
        if (!ready) html += '<span class="pending">tulkojums tiek sagatavots</span>';
        html += "</li>";
      }
    }
    html += "</ul>";
  }
  return html;
}

const home = head({
  title: `${SITE_TITLE} — latviešu tulkojums`,
  description: "Dievišķā Principija latviešu tulkojums — pa daļām, nodaļām un iedaļām.",
  canonical: `${ORIGIN}/lv/`,
  activeUrl: "/lv/",
}) + `<main id="content"><div class="container">
${homeBody()}
</div></main>
${footer()}`;
writePage("/lv/", home);

writeFileSync(join(ROOT, "index.html"), `<!DOCTYPE html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=/lv/">
<link rel="canonical" href="${ORIGIN}/lv/">
<title>${SITE_TITLE}</title>
</head>
<body>
<p><a href="/lv/">${SITE_TITLE}</a></p>
</body>
</html>
`);

const notFound = head({
  title: `Lapa nav atrasta — ${SITE_TITLE}`,
  description: "Lapa nav atrasta.",
  canonical: `${ORIGIN}/404.html`,
  activeUrl: null,
}) + `<main id="content"><div class="container">
<h1 class="page-title">Lapa nav atrasta</h1>
<div class="placeholder"><p>Šāda lapa šajā vietnē neeksistē.</p><p><a href="/lv/">Atgriezties uz saturu</a></p></div>
</div></main>
${footer()}`;
writeFileSync(join(ROOT, "404.html"), notFound);

console.log(`pages built: ${built}, placeholders: ${placeholders}, total: ${pages.length}`);
