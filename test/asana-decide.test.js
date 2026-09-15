import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDecide,
  commentText,
  completionPayload,
  isAlreadyDecided,
  taskInAuthorizedWorkflow,
} from "../lib/asana-decide.js";

const PROJECT = "1215460449693075";
const SECTION = "1215460449693077";
const gid = "1218244286398772";

function authorizedTask(overrides = {}) {
  return {
    gid,
    name: "Asana Advanced",
    completed: false,
    resource_subtype: "default_task",
    permalink_url: `https://app.asana.com/0/0/${gid}/f`,
    memberships: [{ project: { gid: PROJECT }, section: { gid: SECTION } }],
    ...overrides,
  };
}

function mockFetch(task, { completeFails = false, commentFails = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ url, method, body: opts.body });
    if (String(url).includes("/stories")) {
      if (commentFails) {
        return { ok: false, status: 500, json: async () => ({ errors: [{ message: "story fail" }] }) };
      }
      return { ok: true, json: async () => ({ data: { gid: "story" } }) };
    }
    if (method === "PUT") {
      if (completeFails) {
        return { ok: false, status: 400, json: async () => ({ errors: [{ message: "nope" }] }) };
      }
      return { ok: true, json: async () => ({ data: { ...task, completed: true } }) };
    }
    return { ok: true, json: async () => ({ data: task }) };
  };
  return { fetchImpl, calls };
}

function storyTexts(calls) {
  return calls
    .filter((call) => String(call.url).includes("/stories"))
    .map((call) => JSON.parse(call.body).data.text);
}

describe("asana decide payloads", () => {
  it("builds approve / decline comments without a client actor", () => {
    assert.equal(commentText("approve"), "Approved via KM Command Board.");
    assert.equal(commentText("approve", { actor: "Michael" }), "Approved via KM Command Board.");
    assert.equal(commentText("decline"), "Declined via KM Command Board.");
    assert.equal(
      commentText("decline", { note: "Not this quarter.", actor: "Michael" }),
      "Declined via KM Command Board.\n\nNot this quarter."
    );
    assert.throws(() => commentText("other"), /approve or decline/);
  });

  it("completes default tasks and sets approval_status on approval subtype", () => {
    assert.deepEqual(completionPayload({ resource_subtype: "default_task" }, "approve"), {
      completed: true,
    });
    assert.deepEqual(completionPayload({ resource_subtype: "approval" }, "approve"), {
      approval_status: "approved",
    });
    assert.deepEqual(completionPayload({ resource_subtype: "approval" }, "decline"), {
      approval_status: "rejected",
    });
  });

  it("detects already-decided tasks", () => {
    assert.equal(isAlreadyDecided({ completed: true }), true);
    assert.equal(isAlreadyDecided({ completed: false, approval_status: "approved" }), true);
    assert.equal(isAlreadyDecided({ completed: false, approval_status: "rejected" }), true);
    assert.equal(isAlreadyDecided({ completed: false, approval_status: "pending" }), false);
  });

  it("requires the Command Center project and Needs Decision section", () => {
    assert.equal(taskInAuthorizedWorkflow(authorizedTask(), PROJECT, SECTION), true);
    assert.equal(
      taskInAuthorizedWorkflow(
        authorizedTask({
          memberships: [{ project: { gid: "999999999999999" }, section: { gid: SECTION } }],
        }),
        PROJECT,
        SECTION
      ),
      false
    );
    assert.equal(
      taskInAuthorizedWorkflow(
        authorizedTask({
          memberships: [{ project: { gid: PROJECT }, section: { gid: "999999999999999" } }],
        }),
        PROJECT,
        SECTION
      ),
      false
    );
  });
});

describe("applyDecide", () => {
  it("approve updates the task first, then posts one audit comment", async () => {
    const task = authorizedTask();
    const { fetchImpl, calls } = mockFetch(task);
    const result = await applyDecide(
      { taskGid: task.gid, action: "approve" },
      { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
    );
    assert.equal(result.ok, true);
    assert.equal(result.alreadyDecided, false);
    assert.equal(result.completed, true);
    const putIndex = calls.findIndex((call) => call.method === "PUT");
    const storyIndex = calls.findIndex((call) => String(call.url).includes("/stories"));
    assert.ok(putIndex >= 0);
    assert.ok(storyIndex > putIndex);
    assert.equal(storyTexts(calls).length, 1);
    assert.equal(storyTexts(calls)[0], "Approved via KM Command Board.");
    assert.equal(JSON.parse(calls[putIndex].body).data.completed, true);
  });

  it("decline updates the task first, then posts one audit comment with the note", async () => {
    const task = authorizedTask({ gid: "1218244183839107" });
    const { fetchImpl, calls } = mockFetch(task);
    await applyDecide(
      { taskGid: task.gid, action: "decline", note: "Hold send." },
      { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
    );
    assert.equal(storyTexts(calls).length, 1);
    assert.equal(storyTexts(calls)[0], "Declined via KM Command Board.\n\nHold send.");
  });

  it("rejects a task outside the authorized project", async () => {
    const task = authorizedTask({
      memberships: [{ project: { gid: "111111111111111" }, section: { gid: SECTION } }],
    });
    const { fetchImpl, calls } = mockFetch(task);
    await assert.rejects(
      () =>
        applyDecide(
          { taskGid: task.gid, action: "approve" },
          { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
        ),
      (err) => err.status === 403
    );
    assert.equal(calls.some((call) => call.method === "PUT"), false);
    assert.equal(storyTexts(calls).length, 0);
  });

  it("rejects a task outside the authorized Needs Decision section", async () => {
    const task = authorizedTask({
      memberships: [{ project: { gid: PROJECT }, section: { gid: "222222222222222" } }],
    });
    const { fetchImpl, calls } = mockFetch(task);
    await assert.rejects(
      () =>
        applyDecide(
          { taskGid: task.gid, action: "approve" },
          { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
        ),
      (err) => err.status === 403
    );
    assert.equal(storyTexts(calls).length, 0);
  });

  it("does not comment or reverse an already-decided task", async () => {
    const task = authorizedTask({ completed: true, approval_status: "approved" });
    const { fetchImpl, calls } = mockFetch(task);
    const result = await applyDecide(
      { taskGid: task.gid, action: "decline", note: "flip it" },
      { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
    );
    assert.equal(result.alreadyDecided, true);
    assert.equal(result.wrote, false);
    assert.equal(calls.some((call) => call.method === "PUT"), false);
    assert.equal(storyTexts(calls).length, 0);
  });

  it("does not post a success comment when the Asana update fails", async () => {
    const task = authorizedTask();
    const { fetchImpl, calls } = mockFetch(task, { completeFails: true });
    await assert.rejects(
      () =>
        applyDecide(
          { taskGid: task.gid, action: "approve" },
          { token: "pat", fetchImpl, projectGid: PROJECT, sectionGid: SECTION }
        ),
      (err) => err.status === 502
    );
    assert.equal(storyTexts(calls).length, 0);
  });
});
