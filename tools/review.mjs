/**
 * Build the review pack for one round: a single self-contained HTML file that
 * works offline, stores decisions in localStorage and exports JSON.
 *
 *   node tools/review.mjs r1-principle-of-creation
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPages, parseBlocks, resolveAll } from "./corrections.mjs";

const [roundFile] = process.argv.slice(2);
if (!roundFile) {
  console.error("usage: node tools/review.mjs <round-file-name-without-.json>");
  process.exit(1);
}

const nav = JSON.parse(readFileSync("tools/nav.json", "utf8"));
const round = JSON.parse(readFileSync(join("corrections", "rounds", `${roundFile}.json`), "utf8"));
const resolved = resolveAll(nav).find((item) => item.round === round.round);
const pages = loadPages(round.scope, nav);

const pack = {
  round: round.round,
  scope: round.scope,
  title: round.title,
  created: round.created,
  pages: pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    paragraphs: parseBlocks(readFileSync(page.path, "utf8"))
      .map((block, index) => ({ index, kind: block.kind, text: block.text }))
      .filter((block) => block.kind === "p"),
  })),
  proposals: resolved.resolved.map((proposal) => ({
    id: proposal.id,
    category: proposal.category,
    confidence: proposal.confidence,
    note: proposal.note,
    edits: proposal.edits.map((edit) => ({
      page: edit.page,
      original: edit.original,
      corrected: edit.corrected,
      hash: edit.hash,
    })),
  })),
};

const html = `<!DOCTYPE html>
<html lang="lv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Labojumu recenzija — ${pack.title}</title>
<style>
  :root{--bg:#fafafa;--surface:#fff;--text:#212121;--muted:#737373;--gold:#bd9f47;--link:#0369a1;--green:#1f7a4d;--red:#b3261e;--line:#e5e5e5}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:"Source Sans 3","Segoe UI",system-ui,sans-serif;font-size:18px;line-height:1.55}
  header{position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--line);padding:.9rem 1.25rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;z-index:5}
  header h1{font-size:1.05rem;margin:0;color:var(--gold);font-weight:650}
  header .spacer{flex:1}
  header input{border:1px solid var(--line);border-radius:.35rem;padding:.45rem .6rem;font:inherit;font-size:.9rem;min-width:12rem}
  header button{font:inherit;font-size:.9rem;padding:.5rem .9rem;border-radius:.4rem;border:1px solid var(--line);background:var(--bg);cursor:pointer}
  header button.primary{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:600}
  main{max-width:58rem;margin:0 auto;padding:1.5rem 1.25rem 5rem}
  .intro{background:var(--surface);border:1px solid var(--line);border-radius:.5rem;padding:1rem 1.25rem;margin-bottom:1.5rem;font-size:.95rem}
  .intro p{margin:.3rem 0}
  .stats{color:var(--muted);font-size:.85rem}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:.5rem;padding:1rem 1.25rem;margin-bottom:1rem}
  .card[data-status="accepted"]{border-left:5px solid var(--green)}
  .card[data-status="rejected"]{border-left:5px solid var(--red);opacity:.75}
  .meta{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;font-size:.78rem;color:var(--muted);margin-bottom:.5rem}
  .tag{background:#f1efe9;border-radius:99px;padding:.1rem .55rem;text-transform:uppercase;letter-spacing:.05em;font-size:.7rem}
  .conf{font-size:.75rem;color:var(--muted)}
  .note{font-size:.92rem;color:#333;margin:.2rem 0 .8rem}
  .diff{font-size:.95rem;background:#fbfaf7;border:1px solid var(--line);border-radius:.35rem;padding:.6rem .75rem;margin-bottom:.5rem}
  .diff .label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);display:block;margin-bottom:.2rem}
  del{background:#fbdcd8;text-decoration:line-through}
  ins{background:#d9efdf;text-decoration:none}
  .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem}
  .actions button{font:inherit;font-size:.85rem;padding:.4rem .8rem;border-radius:.35rem;border:1px solid var(--line);background:var(--bg);cursor:pointer}
  .actions button[aria-pressed="true"][data-set="accepted"]{background:var(--green);border-color:var(--green);color:#fff}
  .actions button[aria-pressed="true"][data-set="rejected"]{background:var(--red);border-color:var(--red);color:#fff}
  textarea{width:100%;font:inherit;font-size:.92rem;line-height:1.5;border:1px solid var(--line);border-radius:.35rem;padding:.5rem .6rem;background:var(--bg);margin-top:.4rem;resize:vertical}
  details.custom{background:var(--surface);border:1px solid var(--line);border-radius:.5rem;padding:1rem 1.25rem;margin-top:2rem}
  details.custom summary{cursor:pointer;font-weight:600}
  select{font:inherit;font-size:.9rem;padding:.4rem;border:1px solid var(--line);border-radius:.35rem;max-width:100%}
  .muted{color:var(--muted);font-size:.85rem}
  footer{position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--line);padding:.7rem 1.25rem;display:flex;gap:1rem;align-items:center;font-size:.85rem}
  footer .spacer{flex:1}
  footer button{font:inherit;padding:.45rem .9rem;border-radius:.4rem;border:1px solid var(--line);background:var(--bg);cursor:pointer}
  footer button.primary{background:var(--gold);border-color:var(--gold);color:#fff;font-weight:600}
</style>
</head>
<body>
<header>
  <h1>Labojumu recenzija — ${pack.title}</h1>
  <span class="spacer"></span>
  <label>Recenzents <input id="reviewer" placeholder="Vārds, uzvārds"></label>
</header>
<main>
  <section class="intro">
    <p><strong>Kā lietot šo failu.</strong> Zemāk ir ${pack.proposals.length} priekšlikumi. Katram izvēlieties
      <em>Pieņemt</em> vai <em>Noraidīt</em>; ja formulējums neapmierina, labojiet tekstu lodziņā.</p>
    <p>Pēc tam nospiediet <strong>Eksportēt lēmumus</strong> un nosūtiet lejupielādēto failu atpakaļ.
      Nekas netiek publicēts bez apstiprināšanas.</p>
    <p class="stats" id="stats"></p>
  </section>
  <section id="cards"></section>
  <details class="custom">
    <summary>Pievienot savu labojumu</summary>
    <p class="muted">Izvēlieties lappusi un rindkopu, izlabojiet tekstu un pievienojiet. Šie labojumi tiks nodoti atsevišķi un vēl nav iekļauti priekšlikumos.</p>
    <p><select id="custom-page"></select></p>
    <p><select id="custom-para"></select></p>
    <textarea id="custom-text" rows="4" placeholder="Labotais rindkopas teksts"></textarea>
    <p><button id="custom-add">Pievienot labojumu</button> <span class="muted" id="custom-status"></span></p>
  </details>
</main>
<footer>
  <span id="counts" class="muted"></span>
  <span class="spacer"></span>
  <button id="reset">Notīrīt</button>
  <button class="primary" id="export">Eksportēt lēmumus</button>
</footer>
<script>
const DATA = ${JSON.stringify(pack)};
const KEY = "lvdp-review-r" + DATA.round;
const state = JSON.parse(localStorage.getItem(KEY) || "{}");
state.decisions = state.decisions || {};
state.replace = state.replace || {};
state.custom = state.custom || [];
state.reviewer = state.reviewer || "";
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

const esc = (s) => s.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const diff = (a, b) => {
  if (a.length > 1200 || b.length > 1200) return esc(a) + " → " + esc(b);
  const aw = Array.from(a), bw = Array.from(b);
  const n = aw.length, m = bw.length;
  const lcs = Array.from({length:n+1}, () => new Uint16Array(m+1));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) lcs[i][j] = aw[i]===bw[j] ? lcs[i+1][j+1]+1 : Math.max(lcs[i+1][j], lcs[i][j+1]);
  const tokens = [];
  let i=0,j=0;
  while(i<n&&j<m){ if(aw[i]===bw[j]){tokens.push({t:"eq",c:aw[i]});i++;j++;} else if(lcs[i+1][j]>=lcs[i][j+1]){tokens.push({t:"del",c:aw[i]});i++;} else {tokens.push({t:"ins",c:bw[j]});j++;} }
  while(i<n){tokens.push({t:"del",c:aw[i]});i++;}
  while(j<m){tokens.push({t:"ins",c:bw[j]});j++;}
  const first = tokens.findIndex((token) => token.t !== "eq");
  if (first < 0) return esc(a);
  const start = Math.max(0, first - 40);
  const end = Math.min(tokens.length, first + 55);
  let out = start > 0 ? "… " : "";
  for (const token of tokens.slice(start, end)) {
    if (token.t === "eq") out += esc(token.c);
    else if (token.t === "del") out += "<del>" + esc(token.c) + "</del>";
    else out += "<ins>" + esc(token.c) + "</ins>";
  }
  if (end < tokens.length) out += " …";
  return out;
};

const cards = document.getElementById("cards");
for (const p of DATA.proposals) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = p.id;
  const status = state.decisions[p.id] || "pending";
  card.dataset.status = status;
  const edits = p.edits.map((e) => \`
    <div class="diff">
      <span class="label">\${esc(e.page)}</span>
      \${diff(e.original, state.replace[p.id] || e.corrected)}
    </div>\`).join("");
  const editable = p.edits.length === 1
    ? \`<textarea data-replace="\${p.id}" rows="3">\${esc(state.replace[p.id] || p.edits[0].corrected)}</textarea>\`
    : "";
  card.innerHTML = \`
    <div class="meta"><span class="tag">\${esc(p.category)}</span><span class="conf">pārliecība \${Math.round(p.confidence*100)}%</span>
      <span class="conf">\${p.edits.length} vieta(s)</span></div>
    <p class="note">\${esc(p.note)}</p>
    \${edits}
    \${editable}
    <div class="actions">
      <button data-set="accepted" data-id="\${p.id}" aria-pressed="\${status==="accepted"}">Pieņemt</button>
      <button data-set="rejected" data-id="\${p.id}" aria-pressed="\${status==="rejected"}">Noraidīt</button>
    </div>\`;
  cards.appendChild(card);
}

const refreshStats = () => {
  const total = DATA.proposals.length;
  const acc = DATA.proposals.filter((p) => state.decisions[p.id] === "accepted").length;
  const rej = DATA.proposals.filter((p) => state.decisions[p.id] === "rejected").length;
  const text = \`Pieņemti \${acc} · Noraidīti \${rej} · Atlikuši \${total-acc-rej} · Pašu labojumi \${state.custom.length}\`;
  document.getElementById("stats").textContent = text;
  document.getElementById("counts").textContent = text;
};
refreshStats();

cards.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-set]");
  if (!button) return;
  const id = button.dataset.id;
  const value = button.dataset.set;
  state.decisions[id] = state.decisions[id] === value ? "pending" : value;
  const card = button.closest(".card");
  card.dataset.status = state.decisions[id];
  card.querySelectorAll("button[data-set]").forEach((b) => b.setAttribute("aria-pressed", String(state.decisions[id] === b.dataset.set)));
  save(); refreshStats();
});

cards.addEventListener("input", (event) => {
  const area = event.target.closest("textarea[data-replace]");
  if (!area) return;
  state.replace[area.dataset.replace] = area.value;
  save();
});

const reviewer = document.getElementById("reviewer");
reviewer.value = state.reviewer;
reviewer.addEventListener("input", () => { state.reviewer = reviewer.value; save(); });

// custom suggestions
const pageSel = document.getElementById("custom-page");
const paraSel = document.getElementById("custom-para");
const customText = document.getElementById("custom-text");
DATA.pages.forEach((page) => {
  const option = document.createElement("option");
  option.value = page.slug;
  option.textContent = page.title;
  pageSel.appendChild(option);
});
const fillParas = () => {
  const page = DATA.pages.find((p) => p.slug === pageSel.value);
  paraSel.innerHTML = "";
  page.paragraphs.forEach((para) => {
    const option = document.createElement("option");
    option.value = para.index;
    option.textContent = para.index + " · " + para.text.slice(0, 70) + (para.text.length > 70 ? "…" : "");
    paraSel.appendChild(option);
  });
  syncCustom();
};
const syncCustom = () => {
  const page = DATA.pages.find((p) => p.slug === pageSel.value);
  const para = page.paragraphs.find((p) => p.index === Number(paraSel.value));
  customText.value = para ? para.text : "";
};
pageSel.addEventListener("change", fillParas);
paraSel.addEventListener("change", syncCustom);
fillParas();
document.getElementById("custom-add").addEventListener("click", () => {
  const page = DATA.pages.find((p) => p.slug === pageSel.value);
  const para = page.paragraphs.find((p) => p.index === Number(paraSel.value));
  if (!para || customText.value.trim() === para.text.trim()) {
    document.getElementById("custom-status").textContent = "Nav izmaiņu.";
    return;
  }
  state.custom.push({ page: page.slug, blockIndex: para.index, original: para.text, corrected: customText.value.trim() });
  save(); refreshStats();
  document.getElementById("custom-status").textContent = "Pievienots.";
});

document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Notīrīt visus lēmumus?")) return;
  localStorage.removeItem(KEY);
  location.reload();
});

document.getElementById("export").addEventListener("click", () => {
  const payload = {
    round: DATA.round,
    scope: DATA.scope,
    reviewer: state.reviewer || "nezināms",
    submitted: new Date().toISOString().slice(0, 10),
    decisions: DATA.proposals
      .map((p) => ({ id: p.id, status: state.decisions[p.id] || "pending", replace: state.replace[p.id] }))
      .filter((d) => d.status !== "pending"),
    custom: state.custom,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = \`lvdp-r\${DATA.round}-\${(state.reviewer || "recenzents").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json\`;
  link.click();
  URL.revokeObjectURL(url);
});
</script>
</body>
</html>
`;

mkdirSync("review", { recursive: true });
const target = join("review", `${roundFile}.html`);
writeFileSync(target, html, "utf8");
console.log(`review pack: ${target} (${pack.proposals.length} proposals, ${pack.proposals.reduce((n, p) => n + p.edits.length, 0)} edits)`);
