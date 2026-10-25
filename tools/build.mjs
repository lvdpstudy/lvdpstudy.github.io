/**
 * Build the static site from tools/nav.json + content/lv/dp/*.md.
 *
 * Run from the repository root:  node tools/build.mjs
 * Output is generated directly into the repository root so GitHub Pages can
 * serve it from the main branch without any workflow.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content", "lv", "dp");
const NAV = JSON.parse(readFileSync(join(ROOT, "tools", "nav.json"), "utf8"));
const BASE = NAV.site.base; // "/lv/dp/"
const SITE_TITLE = NAV.site.title;
const TAGLINE = NAV.site.tagline;
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
    html += `<section class="notes">\n<h2 class="notes-title">Piezīmes</h2>\n<ol class="notes-list">\n`;
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

function sidebar(activeUrl) {
  const link = (page, label, extra = "") => {
    const active = page.url === activeUrl;
    const current = active ? ' aria-current="page"' : "";
    const classes = [extra, active ? "active" : ""].filter(Boolean).join(" ");
    const cls = classes ? ` class="${classes}"` : "";
    return `<li><a${cls} href="${page.url}"${current}>${escapeHtml(label)}</a>`;
  };

  let html = '<nav class="toc" aria-label="Satura rādītājs">\n';
  for (const part of NAV.parts) {
    if (part.title) html += `<p class="toc-part">${escapeHtml(part.title)}</p>`;
    html += '<ul class="toc-list">\n';
    for (const item of part.pages) {
      if (Array.isArray(item.sections)) {
        const chapterPage = byUrl.get(`${BASE}${item.slug}/`);
        const expanded = chapterPage.url === activeUrl
          || pages.some((p) => p.type === "section" && p.chapter === item && p.url === activeUrl);
        html += link(chapterPage, item.title, "toc-chapter");
        if (expanded) {
          html += '\n<ul class="toc-sections">\n';
          for (const section of item.sections) {
            const sectionPage = byUrl.get(`${BASE}${item.slug}/${section.slug}/`);
            html += link(sectionPage, section.title);
            html += "</li>\n";
          }
          html += "</ul>\n";
        }
        html += "</li>\n";
      } else {
        html += link(byUrl.get(`${BASE}${item.slug}/`), item.title);
        html += "</li>\n";
      }
    }
    html += "</ul>\n";
  }
  html += "</nav>";
  return html;
}

function breadcrumb(page) {
  const crumbs = [`<a href="/lv/">Sākums</a>`];
  if (page.part && page.part.title) crumbs.push(escapeHtml(page.part.title));
  if (page.type === "section") {
    const chapterPage = byUrl.get(`${BASE}${page.chapter.slug}/`);
    crumbs.push(`<a href="${chapterPage.url}">${escapeHtml(page.chapter.title)}</a>`);
  }
  crumbs.push(`<span>${escapeHtml(page.title)}</span>`);
  return `<nav class="breadcrumb" aria-label="Atrašanās vieta">${crumbs.join(" <span>/</span> ")}</nav>`;
}

function pager(page) {
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  if (!previous && !next) return "";
  let html = '<nav class="pager" aria-label="Lapas navigācija">';
  html += previous
    ? `<a class="pager-prev" href="${previous.url}"><span>Iepriekšējā</span>${escapeHtml(previous.title)}</a>`
    : "<span></span>";
  html += next
    ? `<a class="pager-next" href="${next.url}"><span>Nākamā</span>${escapeHtml(next.title)}</a>`
    : "<span></span>";
  return html + "</nav>";
}

function shell({ title, description, content, page, bodyClass = "" }) {
  const fullTitle = page ? `${escapeHtml(title)} — ${SITE_TITLE}` : `${SITE_TITLE} — ${TAGLINE}`;
  const desc = description ? escapeHtml(description.slice(0, 180)) : "Dievišķā Principija latviešu tulkojums.";
  const canonical = page ? `${ORIGIN}${page.url}` : `${ORIGIN}/lv/`;
  return `<!DOCTYPE html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<a class="skip" href="#content">Pāriet uz saturu</a>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/lv/">${SITE_TITLE}</a>
    <span class="tagline">${TAGLINE}</span>
  </div>
</header>
<div class="layout">
<aside class="sidebar">
${sidebar(page ? page.url : null)}
</aside>
<main id="content">
${page ? breadcrumb(page) : ""}
${content}
${page ? pager(page) : ""}
</main>
</div>
<footer class="site-footer">
  <p>Oriģināls: <em>Exposition of the Divine Principle</em>. Latviešu tulkojums publicēts studiju nolūkiem.</p>
  <p class="footer-en">Original: <em>Exposition of the Divine Principle</em>. Latvian translation published for study purposes.</p>
</footer>
</body>
</html>
`;
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

  let article = "";
  let description = "";

  if (exists) {
    const firstParagraph = rendered.headings.length
      ? (markdown.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("[^")) || "")
      : "";
    description = firstParagraph.replace(/\*\*/g, "").replace(/\[\^\d+\]/g, "").trim();
    article = rendered.html;

    const subsections = rendered.headings.filter((h) => h.level === 2);
    if (page.type === "section" && subsections.length >= 3) {
      let toc = '<nav class="page-toc" aria-label="Šīs iedaļas saturs"><p>Šajā iedaļā</p><ul>';
      for (const heading of subsections) {
        toc += `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`;
      }
      article = toc + "</ul></nav>\n" + article;
    }
    built += 1;
  } else {
    placeholders += 1;
    article = `<article class="placeholder">
<h1>${escapeHtml(page.title)}</h1>
<p>${PLACEHOLDER[page.type] || PLACEHOLDER.page}</p>
<p class="placeholder-note">Tulkojums tiek sagatavots.</p>
</article>`;
    description = PLACEHOLDER[page.type] || PLACEHOLDER.page;
  }

  if (page.type === "chapter" && exists) {
    const sections = pages.filter((p) => p.type === "section" && p.chapter && p.chapter.slug === page.slug);
    if (sections.length) {
      let list = '<nav class="chapter-sections" aria-label="Nodaļas iedaļas"><h2>Šajā nodaļā</h2><ol>';
      for (const section of sections) {
        list += `<li><a href="${section.url}">${escapeHtml(section.title)}</a></li>`;
      }
      article += list + "</ol></nav>\n";
    }
  }

  writePage(page.url, shell({ title: page.title, description, content: article, page }));
}

