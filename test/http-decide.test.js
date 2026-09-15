import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { corsOrigin, parseDecideInput, processDecide } from "../lib/http-decide.js";
import { isAction, isTaskGid } from "../lib/validate.js";

const PROJECT = "1215460449693075";
const SECTION = "1215460449693077";
const gid = "1218244286398772";

function env(extra = {}) {
  return {
    ASANA_PAT: "pat",
    ASANA_COMMAND_CENTER_PROJECT_GID: PROJECT,
    ASANA_NEEDS_DECISION_SECTION_GID: SECTION,
    ...extra,
  };
}

function authorizedTask(overrides = {}) {
  return {
    gid,
    completed: false,
    resource_subtype: "default_task",
    permalink_url: `https://app.asana.com/0/0/${gid}/f`,
    memberships: [{ project: { gid: PROJECT }, section: { gid: SECTION } }],
    ...overrides,
  };
}

function statefulFetch(initialTask) {
  let task = { ...initialTask, memberships: initialTask.memberships };
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ url, method, body: opts.body });
    if (String(url).includes("/stories")) {
      return { ok: true, json: async () => ({ data: { gid: "story" } }) };
    }
    if (method === "PUT") {
      const body = JSON.parse(opts.body).data;
      task = { ...task, completed: true, ...body };
      return { ok: true, json: async () => ({ data: task }) };
    }
    return { ok: true, json: async () => ({ data: task }) };
  };
  return { fetchImpl, calls };
}

describe("validate", () => {
  it("accepts only exact approve/decline actions and numeric GIDs", () => {
    assert.equal(isTaskGid(gid), true);
    assert.equal(isTaskGid(""), false);
    assert.equal(isAction("approve"), true);
    assert.equal(isAction("decline"), true);
    assert.equal(isAction("other"), false);
    assert.equal(isAction("Approve"), false);
    assert.equal(isAction("delete"), false);
  });
});

describe("corsOrigin", () => {
  it("does not allow GitHub Pages or arbitrary vercel.app hosts in production", () => {
    const prod = { NODE_ENV: "production" };
    assert.equal(corsOrigin("https://evil.vercel.app", prod), "");
    assert.equal(corsOrigin("https://km-command-board.vercel.app", prod), "");
    assert.equal(corsOrigin("https://mwelsh84.github.io", prod), "");
    assert.equal(corsOrigin("http://localhost:4173", prod), "");
    assert.equal(corsOrigin("http://127.0.0.1:4173", prod), "");
  });

  it("allows localhost only when NODE_ENV is not production", () => {
    const dev = { NODE_ENV: "development" };
    assert.equal(corsOrigin("http://localhost:4173", dev), "http://localhost:4173");
    assert.equal(corsOrigin("http://127.0.0.1:4173", dev), "http://127.0.0.1:4173");
    assert.equal(corsOrigin("https://evil.vercel.app", dev), "");
    assert.equal(corsOrigin("https://mwelsh84.github.io", dev), "");
  });
});

describe("parseDecideInput", () => {
  it("reads JSON body only and drops client actor", () => {
    const parsed = parseDecideInput({
      body: {
        taskGid: gid,
        action: "decline",
        note: "no",
        actor: "Not Michael",
        sig: "deadbeef",
      },
    });
    assert.equal(parsed.taskGid, gid);
    assert.equal(parsed.action, "decline");
    assert.equal(parsed.note, "no");
    assert.equal("actor" in parsed, false);
    assert.equal("sig" in parsed, false);
  });

  it("does not take taskGid or action from a query string", () => {
    const parsed = parseDecideInput({
      query: { taskGid: gid, action: "approve" },
      body: {},
    });
    assert.equal(parsed.taskGid, "");
    assert.equal(parsed.action, "");
  });
});

describe("processDecide", () => {
  it("rejects a missing task GID", async () => {
    const out = await processDecide({ taskGid: "", action: "approve" }, env(), {
      fetchImpl: async () => {
        throw new Error("Asana should not be called");
      },
    });
    assert.equal(out.status, 400);
    assert.equal(out.json.ok, false);
  });

  it("rejects an invalid action including other", async () => {
    const fetchImpl = async () => {
      throw new Error("Asana should not be called");
    };
    const other = await processDecide({ taskGid: gid, action: "other" }, env(), { fetchImpl });
    assert.equal(other.status, 400);
    const bogus = await processDecide({ taskGid: gid, action: "delete" }, env(), { fetchImpl });
    assert.equal(bogus.status, 400);
  });

  it("rejects a task outside the authorized project", async () => {
    const task = authorizedTask({
      memberships: [{ project: { gid: "111111111111111" }, section: { gid: SECTION } }],
    });
    const out = await processDecide(
      { taskGid: gid, action: "approve" },
      env(),
      {
        fetchImpl: async () => ({ ok: true, json: async () => ({ data: task }) }),
      }
    );
    assert.equal(out.status, 403);
    assert.equal(out.json.ok, false);
  });

  it("rejects a task outside the authorized Needs Decision section", async () => {
    const task = authorizedTask({
      memberships: [{ project: { gid: PROJECT }, section: { gid: "222222222222222" } }],
    });
    const out = await processDecide(
      { taskGid: gid, action: "approve" },
      env(),
      {
        fetchImpl: async () => ({ ok: true, json: async () => ({ data: task }) }),
      }
    );
    assert.equal(out.status, 403);
  });

  it("ignores an arbitrary client actor in the audit comment", async () => {
    const { fetchImpl, calls } = statefulFetch(authorizedTask());
    const parsed = parseDecideInput({
      body: { taskGid: gid, action: "approve", actor: "Definitely Michael" },
    });
    const out = await processDecide(parsed, env(), { fetchImpl });
    assert.equal(out.status, 200);
    const story = calls.find((call) => String(call.url).includes("/stories"));
    const text = JSON.parse(story.body).data.text;
    assert.equal(text, "Approved via KM Command Board.");
    assert.doesNotMatch(text, /Definitely Michael/);
    assert.doesNotMatch(text, /Actor:/);
  });

  it("replays do not create another comment and do not reverse the decision", async () => {
    const { fetchImpl, calls } = statefulFetch(authorizedTask());
    const first = await processDecide({ taskGid: gid, action: "approve" }, env(), { fetchImpl });
    const second = await processDecide(
      { taskGid: gid, action: "decline", note: "reverse it" },
      env(),
      { fetchImpl }
    );
    assert.equal(first.status, 200);
    assert.equal(first.json.alreadyDecided, false);
    assert.equal(second.status, 200);
    assert.equal(second.json.alreadyDecided, true);
    assert.equal(calls.filter((call) => String(call.url).includes("/stories")).length, 1);
    assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
    const putBody = JSON.parse(calls.find((call) => call.method === "PUT").body).data;
    assert.equal(putBody.completed, true);
    assert.equal(putBody.approval_status, undefined);
  });

  it("returns 503 when the Asana token or authorized workflow is missing", async () => {
    const noPat = await processDecide({ taskGid: gid, action: "approve" }, {
      ASANA_COMMAND_CENTER_PROJECT_GID: PROJECT,
      ASANA_NEEDS_DECISION_SECTION_GID: SECTION,
    });
    assert.equal(noPat.status, 503);

    const noWorkflow = await processDecide({ taskGid: gid, action: "approve" }, env({
      ASANA_COMMAND_CENTER_PROJECT_GID: "",
      ASANA_NEEDS_DECISION_SECTION_GID: "",
    }));
    assert.equal(noWorkflow.status, 503);
  });
});
