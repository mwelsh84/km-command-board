import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDecide, commentText, completionPayload } from "../lib/asana-decide.js";

describe("asana decide payloads", () => {
  it("builds approve / decline comments", () => {
    assert.equal(commentText("approve", {}), "Approved via Command");
    assert.equal(
      commentText("approve", { actor: "Michael" }),
      "Approved via Command\n\nActor: Michael"
    );
    assert.equal(commentText("decline", {}), "Declined via Command");
    assert.equal(
      commentText("decline", { note: "Not this quarter." }),
      "Declined via Command\n\nNot this quarter."
    );
    assert.equal(commentText("other", {}), "Opened for discussion via Command");
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
});

describe("applyDecide", () => {
  function mockFetch(task, { completeFails = false } = {}) {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET", body: opts.body });
      if (url.includes("/stories")) {
        return { ok: true, json: async () => ({ data: { gid: "story" } }) };
      }
      if ((opts.method || "GET") === "PUT") {
        if (completeFails) return { ok: false, status: 400, json: async () => ({ errors: [{ message: "nope" }] }) };
        return { ok: true, json: async () => ({ data: task }) };
      }
      return { ok: true, json: async () => ({ data: task }) };
    };
    return { fetchImpl, calls };
  }

  it("approve comments then marks a default_task complete", async () => {
    const task = {
      gid: "1218244286398772",
      name: "Asana Advanced",
      completed: false,
      resource_subtype: "default_task",
      permalink_url: "https://app.asana.com/1/x/project/p/task/1218244286398772",
    };
    const { fetchImpl, calls } = mockFetch(task);
    const result = await applyDecide(
      { taskGid: task.gid, action: "approve", actor: "Michael" },
      { token: "pat", fetchImpl }
    );
    assert.equal(result.ok, true);
    assert.equal(result.completed, true);
    assert.equal(result.permalink, task.permalink_url);
    assert.equal(calls.some((c) => c.url.includes("/stories")), true);
    const put = calls.find((c) => c.method === "PUT");
    assert.equal(JSON.parse(put.body).data.completed, true);
    const story = calls.find((c) => c.url.includes("/stories"));
    assert.match(JSON.parse(story.body).data.text, /Approved via Command/);
  });

  it("decline comments with Declined prefix then completes", async () => {
    const task = {
      gid: "1218244183839107",
      completed: false,
      resource_subtype: "default_task",
      permalink_url: "https://app.asana.com/0/0/1218244183839107/f",
    };
    const { fetchImpl, calls } = mockFetch(task);
    await applyDecide(
      { taskGid: task.gid, action: "decline", note: "Hold send." },
      { token: "pat", fetchImpl }
    );
    const story = calls.find((c) => c.url.includes("/stories"));
    assert.match(JSON.parse(story.body).data.text, /^Declined via Command/);
    assert.match(JSON.parse(story.body).data.text, /Hold send/);
  });

  it("other returns permalink and does not complete or comment", async () => {
    const task = {
      gid: "1218244215193427",
      completed: false,
      resource_subtype: "default_task",
      permalink_url: "https://app.asana.com/1/x/project/p/task/1218244215193427",
    };
    const { fetchImpl, calls } = mockFetch(task);
    const result = await applyDecide(
      { taskGid: task.gid, action: "other" },
      { token: "pat", fetchImpl }
    );
    assert.equal(result.wrote, false);
    assert.equal(result.permalink, task.permalink_url);
    assert.equal(calls.some((c) => c.url.includes("/stories")), false);
    assert.equal(calls.some((c) => c.method === "PUT"), false);
  });

  it("skips complete when the task is already done", async () => {
    const task = {
      gid: "1",
      completed: true,
      resource_subtype: "default_task",
      permalink_url: "https://app.asana.com/0/0/1/f",
    };
    const { fetchImpl, calls } = mockFetch(task);
    const result = await applyDecide(
      { taskGid: "11111", action: "approve" },
      { token: "pat", fetchImpl }
    );
    assert.equal(result.alreadyCompleted, true);
    assert.equal(calls.some((c) => c.method === "PUT"), false);
  });
});
