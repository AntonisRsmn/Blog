document.getElementById('year').textContent = new Date().getFullYear();

const listEl = document.getElementById("analytics-categories-list");
const searchEl = document.getElementById("analytics-categories-search");
let allItems = [];

function showStatus(message, type = "") {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("success", "error", "deleted", "show");
  if (type) statusEl.classList.add(type);
  statusEl.classList.add("show");
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().trim();
}

function renderRankLabel(rank) {
  const value = Number(rank || 0);
  if (!Number.isFinite(value) || value < 1) return "-";
  return `${value}.`;
}

function renderList() {
  if (!listEl) return;
  const query = normalizeSearch(searchEl?.value);

  const filtered = !query
    ? allItems
    : allItems.filter(item => normalizeSearch(item?.name).includes(query));

  listEl.innerHTML = "";

  if (!filtered.length) {
    listEl.innerHTML = '<li class="post-item"><span class="release-event-date">No data found.</span></li>';
    return;
  }

  filtered.forEach(item => {
    const li = document.createElement("li");
    li.className = "post-item";

    const rank = document.createElement("span");
    rank.className = "analytics-rank";
    rank.textContent = renderRankLabel(item?.rank);

    const title = document.createElement("span");
    title.className = "post-item-title analytics-item-title";
    title.textContent = item?.name || "UNCATEGORIZED";

    const meta = document.createElement("span");
    meta.className = "release-event-date analytics-item-meta";
    meta.textContent = `${Number(item?.views || 0).toLocaleString()} views`;

    li.appendChild(rank);
    li.appendChild(title);
    li.appendChild(meta);
    listEl.appendChild(li);
  });
}

async function initializePage() {
  try {
    const response = await fetch("/api/posts/manage/analytics/categories");
    if (!response.ok) {
      showStatus("Δεν ήταν δυνατή η φόρτωση κατάταξης κατηγοριών.", "error");
      return;
    }

    const payload = await response.json().catch(() => ({}));
    allItems = Array.isArray(payload?.items) ? payload.items : [];
    renderList();
    showStatus(`Loaded ${allItems.length} ranked categories.`, "success");

    setTimeout(() => {
      const statusEl = document.getElementById("status");
      if (!statusEl) return;
      statusEl.classList.remove("show", "success", "error", "deleted");
      statusEl.textContent = "";
    }, 3000);
  } catch {
    showStatus("Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή.", "error");
  }
}

searchEl?.addEventListener("input", renderList);
initializePage();
