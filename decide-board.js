(function () {
  const api =
    document.querySelector('meta[name="km-decide-api"]')?.getAttribute("content")?.trim() ||
    "/api/decide";

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

  function wiredFor(item, action) {
    const gid = item.getAttribute("data-task-gid") || "";
    const sig = item.getAttribute("data-sig-" + action) || "";
    return /^\d{5,}$/.test(gid) && /^[0-9a-fA-F]{64}$/.test(sig);
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
      if (action === "other" && permalink) {
        btn.disabled = false;
        btn.title = "Open the Asana task";
        return;
      }
      if (wiredFor(item, action)) {
        btn.disabled = false;
        btn.title = "";
        return;
      }
      btn.disabled = true;
      btn.title =
        action === "other"
          ? "CoS: set data-asana-url (or mint data-sig-other)"
          : "CoS: set data-task-gid and mint data-sig-" + action + " (npm run mint)";
    });
  }

  async function callApi(item, action, extra) {
    const taskGid = item.getAttribute("data-task-gid") || "";
    const sig = item.getAttribute("data-sig-" + action) || "";
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        taskGid,
        action,
        sig,
        actor: extra.actor || undefined,
        note: extra.note || undefined,
      }),
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

  function openAsana(item, permalink) {
    const url = permalink || item.getAttribute("data-asana-url") || "";
    if (url) window.open(url, "_blank", "noopener");
  }

  async function onAction(item, action) {
    if (action === "other") {
      const permalink = item.getAttribute("data-asana-url") || "";
      if (permalink) openAsana(item, permalink);
      if (wiredFor(item, "other")) {
        try {
          const data = await callApi(item, "other", {});
          if (!permalink && data.permalink) openAsana(item, data.permalink);
        } catch (err) {
          if (!permalink) setStatus(item, err.message, "err");
        }
      } else if (!permalink) {
        setStatus(item, "No Asana URL on this card yet.", "err");
      }
      return;
    }

    if (!wiredFor(item, action)) {
      setStatus(item, "This card is waiting for a CoS HMAC signature.", "err");
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
      setStatus(item, data.alreadyCompleted ? done + " (already complete)" : done);
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
