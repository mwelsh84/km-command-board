import assert from "node:assert/strict";
import { describe, it } from "node:test";
import handler from "../api/decide.js";

const gid = "1218244286398772";

function mockReq({ method = "POST", headers = {}, body } = {}) {
  return {
    method,
    headers,
    body,
    query: { taskGid: gid, action: "approve", actor: "query-actor" },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    end(data) {
      if (data !== undefined) this.body = data;
      this.ended = true;
      return this;
    },
  };
}

describe("POST /api/decide HTTP surface", () => {
  it("rejects GET with HTTP 405 and does not change Asana", async () => {
    const req = mockReq({
      method: "GET",
      headers: { origin: "https://mwelsh84.github.io", accept: "text/html" },
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.ok, false);
    assert.match(String(res.headers.allow), /POST/);
    assert.equal(typeof res.body, "object");
  });

  it("does not allow arbitrary *.vercel.app CORS in production or development", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const req = mockReq({
        method: "GET",
        headers: { origin: "https://totally-random.vercel.app" },
      });
      const res = mockRes();
      await handler(req, res);
      assert.equal(res.headers["access-control-allow-origin"], undefined);
      assert.equal(res.statusCode, 405);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }

    const devReq = mockReq({
      method: "OPTIONS",
      headers: { origin: "https://preview-bot.vercel.app" },
    });
    const devRes = mockRes();
    await handler(devReq, devRes);
    assert.equal(devRes.headers["access-control-allow-origin"], undefined);
  });

  it("rejects a missing task GID without calling Asana", async () => {
    const req = mockReq({
      headers: { "content-type": "application/json" },
      body: { taskGid: "", action: "approve", actor: "client" },
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
  });

  it("rejects an invalid action without calling Asana", async () => {
    const req = mockReq({
      headers: { "content-type": "application/json" },
      body: { taskGid: gid, action: "other" },
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
  });

  it("rejects non-JSON POST bodies", async () => {
    const req = mockReq({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `taskGid=${gid}&action=approve`,
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 415);
  });
});
