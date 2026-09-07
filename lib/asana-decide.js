const ASANA_API = "https://app.asana.com/api/1.0";

export function asanaToken(env = process.env) {
  return String(env.ASANA_PAT || env.ASANA_TOKEN || "").trim();
}

export function permalinkFor(taskGid, task) {
  if (task?.permalink_url) return task.permalink_url;
  return `https://app.asana.com/0/0/${taskGid}/f`;
}

export function commentText(action, { actor, note } = {}) {
  let text;
  if (action === "approve") text = "Approved via Command";
  else if (action === "decline") {
    text = "Declined via Command";
    const trimmed = String(note || "").trim();
    if (trimmed) text += `\n\n${trimmed}`;
  } else text = "Opened for discussion via Command";

  const who = String(actor || "").trim();
  if (who) text += `\n\nActor: ${who.slice(0, 80)}`;
  return text;
}

export function completionPayload(task, action) {
  if (task?.resource_subtype === "approval") {
    return {
      approval_status: action === "approve" ? "approved" : "rejected",
    };
  }
  return { completed: true };
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
    const message =
      payload?.errors?.[0]?.message ||
      payload?.error ||
      `Asana ${method} ${path} failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status === 404 ? 404 : 502;
    err.asanaStatus = res.status;
    throw err;
  }
  return payload?.data;
}

export async function applyDecide(
  { taskGid, action, actor, note },
  { token, fetchImpl = fetch } = {}
) {
  const task = await asanaFetch(
    `/tasks/${taskGid}?opt_fields=name,completed,resource_subtype,approval_status,permalink_url`,
    { token, fetchImpl }
  );
  const permalink = permalinkFor(taskGid, task);

  if (action === "other") {
    return {
      ok: true,
      action,
      taskGid,
      permalink,
      completed: Boolean(task.completed),
      wrote: false,
    };
  }

  await asanaFetch(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: { text: commentText(action, { actor, note }) },
    token,
    fetchImpl,
  });

  if (!task.completed) {
    await asanaFetch(`/tasks/${taskGid}`, {
      method: "PUT",
      body: completionPayload(task, action),
      token,
      fetchImpl,
    });
  }

  return {
    ok: true,
    action,
    taskGid,
    permalink,
    completed: true,
    alreadyCompleted: Boolean(task.completed),
    wrote: true,
  };
}
