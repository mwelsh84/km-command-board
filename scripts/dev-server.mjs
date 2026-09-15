#!/usr/bin/env node
/**
 * Local board + POST /api/decide. Optional MOCK_ASANA=1 skips live Asana.
 *
 *   MOCK_ASANA=1 npm run dev
 *   http://127.0.0.1:4173/
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { asanaToken } from "../lib/asana-decide.js";
import {
  corsOrigin,
  isJsonContentType,
  parseDecideInput,
  processDecide,
} from "../lib/http-decide.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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
  const projectGid = process.env.ASANA_COMMAND_CENTER_PROJECT_GID || "1215460449693075";
  const sectionGid = process.env.ASANA_NEEDS_DECISION_SECTION_GID || "1215460449693077";
  return {
    ok: true,
    json: async () => ({
      data: {
        gid,
        name: "Mock Decide task",
        completed: false,
        resource_subtype: "default_task",
        permalink_url: `https://app.asana.com/0/0/${gid}/f`,
        memberships: [{ project: { gid: projectGid }, section: { gid: sectionGid } }],
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
  const allow = corsOrigin(origin, process.env);
  if (allow) res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "private, no-store");

  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (req.method === "OPTIONS") {
    send(res, 204, {}, "");
    return;
  }

  if (url.pathname === "/api/decide") {
    if (req.method !== "POST") {
      send(
        res,
        405,
        { "Content-Type": "application/json", Allow: "POST, OPTIONS" },
        JSON.stringify({ ok: false, error: "Method not allowed" })
      );
      return;
    }
    if (!isJsonContentType(req.headers["content-type"])) {
      send(
        res,
        415,
        { "Content-Type": "application/json" },
        JSON.stringify({ ok: false, error: "Content-Type must be application/json" })
      );
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let input;
    try {
      input = parseDecideInput({ body: raw });
    } catch (err) {
      send(res, 400, { "Content-Type": "application/json" }, JSON.stringify({ ok: false, error: err.message }));
      return;
    }
    const mock = process.env.MOCK_ASANA === "1";
    const env = {
      ...process.env,
      ASANA_COMMAND_CENTER_PROJECT_GID:
        process.env.ASANA_COMMAND_CENTER_PROJECT_GID || "1215460449693075",
      ASANA_NEEDS_DECISION_SECTION_GID:
        process.env.ASANA_NEEDS_DECISION_SECTION_GID || "1215460449693077",
    };
    if (mock && !asanaToken(process.env)) env.ASANA_PAT = "mock";
    const deps = mock ? { fetchImpl: mockFetch } : {};
    const out = await processDecide(input, env, deps);
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
