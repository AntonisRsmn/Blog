document.getElementById('year').textContent = new Date().getFullYear();

const topListEl = document.getElementById("search-miss-top-list");
const recentListEl = document.getElementById("search-miss-recent-list");
const searchEl = document.getElementById("search-miss-query");
const totalsEl = document.getElementById("search-miss-totals");

let topItems = [];
let recentItems = [];
const SEARCH_MISS_STORAGE_KEY = 'search-miss-events-v1';

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

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function loadLocalSearchMissPayload(limit = 100, sinceDays = 30) {
  try {
    const raw = localStorage.getItem(SEARCH_MISS_STORAGE_KEY);
    const events = JSON.parse(String(raw || '[]'));
    const items = Array.isArray(events) ? events : [];
    const sinceMs = Date.now() - (Math.max(1, Number(sinceDays) || 30) * 24 * 60 * 60 * 1000);

    const recent = items
      .filter(item => new Date(item?.createdAt || 0).getTime() >= sinceMs)
      .map(item => ({
        query: String(item?.query || item?.normalizedQuery || '').trim(),
        normalizedQuery: String(item?.normalizedQuery || item?.query || '').trim(),
        path: String(item?.path || '/').trim() || '/',
        createdAt: item?.createdAt || null
      }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const group = new Map();
    recent.forEach((item) => {
      const key = String(item.normalizedQuery || item.query || '').trim();
      if (!key) return;
      const existing = group.get(key) || {
        query: item.query || key,
        normalizedQuery: key,
        misses: 0,
        lastSeenAt: null,
        paths: new Set()
      };
      existing.misses += 1;
      const createdAtMs = new Date(item.createdAt || 0).getTime();
      const prevMs = new Date(existing.lastSeenAt || 0).getTime();
      if (!existing.lastSeenAt || createdAtMs > prevMs) {
        existing.lastSeenAt = item.createdAt || null;
      }
      existing.paths.add(item.path || '/');
      group.set(key, existing);
    });

    const topMissingQueries = [...group.values()]
      .sort((a, b) => {
        if (b.misses !== a.misses) return b.misses - a.misses;
        return new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0);
      })
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        query: item.query,
        normalizedQuery: item.normalizedQuery,
        misses: item.misses,
        lastSeenAt: item.lastSeenAt,
        paths: [...item.paths].slice(0, 5)
      }));

    return {
      filters: { limit, sinceDays },
      retentionDays: 0,
      total: recent.length,
      topMissingQueries,
      recent: recent.slice(0, limit)
    };
  } catch {
    return {
      filters: { limit, sinceDays },
      retentionDays: 0,
      total: 0,
      topMissingQueries: [],
      recent: []
    };
  }
}

function renderTopList() {
  if (!topListEl) return;

  const query = normalizeSearch(searchEl?.value);
  const filtered = !query
    ? topItems
    : topItems.filter(item => normalizeSearch(item?.query || item?.normalizedQuery).includes(query));

  topListEl.innerHTML = "";

  if (!filtered.length) {
    topListEl.innerHTML = '<li class="post-item"><span class="release-event-date">No missing search queries in this window.</span></li>';
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
    title.textContent = String(item?.query || item?.normalizedQuery || "").trim() || "(empty)";

    const meta = document.createElement("span");
    meta.className = "release-event-date analytics-item-meta";
    meta.textContent = `${Number(item?.misses || 0).toLocaleString()} misses • Last seen ${formatDate(item?.lastSeenAt)}`;

    li.appendChild(rank);
    li.appendChild(title);
    li.appendChild(meta);

    topListEl.appendChild(li);
  });
}

function renderRecentList() {
  if (!recentListEl) return;
  recentListEl.innerHTML = "";

  if (!recentItems.length) {
    recentListEl.innerHTML = '<li class="post-item"><span class="release-event-date">No recent events yet.</span></li>';
    return;
  }

  recentItems.forEach(item => {
    const li = document.createElement("li");
    li.className = "post-item";

    const title = document.createElement("span");
    title.className = "post-item-title analytics-item-title";
    title.textContent = String(item?.query || item?.normalizedQuery || "").trim() || "(empty)";

    const path = String(item?.path || "").trim() || "/";
    const meta = document.createElement("span");
    meta.className = "release-event-date analytics-item-meta";
    meta.textContent = `${path} • ${formatDate(item?.createdAt)}`;

    li.appendChild(title);
    li.appendChild(meta);
    recentListEl.appendChild(li);
  });
}

async function initializePage() {
  try {
    const response = await fetch('/api/posts/manage/analytics/search_misses?limit=100&sinceDays=30', {
      credentials: 'same-origin'
    });
    let payload;

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const apiMessage = String(errorPayload?.error || '').trim();
      if (response.status === 404) {
        payload = loadLocalSearchMissPayload(100, 30);
        showStatus('Using local fallback search analytics. Restart server to enable shared database analytics.', 'error');
      } else {
        const fallback = response.status === 401 || response.status === 403
          ? 'Staff access required for search analytics.'
          : 'Δεν ήταν δυνατή η φόρτωση αναλυτικών αναζήτησης.';
        showStatus(`${fallback}${apiMessage ? ` (${apiMessage})` : ''}`, 'error');
        return;
      }
    } else {
      payload = await response.json().catch(() => ({}));
    }

    topItems = Array.isArray(payload?.topMissingQueries) ? payload.topMissingQueries : [];
    recentItems = Array.isArray(payload?.recent) ? payload.recent.slice(0, 80) : [];

    if (totalsEl) {
      totalsEl.innerHTML = `
        <div class="post-item analytics-total-card">
          <div class="release-event-date">Total Miss Events (30d)</div>
          <div class="post-item-title analytics-total-value">${Number(payload?.total || 0).toLocaleString()}</div>
        </div>
        <div class="post-item analytics-total-card">
          <div class="release-event-date">Unique Missing Queries</div>
          <div class="post-item-title analytics-total-value">${topItems.length.toLocaleString()}</div>
        </div>
        <div class="post-item analytics-total-card">
          <div class="release-event-date">Retention</div>
          <div class="post-item-title analytics-total-value">${Number(payload?.retentionDays || 120)} days</div>
        </div>
      `;
    }

    renderTopList();
    renderRecentList();
    showStatus('Search analytics loaded.', 'success');

    setTimeout(() => {
      const statusEl = document.getElementById('status');
      if (!statusEl) return;
      statusEl.classList.remove('show', 'success', 'error', 'deleted');
      statusEl.textContent = '';
    }, 3000);
  } catch {
    showStatus('Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή.', 'error');
  }
}

searchEl?.addEventListener('input', renderTopList);
initializePage();
