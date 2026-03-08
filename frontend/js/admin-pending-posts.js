document.getElementById('year').textContent = new Date().getFullYear();

const statusEl = document.getElementById("status");
const pendingSearchInput = document.getElementById("pending-search");
const adminEditorOverlay = document.getElementById("admin-editor-overlay");
const adminEditorFrame = document.getElementById("admin-editor-frame");
const adminEditorCloseBtn = document.getElementById("admin-editor-close");
let allPosts = [];
let pendingPostsRefreshTimer = null;
let pendingPostsRefreshInFlight = false;
const PENDING_POSTS_REFRESH_MS = 15000;

function showStatus(message, kind = "success") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `admin-status show ${kind}`;
}

async function ensureAdminAccess() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    window.location.href = "/no-access.html";
    return false;
  }

  const profile = await res.json();
  if (String(profile?.role || "").toLowerCase() !== "admin") {
    window.location.href = "/no-access.html";
    return false;
  }

  document.body.classList.add("is-admin");

  return true;
}

function normalizeStatus(post) {
  const status = String(post?.approvalStatus || "").trim().toLowerCase();
  if (status === "pending" || status === "rejected") return status;
  return "approved";
}

function isEditedPendingSubmission(post) {
  return normalizeStatus(post) === "pending" && Boolean(post?.isEditedSubmission);
}

