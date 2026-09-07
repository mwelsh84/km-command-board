#!/usr/bin/env node
/**
 * Local board + /api/decide. Optional MOCK_ASANA=1 skips live Asana.
 *
 *   APPROVAL_SECRET=dev npm run mint -- 1218244286398772 http://127.0.0.1:4173/api/decide
 *   APPROVAL_SECRET=dev MOCK_ASANA=1 node scripts/dev-server.mjs
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDecideInput, processDecide, resultHtml, corsOrigin } from "../lib/http-decide.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function mockFetch(url, opts = {}) {
  const method = opts.method || "GET";
  const gid = (url.match(/\/tasks\/(\d+)/) || [])[1] || "0";
  if (url.includes("/stories")) {
    return { ok: true, json: async () => ({ data: { gid: "story" } }) };
  }
  if (method === "PUT") {
    return { ok: true, json: async () => ({ data: { gid, completed: true } }) };
  }
  return {
    ok: true,
    json: async () => ({
      data: {
        gid,
        name: "Mock Decide task",
        completed: false,
        resource_subtype: "default_task",
        permalink_url: `https://app.asana.com/0/0/${gid}/f`,
      },
    }),
  };
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  const origin = String(req.headers.origin || "");
  const allow = corsOrigin(origin);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (req.method === "OPTIONS") {
    send(res, 204, {}, "");
    return;
  }

  if (url.pathname === "/api/decide") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let input;
    try {
      input = parseDecideInput({
        query: Object.fromEntries(url.searchParams),
        body: raw,
      });
    } catch (err) {
      send(res, 400, { "Content-Type": "application/json" }, JSON.stringify({ ok: false, error: err.message }));
      return;
    }
    const deps = process.env.MOCK_ASANA === "1" ? { fetchImpl: mockFetch } : {};
    const out = await processDecide(input, process.env, deps);
    const accept = String(req.headers.accept || "");
    const html = req.method === "GET" && !accept.includes("application/json");
    if (html) {
      const error = out.json?.ok ? null : out.json?.error;
      const result = out.json?.ok ? out.json : { action: input.action, permalink: "" };
      send(res, out.status, { "Content-Type": "text/html; charset=utf-8" }, resultHtml(result, error));
      return;
    }
    send(res, out.status, { "Content-Type": "application/json" }, JSON.stringify(out.json));
    return;
  }

  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = normalize(join(root, rel));
  if (!file.startsWith(root)) {
    send(res, 403, { "Content-Type": "text/plain" }, "forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    send(res, 200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }, body);
  } catch {
    send(res, 404, { "Content-Type": "text/plain" }, "not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`KM Command local http://127.0.0.1:${port}/`);
});
