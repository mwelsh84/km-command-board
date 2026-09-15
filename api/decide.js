import {
  corsOrigin,
  isJsonContentType,
  parseDecideInput,
  processDecide,
} from "../lib/http-decide.js";

function headerOrigin(req) {
  return req.headers?.origin || req.headers?.Origin || "";
}

function headerContentType(req) {
  return req.headers?.["content-type"] || req.headers?.["Content-Type"] || "";
}

function sendCors(res, origin, env = process.env) {
  const allow = corsOrigin(origin, env);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "private, no-store");
}

export default async function handler(req, res) {
  sendCors(res, headerOrigin(req));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!isJsonContentType(headerContentType(req))) {
    res.status(415).json({ ok: false, error: "Content-Type must be application/json" });
    return;
  }

  let input;
  try {
    input = parseDecideInput({ body: req.body });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
    return;
  }

  const out = await processDecide(input, process.env);
  res.status(out.status).json(out.json);
}
