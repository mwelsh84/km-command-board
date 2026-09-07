import { corsOrigin, parseDecideInput, processDecide, resultHtml } from "../lib/http-decide.js";

function headerOrigin(req) {
  return req.headers?.origin || req.headers?.Origin || "";
}

function wantsHtml(req) {
  const accept = String(req.headers?.accept || req.headers?.Accept || "");
  if (req.method !== "GET") return false;
  if (accept.includes("application/json") && !accept.includes("text/html")) return false;
  return true;
}

function sendCors(res, origin) {
  const allow = corsOrigin(origin);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  sendCors(res, headerOrigin(req));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.status(405).json({ ok: false, error: "Use GET or POST" });
    return;
  }

  let input;
  try {
    input = parseDecideInput({ query: req.query || {}, body: req.body });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
    return;
  }

  const out = await processDecide(input, process.env);
  if (wantsHtml(req)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const error = out.json?.ok ? null : out.json?.error;
    const result = out.json?.ok ? out.json : { action: input.action, permalink: "" };
    res.status(out.status).send(resultHtml(result, error));
    return;
  }

  res.status(out.status).json(out.json);
}