/* ---------------------------------------------------------------- home */

const homeParts = NAV.parts
  .map((part) => {
    let html = part.title ? `<h2>${escapeHtml(part.title)}</h2>` : "<h2>Ievads</h2>";
    html += "<ul class=\"home-list\">";
    for (const item of part.pages) {
      const page = byUrl.get(`${BASE}${item.slug}/`);
      const status = existsSync(page.mdPath) ? "" : ' <span class="pending">tulkojums tiek sagatavots</span>';
      html += `<li><a href="${page.url}">${escapeHtml(item.title)}</a>${status}</li>`;
    }
    return html + "</ul>";
  })
  .join("\n");

const home = shell({
  title: SITE_TITLE,
  description: "Dievišķā Principija latviešu tulkojums.",
  content: `<article class="home">
<h1>${SITE_TITLE}</h1>
<p class="lead">${TAGLINE}. Šeit publicēts <em>Dievišķā Principija</em> latviešu tulkojums — pa daļām, nodaļām un iedaļām, tāpat kā oriģinālajā izdevumā.</p>
${homeParts}
</article>`,
  page: null,
});
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

writeFileSync(join(ROOT, "404.html"), shell({
  title: "Lapa nav atrasta",
  description: "Lapa nav atrasta.",
  content: `<article class="placeholder">
<h1>Lapa nav atrasta</h1>
<p>Šāda lapa šajā vietnē neeksistē.</p>
<p class="placeholder-note"><a href="/lv/">Atgriezties uz sākumu</a></p>
</article>`,
  page: null,
}));

console.log(`pages built: ${built}, placeholders: ${placeholders}, total: ${pages.length}`);
