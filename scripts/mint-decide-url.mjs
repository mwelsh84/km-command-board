#!/usr/bin/env node
/**
 * Mint HMAC-signed Approve / Decline / Other URLs for one Asana task GID.
 *
 *   APPROVAL_SECRET='…' node scripts/mint-decide-url.mjs <taskGid> [apiBase]
 *
 * apiBase defaults to DECIDE_API_BASE or https://YOUR-PROJECT.vercel.app/api/decide
 *
 * Also prints data-* attributes to paste onto the Decide card in index.html.
 */
import { ACTIONS, isTaskGid, sign } from "../lib/hmac.js";

const taskGid = String(process.argv[2] || "").trim();
const apiBase = String(
  process.argv[3] || process.env.DECIDE_API_BASE || "https://YOUR-PROJECT.vercel.app/api/decide"
).replace(/\/$/, "");
const secret = String(process.env.APPROVAL_SECRET || "").trim();

if (!secret) {
  console.error("Set APPROVAL_SECRET in the environment (same value as Vercel).");
  process.exit(1);
}
if (!isTaskGid(taskGid)) {
  console.error("Usage: APPROVAL_SECRET=… node scripts/mint-decide-url.mjs <taskGid> [apiBase]");
  process.exit(1);
}

const sigs = Object.fromEntries(ACTIONS.map((action) => [action, sign(taskGid, action, secret)]));

console.log(`# HMAC message is taskGid:action  (e.g. ${taskGid}:approve)`);
console.log(`# openssl equivalent:`);
console.log(
  `# SIG=$(printf %s '${taskGid}:approve' | openssl dgst -sha256 -hmac "$APPROVAL_SECRET" -hex | awk '{print $NF}')`
);
console.log("");

for (const action of ACTIONS) {
  const url = `${apiBase}?taskGid=${encodeURIComponent(taskGid)}&action=${action}&sig=${sigs[action]}`;
  console.log(`${action.padEnd(8)} ${url}`);
}

console.log("");
console.log("Paste onto the Decide card:");
console.log(`  data-task-gid="${taskGid}"`);
console.log(`  data-sig-approve="${sigs.approve}"`);
console.log(`  data-sig-decline="${sigs.decline}"`);
console.log(`  data-sig-other="${sigs.other}"`);

console.log("");
console.log("curl POST example (approve):");
console.log(`curl -sS -X POST '${apiBase}' \\`);
console.log(`  -H 'Content-Type: application/json' \\`);
console.log(
  `  -d '{"taskGid":"${taskGid}","action":"approve","sig":"${sigs.approve}","actor":"Michael"}'`
);
