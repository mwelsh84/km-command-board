const ASANA_API = "https://app.asana.com/api/1.0";

const TASK_FIELDS = [
  "name",
  "completed",
  "resource_subtype",
  "approval_status",
  "permalink_url",
  "memberships.project.gid",
  "memberships.section.gid",
].join(",");

export function asanaToken(env = process.env) {
  return String(env.ASANA_PAT || env.ASANA_TOKEN || "").trim();
}

export function permalinkFor(taskGid, task) {
  if (task?.permalink_url) return task.permalink_url;
  return `https://app.asana.com/0/0/${taskGid}/f`;
}

export function commentText(action, { note } = {}) {
  if (action === "approve") return "Approved via KM Command Board.";
  if (action === "decline") {
    let text = "Declined via KM Command Board.";
    const trimmed = String(note || "").trim();
    if (trimmed) text += `\n\n${trimmed}`;
    return text;
  }
  throw new Error("action must be approve or decline");
}

export function completionPayload(task, action) {
  if (task?.resource_subtype === "approval") {
    return {
      approval_status: action === "approve" ? "approved" : "rejected",
    };
  }
  return { completed: true };
}

function gidOf(resource) {
  if (resource == null) return "";
  if (typeof resource === "string" || typeof resource === "number") {
    return String(resource).trim();
  }
  return String(resource.gid || "").trim();
}

export function isAlreadyDecided(task) {
  if (task?.completed) return true;
  const status = String(task?.approval_status || "").trim().toLowerCase();
  return status === "approved" || status === "rejected";
}

export function taskInAuthorizedWorkflow(task, projectGid, sectionGid) {
  const memberships = Array.isArray(task?.memberships) ? task.memberships : [];
  return memberships.some(
    (membership) =>
      gidOf(membership?.project) === String(projectGid) &&
      gidOf(membership?.section) === String(sectionGid)
  );
}

function publicAsanaError(message) {
  const text = String(message || "Asana request failed");
  if (/bearer|asana_pat|asana_token|authorization/i.test(text)) {
    return "Asana request failed";
  }
  return text;
}

async function asanaFetch(path, { method = "GET", body, token, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${ASANA_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify({ data: body }),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message = publicAsanaError(
      payload?.errors?.[0]?.message || payload?.error || `Asana ${method} failed (${res.status})`
    );
    const err = new Error(message);
    err.status = res.status === 404 ? 404 : res.status === 403 ? 403 : 502;
    err.asanaStatus = res.status;
    throw err;
  }
  return payload?.data;
}

export async function applyDecide(
  { taskGid, action, note },
  { token, fetchImpl = fetch, projectGid, sectionGid } = {}
) {
  const task = await asanaFetch(`/tasks/${taskGid}?opt_fields=${TASK_FIELDS}`, {
    token,
    fetchImpl,
  });
  const permalink = permalinkFor(taskGid, task);

  if (!taskInAuthorizedWorkflow(task, projectGid, sectionGid)) {
    const err = new Error("Task is not in the authorized KM Command Center decision workflow");
    err.status = 403;
    throw err;
  }

  if (isAlreadyDecided(task)) {
    return {
      ok: true,
      alreadyDecided: true,
      action,
      taskGid,
      permalink,
      completed: true,
      wrote: false,
    };
  }

  await asanaFetch(`/tasks/${taskGid}`, {
    method: "PUT",
    body: completionPayload(task, action),
    token,
    fetchImpl,
  });

  await asanaFetch(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: { text: commentText(action, { note }) },
    token,
    fetchImpl,
  });

  return {
    ok: true,
    alreadyDecided: false,
    action,
    taskGid,
    permalink,
    completed: true,
    wrote: true,
  };
}
