export const ACTIONS = Object.freeze(["approve", "decline"]);

export function isAction(value) {
  return ACTIONS.includes(String(value || "").trim());
}

export function isTaskGid(value) {
  return /^\d{5,}$/.test(String(value || "").trim());
}
