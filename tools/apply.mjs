/**
 * Merge a review pack export into the corrections folder.
 *
 *   node tools/apply.mjs review/lvdp-r1-anna.json
 *
 * The decisions file is stored as corrections/rounds/r<round>-decisions-<reviewer>.json.
 * Nothing is applied to the text here; the site build reads accepted decisions.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("usage: node tools/apply.mjs <decisions.json>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
if (!payload.round || !Array.isArray(payload.decisions)) {
  console.error("invalid decisions file: expected round and decisions[]");
  process.exit(1);
}

const slug = (payload.reviewer || "recenzents")
  .toLowerCase()
  .replace(/[āčēģīķļņšūž]/g, (c) => ({ ā: "a", č: "c", ē: "e", ģ: "g", ī: "i", ķ: "k", ļ: "l", ņ: "n", š: "s", ū: "u", ž: "z" }[c]))
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "recenzents";

const out = join("corrections", "rounds", `r${payload.round}-decisions-${slug}.json`);
writeFileSync(out, JSON.stringify({
  round: payload.round,
  scope: payload.scope,
  reviewer: payload.reviewer,
  submitted: payload.submitted,
  decisions: payload.decisions,
}, null, 2) + "\n", "utf8");

const accepted = payload.decisions.filter((decision) => decision.status === "accepted").length;
const rejected = payload.decisions.filter((decision) => decision.status === "rejected").length;
console.log(`saved ${out}`);
console.log(`accepted ${accepted}, rejected ${rejected}, pending ${payload.decisions.length - accepted - rejected}`);

if (Array.isArray(payload.custom) && payload.custom.length) {
  const customPath = join("corrections", "rounds", `r${payload.round}-custom-${slug}.json`);
  writeFileSync(customPath, JSON.stringify({ round: payload.round, reviewer: payload.reviewer, entries: payload.custom }, null, 2) + "\n", "utf8");
  console.log(`custom suggestions kept for review: ${customPath} (${payload.custom.length})`);
}
