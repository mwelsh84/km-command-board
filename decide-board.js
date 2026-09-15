(function () {
  const api = "/api/decide";

  function statusEl(item) {
    let el = item.querySelector(".decide-status");
    if (!el) {
      el = document.createElement("div");
      el.className = "decide-status";
      item.appendChild(el);
    }
    return el;
  }

  function setStatus(item, text, kind) {
    const el = statusEl(item);
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("err", kind === "err");
  }

  function taskGidOf(item) {
    return item.getAttribute("data-task-gid") || "";
  }

  function hasTaskGid(item) {
    return /^\d{5,}$/.test(taskGidOf(item));
  }

  function inject(item) {
    if (item.querySelector(".decide-actions")) return;
    const row = document.createElement("div");
    row.className = "decide-actions";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Decide");
    [
      ["approve", "Approve"],
      ["decline", "Decline"],
      ["other", "Other"],
    ].forEach(([action, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = action;
      btn.dataset.action = action;
      btn.textContent = label;
      row.appendChild(btn);
    });
    item.appendChild(row);
    const note = document.createElement("div");
    note.className = "decide-status";
    note.hidden = true;
    item.appendChild(note);
    syncDisabled(item);
  }

  function syncDisabled(item) {
    const permalink = item.getAttribute("data-asana-url") || "";
    item.querySelectorAll(".decide-actions button").forEach((btn) => {
      const action = btn.dataset.action;
      if (action === "other") {
        btn.disabled = !permalink;
        btn.title = permalink ? "Open the Asana task" : "CoS: set data-asana-url";
        return;
      }
      if (hasTaskGid(item)) {
        btn.disabled = false;
        btn.title = "";
        return;
      }
      btn.disabled = true;
      btn.title = "CoS: set data-task-gid from the Asana Decide task";
    });
  }

  async function callApi(item, action, extra) {
    const body = { taskGid: taskGidOf(item), action };
    if (action === "decline" && extra.note) body.note = extra.note;
    const res = await fetch(api, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data?.ok) {
      const err = new Error(data?.error || "Decide API failed (" + res.status + ")");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function openAsana(item) {
    const url = item.getAttribute("data-asana-url") || "";
    if (url) window.open(url, "_blank", "noopener");
    return url;
  }

  async function onAction(item, action) {
    if (action === "other") {
      if (!openAsana(item)) setStatus(item, "No Asana URL on this card yet.", "err");
      return;
    }

    if (!hasTaskGid(item)) {
      setStatus(item, "This card is waiting for an Asana task GID.", "err");
      return;
    }

    let note;
    if (action === "decline") {
      note = window.prompt("Optional decline note for Asana (Cancel aborts):", "");
      if (note === null) return;
    }

    item.querySelectorAll(".decide-actions button").forEach((b) => {
      b.disabled = true;
    });
    setStatus(item, action === "approve" ? "Approving…" : "Declining…");

    try {
      const data = await callApi(item, action, { note });
      const done = action === "approve" ? "Approved in Asana" : "Declined in Asana";
      setStatus(item, data.alreadyDecided ? "Already decided in Asana" : done);
      item.classList.add("decided");
    } catch (err) {
      setStatus(item, err.message, "err");
      syncDisabled(item);
    }
  }

  document.querySelectorAll(".item[data-task-gid]").forEach((item) => {
    inject(item);
    item.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn || !item.contains(btn)) return;
      onAction(item, btn.dataset.action);
    });
  });
})();