function getPendingSubmissionBadgeHtml(post) {
  if (normalizeStatus(post) !== "pending") return "";
  if (isEditedPendingSubmission(post)) {
    return '<button class="secondary submission-state-btn is-edit" type="button" disabled aria-disabled="true">Edit</button>';
  }
  return '<button class="secondary submission-state-btn is-new" type="button" disabled aria-disabled="true">New</button>';
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function postMatchesPendingQuery(post, rawQuery) {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return true;

  const title = normalizeSearchValue(post?.title);
  const author = normalizeSearchValue(post?.author);
  const slug = normalizeSearchValue(post?.slug);
  return title.includes(query) || author.includes(query) || slug.includes(query);
}

function getPostImageUrl(post) {
  if (post?.thumbnailUrl) return String(post.thumbnailUrl);
  if (!Array.isArray(post?.content)) return "";

  const imageBlock = post.content.find(block => block?.type === "image");
  if (!imageBlock) return "";

  return String(imageBlock?.data?.file?.url || imageBlock?.data?.url || imageBlock?.data?.file || "");
}

async function reviewPost(postId, status, comment) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/approval`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, comment })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showStatus(payload.error || "Δεν ήταν δυνατή η ενημέρωση της κατάστασης έγκρισης.", "error");
    return false;
  }

  showStatus(status === "approved" ? "Η ανάρτηση εγκρίθηκε." : "Η ανάρτηση απορρίφθηκε.", "success");
  window.dispatchEvent(new CustomEvent("dashboard-pending-count-changed"));
  await loadPendingPosts();
  return true;
}

async function approvePost(postId) {
  await reviewPost(postId, "approved", "");
}

async function rejectPost(postId) {
  const comment = window.showTextPrompt
    ? await window.showTextPrompt("Reason for rejection (optional):", {
      title: "Reject post",
      placeholder: "Feedback for staff...",
      confirmText: "Reject",
      cancelText: "Cancel",
      maxLength: 240
    })
    : window.prompt("Reason for rejection (optional):", "");

  if (comment === null || comment === undefined) return;
  await reviewPost(postId, "rejected", String(comment || ""));
}

function renderPendingPosts() {
  const list = document.getElementById("pending-posts");
  if (!list) return;

  list.innerHTML = "";

  const pendingPosts = [...allPosts]
    .filter(post => normalizeStatus(post) === "pending")
    .filter(post => postMatchesPendingQuery(post, pendingSearchInput?.value || ""))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  if (!pendingPosts.length) {
    list.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No pending posts</li>';
    return;
  }

  pendingPosts.forEach(post => {
    const safeId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    const submissionBadge = getPendingSubmissionBadgeHtml(post);
    const imageUrl = getPostImageUrl(post);
    const item = document.createElement("li");
    item.className = "post-item events-page-item";
    item.innerHTML = `
      <div class="posts-page-main">
        <a href="/post.html?id=${safeId}${safeSlug ? `&slug=${safeSlug}` : ""}" aria-label="Open ${post.title || "Untitled"}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${post.title || "Untitled"}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </a>
        <div class="posts-page-text">
          <div class="post-title-row">
            <a class="post-item-title" href="/post.html?id=${safeId}${safeSlug ? `&slug=${safeSlug}` : ""}">${post.title || "Untitled"}</a>
          </div>
          <span class="release-event-date">by ${post.author || "Unknown"} • /${post.slug || ""}</span>
        </div>
      </div>
      <div class="post-item-actions">
        <div class="pending-action-stack">
          ${submissionBadge}
          <button class="secondary" data-click="openAdminPostEditor('${safeId}')">Review/Edit</button>
        </div>
        <div class="pending-action-stack">
          <button class="secondary" data-click="approvePost('${post._id}')">Approve</button>
          <button class="danger" data-click="rejectPost('${post._id}')">Reject</button>
        </div>
      </div>
    `;
    list.appendChild(item);
  });
}

function openAdminPostEditor(encodedPostId) {
  if (!adminEditorOverlay || !adminEditorFrame) {
    showStatus("Δεν ήταν δυνατή η ανοίγματος του ενσωματωμένου editor.", "error");
    return;
  }

  adminEditorFrame.src = `/admin/posts.html?editId=${encodedPostId}&embed=1`;
  adminEditorOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeAdminPostEditor(options = {}) {
  if (!adminEditorOverlay || !adminEditorFrame) return;

  adminEditorOverlay.hidden = true;
  adminEditorFrame.src = "about:blank";
  document.body.style.overflow = "";

  if (options.refresh) {
    loadPendingPosts();
  }
}

async function loadPendingPosts() {
  if (pendingPostsRefreshInFlight) return;
  pendingPostsRefreshInFlight = true;

  try {
    const response = await fetch("/api/posts/manage?list=1");
    if (!response.ok) {
      showStatus("Δεν ήταν δυνατή η φόρτωση των αναρτήσεων.", "error");
      return;
    }

    const payload = await response.json().catch(() => []);
    allPosts = Array.isArray(payload) ? payload : [];
    renderPendingPosts();
  } finally {
    pendingPostsRefreshInFlight = false;
  }
}

function initializePendingPostsAutoRefresh() {
  if (pendingPostsRefreshTimer) return;

  const refreshIfVisible = () => {
    if (document.hidden) return;
    loadPendingPosts();
  };

  pendingPostsRefreshTimer = window.setInterval(refreshIfVisible, PENDING_POSTS_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    loadPendingPosts();
  });

  window.addEventListener("focus", () => {
    loadPendingPosts();
  });

  window.addEventListener("beforeunload", () => {
    if (!pendingPostsRefreshTimer) return;
    window.clearInterval(pendingPostsRefreshTimer);
    pendingPostsRefreshTimer = null;
  });
}

window.openAdminPostEditor = openAdminPostEditor;

adminEditorCloseBtn?.addEventListener("click", () => closeAdminPostEditor({ refresh: true }));

adminEditorOverlay?.addEventListener("click", (event) => {
  if (event.target === adminEditorOverlay) {
    closeAdminPostEditor({ refresh: true });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminEditorOverlay && !adminEditorOverlay.hidden) {
    closeAdminPostEditor({ refresh: true });
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "posts-editor-close") {
    closeAdminPostEditor({ refresh: Boolean(event.data?.refresh) });
  }
});

(async function init() {
  const allowed = await ensureAdminAccess();
  if (!allowed) return;

  pendingSearchInput?.addEventListener("input", () => {
    renderPendingPosts();
  });

  await loadPendingPosts();
  initializePendingPostsAutoRefresh();
})();
