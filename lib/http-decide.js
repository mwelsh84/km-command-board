import { applyDecide, asanaToken } from "./asana-decide.js";
import { isAction, isTaskGid } from "./validate.js";

export function corsOrigin(origin, env = process.env) {
  if (String(env.NODE_ENV || "") === "production") return "";
  const value = String(origin || "").trim();
  if (!value) return "";
  if (/^http:\/\/localhost(?::\d+)?$/.test(value)) return value;
  if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(value)) return value;
  return "";
}

export function isJsonContentType(contentType) {
  return String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase() === "application/json";
}

export function sanitizeNote(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 2000);
}

export function parseDecideInput({ body } = {}) {
  let payload = body;
  if (typeof payload === "string" && payload.trim()) {
    try {
      payload = JSON.parse(payload);
    } catch {
      const err = new Error("Body must be JSON");
      err.status = 400;
      throw err;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const err = new Error("Body must be JSON");
    err.status = 400;
    throw err;
  }
  const action = String(payload.action || "").trim();
  return {
    taskGid: String(payload.taskGid || payload.task_gid || "").trim(),
    action,
    note: action === "decline" ? sanitizeNote(payload.note) : "",
  };
}

function json(status, data) {
  return { status, json: data };
}

function publicErrorMessage(err) {
  const message = String(err?.message || "Asana request failed");
  if (/bearer|asana_pat|asana_token|authorization/i.test(message)) {
    return "Asana request failed";
  }
  return message;
}

export async function processDecide(input, env = process.env, deps = {}) {
  const { taskGid, action, note } = input || {};
  if (!isTaskGid(taskGid)) {
    return json(400, { ok: false, error: "Need a valid taskGid" });
  }
  if (!isAction(action)) {
    return json(400, { ok: false, error: "action must be approve or decline" });
  }

  const projectGid = String(env.ASANA_COMMAND_CENTER_PROJECT_GID || "").trim();
  const sectionGid = String(env.ASANA_NEEDS_DECISION_SECTION_GID || "").trim();
  if (!isTaskGid(projectGid) || !isTaskGid(sectionGid)) {
    return json(503, { ok: false, error: "Authorized Asana workflow is not configured" });
  }

  const token = asanaToken(env) || (deps.fetchImpl ? "mock" : "");
  if (!token) {
    return json(503, { ok: false, error: "ASANA_PAT is not set" });
  }

  try {
    const result = await applyDecide(
      { taskGid, action, note },
      { token, fetchImpl: deps.fetchImpl || fetch, projectGid, sectionGid }
    );
    return json(200, result);
  } catch (err) {
    return json(err.status || 502, { ok: false, error: publicErrorMessage(err) });
  }
}
