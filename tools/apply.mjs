/**
 * Merge a review pack export into the corrections folder, or undo it.
 *
 *   node tools/apply.mjs <decisions.json>          store the committee's decisions
 *   node tools/apply.mjs --undo <decisions.json>   remove those decisions again
 *
 * The decisions file is stored as corrections/rounds/r<round>-decisions-<reviewer>.json.
 * Nothing is applied to the text here; the site build reads accepted decisions, so
 * undoing is always possible without touching the original.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const undo = args[0] === "--undo";
const input = undo ? args[1] : args[0];

if (!input) {
  console.error("usage: node tools/apply.mjs [--undo] <decisions.json>");
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

const roundPrefix = /^\d+$/.test(String(payload.round)) ? `r${payload.round}` : String(payload.round);
const decisionsPath = join("corrections", "rounds", `${roundPrefix}-decisions-${slug}.json`);
const customPath = join("corrections", "rounds", `${roundPrefix}-custom-${slug}.json`);

if (undo) {
  let removed = 0;
  for (const path of [decisionsPath, customPath]) {
    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`removed ${path}`);
      removed += 1;
    }
  }
  if (!removed) {
    console.log("nothing to undo for this reviewer and round");
  } else {
    console.log("run `node tools/build.mjs` to rebuild without these decisions");
  }
  process.exit(0);
}

writeFileSync(decisionsPath, JSON.stringify({
  round: payload.round,
  scope: payload.scope,
  reviewer: payload.reviewer,
  submitted: payload.submitted,
  decisions: payload.decisions,
}, null, 2) + "\n", "utf8");

const accepted = payload.decisions.filter((decision) => decision.status === "accepted").length;
const rejected = payload.decisions.filter((decision) => decision.status === "rejected").length;
console.log(`saved ${decisionsPath}`);
console.log(`accepted ${accepted}, rejected ${rejected}, pending ${payload.decisions.length - accepted - rejected}`);

if (Array.isArray(payload.custom) && payload.custom.length) {
  writeFileSync(customPath, JSON.stringify({ round: payload.round, reviewer: payload.reviewer, entries: payload.custom }, null, 2) + "\n", "utf8");
  console.log(`custom suggestions kept for review: ${customPath} (${payload.custom.length})`);
}
