import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sign } from "../lib/hmac.js";
import { parseDecideInput, processDecide } from "../lib/http-decide.js";

const secret = "unit-test-secret";
const gid = "1218244286398772";

function env(extra = {}) {
  return { APPROVAL_SECRET: secret, ASANA_PAT: "pat", ...extra };
}

describe("processDecide", () => {
  it("rejects missing fields and bad signatures", async () => {
    const missing = await processDecide(
      { taskGid: "", action: "approve", sig: "" },
      env()
    );
    assert.equal(missing.status, 400);

    const bad = await processDecide(
      { taskGid: gid, action: "approve", sig: "ab".repeat(32) },
      env()
    );
    assert.equal(bad.status, 401);
  });

  it("returns 503 when secrets are missing", async () => {
    const noHmac = await processDecide(
      { taskGid: gid, action: "approve", sig: sign(gid, "approve", secret) },
      { ASANA_PAT: "pat" }
    );
    assert.equal(noHmac.status, 503);

    const noPat = await processDecide(
      { taskGid: gid, action: "approve", sig: sign(gid, "approve", secret) },
      { APPROVAL_SECRET: secret }
    );
    assert.equal(noPat.status, 503);
  });

  it("other can return a constructed permalink without Asana if PAT is missing", async () => {
    const out = await processDecide(
      { taskGid: gid, action: "other", sig: sign(gid, "other", secret) },
      { APPROVAL_SECRET: secret }
    );
    assert.equal(out.status, 200);
    assert.equal(out.json.permalink, `https://app.asana.com/0/0/${gid}/f`);
  });

  it("approve calls Asana comment + complete", async () => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET", body: opts.body });
      if (url.includes("/stories")) return { ok: true, json: async () => ({ data: {} }) };
      if ((opts.method || "GET") === "PUT") return { ok: true, json: async () => ({ data: {} }) };
      return {
        ok: true,
        json: async () => ({
          data: {
            completed: false,
            resource_subtype: "default_task",
            permalink_url: "https://app.asana.com/0/0/" + gid + "/f",
          },
        }),
      };
    };
    const out = await processDecide(
      { taskGid: gid, action: "approve", actor: "Michael", sig: sign(gid, "approve", secret) },
      env(),
      { fetchImpl }
    );
    assert.equal(out.status, 200);
    assert.equal(out.json.ok, true);
    assert.equal(calls.some((c) => c.url.includes("/stories")), true);
    assert.equal(calls.some((c) => c.method === "PUT"), true);
  });
});

describe("parseDecideInput", () => {
  it("merges query and JSON body", () => {
    const parsed = parseDecideInput({
      query: { taskGid: gid, action: "decline" },
      body: '{"note":"no","sig":"abc"}',
    });
    assert.equal(parsed.taskGid, gid);
    assert.equal(parsed.action, "decline");
    assert.equal(parsed.note, "no");
    assert.equal(parsed.sig, "abc");
  });
});
