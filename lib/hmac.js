import { createHmac, timingSafeEqual } from "node:crypto";

export const ACTIONS = Object.freeze(["approve", "decline", "other"]);

export function canonicalMessage(taskGid, action) {
  return `${String(taskGid).trim()}:${String(action).trim()}`;
}

export function sign(taskGid, action, secret) {
  if (!secret) throw new Error("APPROVAL_SECRET is required to sign");
  return createHmac("sha256", secret)
    .update(canonicalMessage(taskGid, action), "utf8")
    .digest("hex");
}

function parseHex(value) {
  const hex = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "");
  if (!hex || hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function verify(taskGid, action, sig, secret) {
  if (!secret || !sig) return false;
  const expected = parseHex(sign(taskGid, action, secret));
  const got = parseHex(sig);
  if (!expected || !got || expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

export function isAction(value) {
  return ACTIONS.includes(String(value || "").trim());
}

export function isTaskGid(value) {
  return /^\d{5,}$/.test(String(value || "").trim());
}
