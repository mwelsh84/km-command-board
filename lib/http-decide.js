import { isAction, isTaskGid, verify } from "./hmac.js";
import { applyDecide, asanaToken, permalinkFor } from "./asana-decide.js";

const ALLOWED_ORIGINS = [
  /^https:\/\/mwelsh84\.github\.io$/,
  /^https:\/\/[\w.-]+\.vercel\.app$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

export function corsOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return "";
  return ALLOWED_ORIGINS.some((re) => re.test(value)) ? value : "";
}

export function sanitizeActor(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
}

export function sanitizeNote(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 2000);
}

export function parseDecideInput({ query = {}, body } = {}) {
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
  if (!payload || typeof payload !== "object") payload = {};
  const src = { ...query, ...payload };
  return {
    taskGid: String(src.taskGid || src.task_gid || "").trim(),
    action: String(src.action || "").trim().toLowerCase(),
    actor: sanitizeActor(src.actor),
    note: sanitizeNote(src.note),
    sig: String(src.sig || "").trim(),
  };
}

function json(status, data) {
  return { status, json: data, html: null };
}

export function resultHtml(result, error) {
  const ok = !error;
  const title = error
    ? "Command · decide failed"
    : result.action === "other"
      ? "Command · open in Asana"
      : result.action === "approve"
        ? "Command · approved"
        : "Command · declined";
  const body = error
    ? `<p>${escapeHtml(error)}</p>`
    : result.action === "other"
      ? `<p>Open the Asana task to discuss.</p><p><a href="${escapeHtml(result.permalink)}">Open in Asana</a></p>`
      : `<p>${result.action === "approve" ? "Approved" : "Declined"} via Command.${result.alreadyCompleted ? " Task was already complete." : " Task marked complete."}</p><p><a href="${escapeHtml(result.permalink)}">Open in Asana</a></p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font: 15px/1.4 ui-sans-serif, system-ui, sans-serif; background: #111114; color: #f2f1ec; }
    main { max-width: 36rem; margin: 48px auto; padding: 0 20px; }
    a { color: #8eb4ff; }
    p { color: #9a988e; }
    h1 { font-size: 18px; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function processDecide(input, env = process.env, deps = {}) {
  const { taskGid, action, actor, note, sig } = input;
  if (!isTaskGid(taskGid) || !isAction(action) || !sig) {
    return json(400, {
      ok: false,
      error: "Need taskGid, action (approve|decline|other), and sig",
    });
  }

  const secret = String(env.APPROVAL_SECRET || "").trim();
  if (!secret) {
    return json(503, { ok: false, error: "APPROVAL_SECRET is not set" });
  }
  if (!verify(taskGid, action, sig, secret)) {
    return json(401, { ok: false, error: "Invalid signature" });
  }

  if (action === "other") {
    const token = asanaToken(env);
    if (!token) {
      return json(200, {
        ok: true,
        action,
        taskGid,
        permalink: permalinkFor(taskGid),
        wrote: false,
      });
    }
  }

  const token = asanaToken(env) || (deps.fetchImpl ? "mock" : "");
  if (!token) {
    return json(503, { ok: false, error: "ASANA_PAT (or ASANA_TOKEN) is not set" });
  }

  try {
    const result = await applyDecide(
      { taskGid, action, actor, note },
      { token, fetchImpl: deps.fetchImpl || fetch }
    );
    return json(200, result);
  } catch (err) {
    return json(err.status || 502, { ok: false, error: err.message || "Asana request failed" });
  }
}
