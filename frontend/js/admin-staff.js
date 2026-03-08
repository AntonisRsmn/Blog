document.getElementById("year").textContent = new Date().getFullYear();

const statusEl = document.getElementById("status");
const listEl = document.getElementById("staffList");
const adminListEl = document.getElementById("adminList");
const formEl = document.getElementById("staffForm");
const emailInput = document.getElementById("staffEmail");
const searchInput = document.getElementById("staffSearch");
let refreshTimer;
let allEntries = [];
let statusHideTimer = null;
const STAFF_REFRESH_INTERVAL_MS = 30000;
const STAFF_MIN_FETCH_GAP_MS = 5000;
let lastStaffFetchAt = 0;
let inFlightStaffRequest = null;

function showStatus(message, type) {
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("success", "error", "show");
  if (type) statusEl.classList.add(type);
  statusEl.classList.add("show");

  statusHideTimer = setTimeout(() => {
    statusEl.textContent = "";
    statusEl.classList.remove("success", "error", "show");
    statusHideTimer = null;
  }, 5000);
}

function clearStatus() {
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  statusEl.textContent = "";
  statusEl.classList.remove("success", "error", "show");
}

function getDisplayName(entry) {
  const firstName = entry.user?.firstName || "";
  const lastName = entry.user?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || "—";
}

function entryMatchesQuery(entry, rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) return true;

  const fullName = `${entry.user?.firstName || ""} ${entry.user?.lastName || ""}`.trim().toLowerCase();
  const username = String(entry.user?.username || "").toLowerCase();
  const email = String(entry.email || "").toLowerCase();
  const role = String(entry.role || "").toLowerCase();

  return fullName.includes(query) || username.includes(query) || email.includes(query) || role.includes(query);
}

function createRow(entry, options = {}) {
  const readOnly = Boolean(options.readOnly);
  const item = document.createElement("li");
  item.className = "post-item staff-list-item";

  const meta = document.createElement("div");
  meta.className = "staff-entry-main";

  const nameEl = document.createElement("div");
  nameEl.className = "staff-entry-name";
  nameEl.textContent = getDisplayName(entry);

  const headRow = document.createElement("div");
  headRow.className = "staff-entry-head";

  const emailEl = document.createElement("span");
  emailEl.className = "staff-entry-email";
  emailEl.textContent = entry.email;

  const roleEl = document.createElement("span");
  const isStaffRole = entry.role === "staff";
  roleEl.className = `staff-role-badge ${isStaffRole ? "is-staff" : "is-admin"}`;
  roleEl.textContent = isStaffRole ? "Staff" : "Admin";

  meta.appendChild(nameEl);
  headRow.appendChild(emailEl);
  headRow.appendChild(roleEl);
  meta.appendChild(headRow);

  if (readOnly) {
    item.appendChild(meta);
    return item;
  }

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const postAccessBtn = document.createElement("button");
  postAccessBtn.type = "button";
  postAccessBtn.className = `staff-post-toggle${entry.canPost ? " danger" : ""}`;
  postAccessBtn.textContent = entry.canPost ? "Remove Access" : "Grant Access";
  postAccessBtn.disabled = entry.source === "env";

  postAccessBtn.addEventListener("click", async () => {
    clearStatus();

    const nextCanPost = !entry.canPost;
    const confirmed = await window.showAppConfirm?.(
      nextCanPost
        ? "Grant access for this account?"
        : "Remove access for this account?",
      {
        title: nextCanPost ? "Grant access" : "Remove access",
        confirmText: nextCanPost ? "Grant" : "Remove",
        cancelText: "Cancel",
        confirmClass: nextCanPost ? "" : "danger"
      }
    );
    if (!confirmed) return;

    const res = await fetch(`/api/staff/${encodeURIComponent(entry.email)}/post-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canPost: nextCanPost })
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      showStatus(payload.error || "Δεν ήταν δυνατή η ενημέρωση της πρόσβασης.", "error");
      return;
    }

    showStatus(nextCanPost ? "Access granted." : "Access removed.", "success");
    await loadStaffEntries({ force: true });
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "secondary";
  removeBtn.textContent = "Remove";
  removeBtn.disabled = entry.source === "env";

  removeBtn.addEventListener("click", async () => {
    clearStatus();

    const confirmed = await window.showDeleteConfirm?.("Are you sure you want to remove this staff email?");
    if (!confirmed) return;

    const res = await fetch(`/api/staff/${encodeURIComponent(entry.email)}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      showStatus(payload.error || "Δεν ήταν δυνατή η αφαίρεση email.", "error");
      return;
    }

    showStatus("Staff email removed.", "success");
    await loadStaffEntries({ force: true });
  });

  actions.appendChild(postAccessBtn);
  actions.appendChild(removeBtn);
  item.appendChild(meta);
  item.appendChild(actions);
  return item;
}

function renderEntries(entries) {
  const filtered = entries.filter(entry => entryMatchesQuery(entry, searchInput?.value || ""));

  const adminEntries = filtered.filter(entry => String(entry.role || "").toLowerCase() === "admin");
  const staffEntries = filtered.filter(entry => String(entry.role || "").toLowerCase() !== "admin");

  adminListEl.innerHTML = "";
  if (!adminEntries.length) {
    adminListEl.innerHTML = '<li class="post-item"><div class="post-main"><strong>No admin accounts found.</strong></div></li>';
  } else {
    adminEntries.forEach(entry => {
      adminListEl.appendChild(createRow(entry, { readOnly: true }));
    });
  }

  if (!staffEntries.length) {
    listEl.innerHTML = '<li class="post-item"><div class="post-main"><strong>No matching staff entries.</strong></div></li>';
    return;
  }

  listEl.innerHTML = "";
  staffEntries.forEach(entry => {
    listEl.appendChild(createRow(entry));
  });
}

async function loadStaffEntries(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();

  if (!force && inFlightStaffRequest) {
    return inFlightStaffRequest;
  }

  if (!force && allEntries.length && now - lastStaffFetchAt < STAFF_MIN_FETCH_GAP_MS) {
    renderEntries(allEntries);
    return;
  }

  inFlightStaffRequest = (async () => {
    const res = await fetch("/api/staff", { cache: "no-cache" });
    if (res.status === 304) {
      lastStaffFetchAt = Date.now();
      renderEntries(allEntries);
      return;
    }

    if (!res.ok) {
      listEl.innerHTML = '<li class="post-item"><div class="post-main"><strong>Unable to load staff list.</strong></div></li>';
      return;
    }

    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    allEntries = entries;
    lastStaffFetchAt = Date.now();

    if (!entries.length) {
      listEl.innerHTML = '<li class="post-item"><div class="post-main"><strong>No staff emails configured.</strong></div></li>';
      return;
    }

    renderEntries(entries);
  })();

  try {
    await inFlightStaffRequest;
  } finally {
    inFlightStaffRequest = null;
  }
}

formEl.addEventListener("submit", async e => {
  e.preventDefault();
  clearStatus();

  const email = emailInput.value.trim().toLowerCase();
  if (!email) return;

  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    showStatus(payload.error || "Δεν ήταν δυνατή η προσθήκη εγγραφής πρόσβασης.", "error");
    return;
  }

  emailInput.value = "";
  showStatus("Staff entry added. Post access is OFF by default.", "success");
  await loadStaffEntries({ force: true });
});

searchInput?.addEventListener("input", () => {
  renderEntries(allEntries);
});

async function initialize() {
  await loadStaffEntries({ force: true });
  refreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadStaffEntries();
  }, STAFF_REFRESH_INTERVAL_MS);
}

window.addEventListener("beforeunload", () => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});

initialize();
