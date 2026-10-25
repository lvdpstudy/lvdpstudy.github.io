/**
 * Corrections layer: resolve proposals, apply decisions, diff paragraphs.
 *
 * The original Markdown is never edited. A proposal names a literal `find`
 * string and its `replace`; resolution locates the paragraph(s) containing it
 * and records the exact paragraph text plus a stable hash, so decisions can be
 * verified later.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CORRECTIONS = "corrections";

export function hashText(text) {
  return createHash("sha1").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 10);
}

/** Split Markdown into blocks that can be edited without touching structure. */
export function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      blocks.push({ kind: "blank", text: "" });
      continue;
    }
    if (line.startsWith("#")) {
      flush();
      blocks.push({ kind: "h", text: line.trim() });
      continue;
    }
    if (line.startsWith("[^")) {
      flush();
      blocks.push({ kind: "fn", text: line.trim() });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

export function blocksToMarkdown(blocks) {
  const parts = [];
  for (const block of blocks) {
    if (block.kind === "h") parts.push(block.text + "\n");
    else if (block.kind === "p") parts.push(block.text + "\n");
    else if (block.kind === "fn") parts.push(block.text + "\n");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function loadPages(scope, nav) {
  const chapter = nav.parts
    .flatMap((part) => part.pages)
    .find((page) => page.slug === scope && Array.isArray(page.sections));
  if (!chapter) throw new Error(`unknown scope: ${scope}`);
  const dir = join("content", "lv", "dp", scope);
  const pages = [];
  const add = (slug, title, file) => {
    const path = join(dir, file);
    if (!existsSync(path)) return;
    const blocks = parseBlocks(readFileSync(path, "utf8"));
    pages.push({ slug, title, path, blocks });
  };
  add(scope, chapter.title, "index.md");
  for (const section of chapter.sections) add(section.slug, section.title, `${section.slug}.md`);
  return pages;
}

function locate(pages, edit) {
  const { find, replace } = edit;
  const all = Boolean(edit.all);
  const isRegex = Boolean(edit.regex);
  const hits = [];
  for (const page of pages) {
    page.blocks.forEach((block, index) => {
      if (block.kind !== "p" && block.kind !== "fn" && block.kind !== "h") return;
      let count;
      let corrected;
      if (isRegex) {
        const matches = block.text.match(new RegExp(find, "g"));
        count = matches ? matches.length : 0;
        if (!count) return;
        corrected = block.text.replace(new RegExp(find, "g"), replace);
      } else {
        count = block.text.split(find).length - 1;
        if (!count) return;
        if (!all && count > 1) {
          throw new Error(`ambiguous find (${count}x in one paragraph): ${find.slice(0, 60)}`);
        }
        corrected = all ? block.text.split(find).join(replace) : block.text.replace(find, replace);
      }
      hits.push({
        page: page.slug,
        blockIndex: index,
        hash: hashText(block.text),
        original: block.text,
        corrected,
        occurrences: count,
        find,
        replace,
        all,
        regex: isRegex,
      });
    });
  }
  if (!hits.length) throw new Error(`find not found: ${find.slice(0, 60)}`);
  if (!all && !isRegex && hits.length > 1) {
    throw new Error(`ambiguous find (${hits.length} paragraphs): ${find.slice(0, 60)}`);
  }
  return hits;
}

export function loadRounds(root = CORRECTIONS) {
  const dir = join(root, "rounds");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^r\d+-[a-z-]+\.json$/.test(name)
      && !name.includes("-decisions-") && !name.includes("-custom-"))
    .map((name) => ({ name, data: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

export function loadDecisions(root = CORRECTIONS) {
  const dir = join(root, "rounds");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /-decisions-.*\.json$/.test(name))
    .map((name) => ({ name, data: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

/** Resolve every proposal of every round into concrete paragraph edits. */
export function resolveAll(nav, root = CORRECTIONS) {
  const results = [];
  for (const round of loadRounds(root)) {
    const scope = round.data.scope;
    const pages = loadPages(scope, nav);
    const resolved = round.data.proposals.map((proposal) => {
      const edits = [];
      for (const edit of proposal.edits) {
        edits.push(...locate(pages, edit));
      }
      return { ...proposal, edits };
    });
    results.push({ file: round.name, round: round.data.round, scope, title: round.data.title, resolved });
  }
  return results;
}

/** Accepted edits per page slug -> Map(blockIndex -> text). */
export function acceptedEdits(nav, root = CORRECTIONS) {
  const rounds = resolveAll(nav, root);
  const decisions = loadDecisions(root);
  const status = new Map();
  const overrides = new Map();
  const conflicts = [];
  for (const item of decisions) {
    for (const decision of item.data.decisions || []) {
      const previous = status.get(decision.id);
      if (previous && previous !== decision.status) {
        conflicts.push({ id: decision.id, previous, next: decision.status, file: item.name });
      }
      status.set(decision.id, decision.status);
      if (decision.replace) overrides.set(decision.id, decision.replace);
    }
  }
  const perPage = new Map();
  const pagesByScope = new Map();
  let accepted = 0;
  let rejected = 0;
  let proposed = 0;
  for (const round of rounds) {
    if (!pagesByScope.has(round.scope)) pagesByScope.set(round.scope, loadPages(round.scope, nav));
    const pages = pagesByScope.get(round.scope);
    for (const proposal of round.resolved) {
      proposed += 1;
      const state = status.get(proposal.id) || "proposed";
      if (state === "rejected") {
        rejected += 1;
        continue;
      }
      if (state !== "accepted") continue;
      accepted += 1;
      for (const edit of proposal.edits) {
        const page = pages.find((entry) => entry.slug === edit.page);
        if (!page) {
          conflicts.push({ id: proposal.id, previous: "missing page", next: edit.page, file: round.file });
          continue;
        }
        if (!perPage.has(edit.page)) perPage.set(edit.page, new Map());
        const map = perPage.get(edit.page);
        const current = map.has(edit.blockIndex) ? map.get(edit.blockIndex) : page.blocks[edit.blockIndex].text;
        let next;
        if (overrides.has(proposal.id) && proposal.edits.length === 1) {
          next = overrides.get(proposal.id);
        } else if (edit.regex) {
          const regex = new RegExp(edit.find, "g");
          if (current.match(regex)) {
            next = current.replace(new RegExp(edit.find, "g"), edit.replace);
          } else {
            next = current;
            conflicts.push({ id: proposal.id, previous: "regex gone", next: edit.find.slice(0, 40), file: round.file });
          }
        } else if (edit.all) {
          next = current.split(edit.find).join(edit.replace);
        } else if (current.includes(edit.find)) {
          next = current.replace(edit.find, edit.replace);
        } else {
          next = current;
          conflicts.push({ id: proposal.id, previous: "find gone", next: edit.find.slice(0, 40), file: round.file });
        }
        map.set(edit.blockIndex, next);
      }
    }
  }
  return {
    perPage,
    stats: { proposed, accepted, rejected, pending: proposed - accepted - rejected },
    conflicts,
  };
}

export function applyToPage(page, edits) {
  if (!edits || !edits.size) return null;
  const blocks = page.blocks.map((block, index) =>
    edits.has(index) ? { ...block, text: edits.get(index) } : block);
  return blocksToMarkdown(blocks);
}

/* --------------------------------------------------------------- word diff */

export function diffWords(before, after) {  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "eq", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "ins", text: b[j] });
      j += 1;
    }
  }
  while (i < n) { out.push({ type: "del", text: a[i] }); i += 1; }
  while (j < m) { out.push({ type: "ins", text: b[j] }); j += 1; }
  return out;
}

/** Character-level diff, used for typography and punctuation fixes. */
export function diffChars(before, after) {
  if (before.length > 1400 || after.length > 1400) return diffWords(before, after);
  const a = Array.from(before);
  const b = Array.from(after);
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "eq", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "ins", text: b[j] });
      j += 1;
    }
  }
  while (i < n) { out.push({ type: "del", text: a[i] }); i += 1; }
  while (j < m) { out.push({ type: "ins", text: b[j] }); j += 1; }
  return out;
}
