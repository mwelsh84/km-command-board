import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalMessage, isAction, isTaskGid, sign, verify } from "../lib/hmac.js";

describe("hmac", () => {
  const secret = "test-secret-do-not-use-in-prod";

  it("signs taskGid:action as hex HMAC-SHA256", () => {
    const sig = sign("1218244286398772", "approve", secret);
    assert.match(sig, /^[0-9a-f]{64}$/);
    assert.equal(canonicalMessage("1218244286398772", "approve"), "1218244286398772:approve");
    assert.equal(verify("1218244286398772", "approve", sig, secret), true);
  });

  it("rejects a signature for a different action or task", () => {
    const sig = sign("1218244286398772", "approve", secret);
    assert.equal(verify("1218244286398772", "decline", sig, secret), false);
    assert.equal(verify("1218244215193427", "approve", sig, secret), false);
    assert.equal(verify("1218244286398772", "approve", "00".repeat(32), secret), false);
    assert.equal(verify("1218244286398772", "approve", "not-hex", secret), false);
  });

  it("validates gid and action shape", () => {
    assert.equal(isTaskGid("1218244286398772"), true);
    assert.equal(isTaskGid(""), false);
    assert.equal(isTaskGid("YOUR_TASK_GID"), false);
    assert.equal(isAction("approve"), true);
    assert.equal(isAction("decline"), true);
    assert.equal(isAction("other"), true);
    assert.equal(isAction("delete"), false);
  });
});
