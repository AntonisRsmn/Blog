const statusEl = document.getElementById("status");
const searchInput = document.getElementById("pending-search");
const teacherEditorOverlay = document.getElementById("teacher-editor-overlay");
const teacherEditorFrame = document.getElementById("teacher-editor-frame");
const teacherEditorCloseBtn = document.getElementById("teacher-editor-close");
let allPosts = [];

function showStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.className = "admin-status" + (type ? ` ${type}` : "");
}

function normalizeStatus(post) {
  const status = String(post?.approvalStatus || "").trim().toLowerCase();
  if (status === "pending" || status === "rejected") return status;
  return "approved";
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
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

function postMatchesQuery(post, rawQuery) {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return true;

  const title = normalizeSearchValue(post?.title);
  const slug = normalizeSearchValue(post?.slug);
  return title.includes(query) || slug.includes(query);
}

async function ensureTeacherAccess() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    window.location.href = "/no-access.html";
    return false;
  }

  const profile = await res.json();
  const role = String(profile?.role || "").trim().toLowerCase();
  if (role !== "staff" && role !== "uploader" && role !== "teacher") {
    window.location.href = "/no-access.html";
    return false;
  }

  return true;
}

function renderList() {
  const list = document.getElementById("teacher-pending-posts");
  if (!list) return;

  list.innerHTML = "";

  const pendingPosts = [...allPosts]
    .filter(post => normalizeStatus(post) === "pending")
    .filter(post => postMatchesQuery(post, searchInput?.value || ""))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (!pendingPosts.length) {
    list.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No pending posts found</li>';
    return;
  }

  pendingPosts.forEach(post => {
    const li = document.createElement("li");
    li.className = "post-item posts-page-item";
    const safePostId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    const postUrl = `/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    const imageUrl = String(post?.thumbnailUrl || "").trim();
    const submissionBadge = getPendingSubmissionBadgeHtml(post);

    li.innerHTML = `
      <div class="posts-page-main">
        <a href="${postUrl}" aria-label="Open ${post.title || "post"}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${post.title || "Post image"}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </a>
        <div class="posts-page-text">
          <span class="post-item-title">${post.title || "Untitled"}</span>
          <span class="release-event-date">/${post.slug || ""} • Waiting for admin approval</span>
        </div>
      </div>
      <div class="post-item-actions teacher-pending-actions">
        ${submissionBadge}
        <div class="teacher-actions-row">
          <button class="secondary" data-click="openTeacherPostEditor('${safePostId}')">Edit</button>
          <button class="danger" data-click="deletePost('${post._id}')">Διαγραφή</button>
        </div>
      </div>
    `;

    list.appendChild(li);
  });
}

async function loadPosts() {
  const res = await fetch("/api/posts/manage?list=1");
  if (!res.ok) {
    showStatus("Δεν ήταν δυνατή η φόρτωση των αναρτήσεών σας.", "error");
    return;
  }

  const payload = await res.json().catch(() => []);
  allPosts = Array.isArray(payload) ? payload : [];
  renderList();
}

function openTeacherPostEditor(encodedPostId) {
  if (!teacherEditorOverlay || !teacherEditorFrame) {
    showStatus("Δεν ήταν δυνατή η ανοίγματος του ενσωματωμένου editor.", "error");
    return;
  }

  teacherEditorFrame.src = `/admin/posts.html?editId=${encodedPostId}&embed=1`;
  teacherEditorOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeTeacherPostEditor(options = {}) {
  if (!teacherEditorOverlay || !teacherEditorFrame) return;

  teacherEditorOverlay.hidden = true;
  teacherEditorFrame.src = "about:blank";
  document.body.style.overflow = "";

  if (options.refresh) {
    loadPosts();
  }
}

async function deletePost(postId) {
  const confirmed = window.showDeleteConfirm
    ? await window.showDeleteConfirm("Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την ανάρτηση;")
    : window.confirm("Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την ανάρτηση;");
  if (!confirmed) return;

  const response = await fetch("/api/posts/" + postId, { method: "DELETE" });
  if (!response.ok) {
    showStatus("Δεν ήταν δυνατή η διαγραφή της ανάρτησης.", "error");
    return;
  }

  showStatus("Η ανάρτηση διαγράφηκε.", "deleted");
  await loadPosts();
}

window.deletePost = deletePost;
window.openTeacherPostEditor = openTeacherPostEditor;

teacherEditorCloseBtn?.addEventListener("click", () => closeTeacherPostEditor({ refresh: true }));

teacherEditorOverlay?.addEventListener("click", (event) => {
  if (event.target === teacherEditorOverlay) {
    closeTeacherPostEditor({ refresh: true });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && teacherEditorOverlay && !teacherEditorOverlay.hidden) {
    closeTeacherPostEditor({ refresh: true });
  }
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "posts-editor-close") {
    closeTeacherPostEditor({ refresh: Boolean(event.data?.refresh) });
  }
});

(async function init() {
  const ok = await ensureTeacherAccess();
  if (!ok) return;
  searchInput?.addEventListener("input", renderList);
  await loadPosts();
})();
