document.getElementById('year').textContent = new Date().getFullYear();

const pageParams = new URLSearchParams(window.location.search);
const IS_EMBED_EDITOR = pageParams.get("embed") === "1";

if (IS_EMBED_EDITOR) {
  document.body.classList.add("embed-editor-mode");

  const embedStyle = document.createElement("style");
  embedStyle.textContent = `
    body.embed-editor-mode header,
    body.embed-editor-mode footer,
    body.embed-editor-mode #mobile-sidebar,
    body.embed-editor-mode #mobile-sidebar-backdrop,
    body.embed-editor-mode .admin-container {
      display: none !important;
    }

    body.embed-editor-mode main {
      padding: 0 !important;
      margin: 0 !important;
    }

    body.embed-editor-mode #post-edit-overlay {
      position: static !important;
      inset: auto !important;
      background: transparent !important;
      padding: 0 !important;
      display: block !important;
    }

    body.embed-editor-mode #post-edit-overlay .post-edit-modal {
      width: 100% !important;
      max-width: none !important;
      height: 100vh !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      margin: 0 !important;
    }
  `;
  document.head.appendChild(embedStyle);
}

const statusEl = document.getElementById("status");
let allPosts = [];
let postEditor = null;
let isEditingPost = false;
let isSlugManuallyEdited = false;
let currentUserRole = "";
const POST_EDITOR_CATEGORIES_ENABLED = false;

const editOverlay = document.getElementById("post-edit-overlay");
const editForm = document.getElementById("postEditForm");
const editCloseButton = document.getElementById("post-edit-close");
const editCancelButton = document.getElementById("post-edit-cancel");
const editModalTitle = document.getElementById("post-edit-title");
const editTitleInput = document.getElementById("post-edit-title-input");
const editSlugInput = document.getElementById("post-edit-slug");
const editCategoriesInput = document.getElementById("post-edit-categories");
const postEditCategoriesGroup = document.getElementById("post-edit-categories-group");
const editIdInput = document.getElementById("post-edit-id");
const editSummaryInput = document.getElementById("post-edit-summary");
const postEditLinkSuggestionsEl = document.getElementById("post-edit-link-suggestions");
let statusHideTimer = null;
const DEFAULT_POST_IMAGE = "/assets/default-post.svg";
const POSTS_EDITOR_DRAFT_PREFIX = "posts-editor-draft-v1:";
let postsDraftTimer = null;
let postsDraftRestoreInProgress = false;

function getPostsDraftContextId() {
  const id = String(editIdInput?.value || "").trim();
  return id || "new";
}

function getPostsDraftKey(contextId = getPostsDraftContextId()) {
  return `${POSTS_EDITOR_DRAFT_PREFIX}${contextId}`;
}

function parsePostsDraft(raw) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getPostsDraftByContext(contextId = getPostsDraftContextId()) {
  try {
    const raw = localStorage.getItem(getPostsDraftKey(contextId));
    return parsePostsDraft(raw);
  } catch {
    return null;
  }
}

function hasPostsDraftContent(payload) {
  const draft = payload && typeof payload === "object" ? payload : {};
  const hasTitle = String(draft.title || "").trim().length > 0;
  const hasSlug = String(draft.slug || "").trim().length > 0;
  const hasCategories = POST_EDITOR_CATEGORIES_ENABLED && String(draft.categories || "").trim().length > 0;
  const hasSummary = String(draft.metaDescription || "").trim().length > 0;
  const hasBlocks = Array.isArray(draft.content) && draft.content.length > 0;
  return hasTitle || hasSlug || hasCategories || hasSummary || hasBlocks;
}

function toComparablePostsCategories(value) {
  if (!POST_EDITOR_CATEGORIES_ENABLED) return [];
  return parseCategories(value)
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function toComparablePostsBlocks(blocks) {
  return JSON.stringify(Array.isArray(blocks) ? blocks : []);
}

function isPostsDraftDifferentFromBase(draft, baseState) {
  const base = baseState && typeof baseState === "object" ? baseState : null;
  if (!base) return true;

  const draftTitle = String(draft?.title || "").trim();
  const baseTitle = String(base?.title || "").trim();
  if (draftTitle !== baseTitle) return true;

  const draftSlug = String(draft?.slug || "").trim();
  const baseSlug = String(base?.slug || "").trim();
  if (draftSlug !== baseSlug) return true;

  const draftSummary = String(draft?.metaDescription || "").trim();
  const baseSummary = String(base?.metaDescription || "").trim();
  if (draftSummary !== baseSummary) return true;

  const draftCategories = JSON.stringify(toComparablePostsCategories(draft?.categories || ""));
  const baseCategories = JSON.stringify(toComparablePostsCategories(base?.categories || ""));
  if (draftCategories !== baseCategories) return true;

  const draftBlocks = toComparablePostsBlocks(draft?.content);
  const baseBlocks = toComparablePostsBlocks(base?.content);
  return draftBlocks !== baseBlocks;
}

function removePostsDraft(contextId = getPostsDraftContextId()) {
  try {
    localStorage.removeItem(getPostsDraftKey(contextId));
  } catch {
  }
}

async function savePostsEditorDraft() {
  if (postsDraftRestoreInProgress) return;
  if (!editOverlay || editOverlay.hidden) return;
  if (!postEditor) return;

  let blocks = [];
  try {
    const payload = await postEditor.save();
    blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
  } catch {
    return;
  }

  const contextId = getPostsDraftContextId();
  const draft = {
    contextId,
    title: String(editTitleInput?.value || ""),
    slug: String(editSlugInput?.value || ""),
    categories: POST_EDITOR_CATEGORIES_ENABLED ? String(editCategoriesInput?.value || "") : "",
    metaDescription: String(editSummaryInput?.value || ""),
    content: blocks,
    updatedAt: new Date().toISOString()
  };

  if (!hasPostsDraftContent(draft)) {
    removePostsDraft(contextId);
    return;
  }

  try {
    localStorage.setItem(getPostsDraftKey(contextId), JSON.stringify(draft));
  } catch {
  }
}

function schedulePostsEditorDraftAutosave(delayMs = 1200) {
  if (postsDraftRestoreInProgress) return;
  if (postsDraftTimer) {
    clearTimeout(postsDraftTimer);
  }

  postsDraftTimer = setTimeout(() => {
    postsDraftTimer = null;
    savePostsEditorDraft();
  }, Math.max(350, Number(delayMs) || 1200));
}

async function maybeRestorePostsEditorDraft(contextId = getPostsDraftContextId(), baseState = null) {
  const draft = getPostsDraftByContext(contextId);
  if (!draft || !hasPostsDraftContent(draft)) return;
  if (!isPostsDraftDifferentFromBase(draft, baseState)) return;

  const draftDate = draft.updatedAt ? new Date(draft.updatedAt) : null;
  const draftLabel = draftDate && !Number.isNaN(draftDate.getTime())
    ? draftDate.toLocaleString()
    : "recent session";
  const promptText = `Βρέθηκε μη αποθηκευμένο πρόχειρο (${draftLabel}). Να επαναφερθεί;`;
  const shouldRestore = window.showAppConfirm
    ? await window.showAppConfirm(promptText, {
      title: "Restore draft",
      confirmText: "Restore",
      cancelText: "Cancel"
    })
    : window.confirm(promptText);
  if (!shouldRestore) return;

  postsDraftRestoreInProgress = true;
  try {
    if (editTitleInput) editTitleInput.value = String(draft.title || "");
    if (editSlugInput) editSlugInput.value = String(draft.slug || "");
    if (editCategoriesInput) {
      editCategoriesInput.value = POST_EDITOR_CATEGORIES_ENABLED ? String(draft.categories || "") : "";
    }
    if (editSummaryInput) editSummaryInput.value = String(draft.metaDescription || "");
    if (postEditor) {
      await postEditor.render({ blocks: Array.isArray(draft.content) ? draft.content : [] });
    }
    showStatus("Το πρόχειρο επαναφέρθηκε.", "success");
  } finally {
    postsDraftRestoreInProgress = false;
  }
}

function showStatus(message, type) {
  if (!statusEl) return;
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  statusEl.textContent = message;
  statusEl.classList.remove("success", "error", "deleted", "show");
  if (type) statusEl.classList.add(type);
  statusEl.classList.add("show");

  statusHideTimer = setTimeout(() => {
    statusEl.textContent = "";
    statusEl.classList.remove("success", "error", "deleted", "show");
    statusHideTimer = null;
  }, 5000);
}

function normalizePostsSearch(value) {
  return String(value || "").toLowerCase().trim();
}

function toSuggestionTerms(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3);
}

function renderPostEditLinkSuggestions() {
  if (!postEditLinkSuggestionsEl) return;

  const title = String(editTitleInput?.value || "");
  const slug = String(editSlugInput?.value || "");
  const categories = String(editCategoriesInput?.value || "");
  const currentId = String(editIdInput?.value || "").trim();
  const terms = [...new Set([
    ...toSuggestionTerms(title),
    ...toSuggestionTerms(slug),
    ...toSuggestionTerms(categories)
  ])];

  const isApprovedForSuggestions = (post) => {
    const status = String(post?.approvalStatus || "").trim().toLowerCase();
    const isPublished = post?.published === true;
    if (!isPublished) return false;
    if (!status) return true;
    return status === "approved";
  };

  const candidates = (Array.isArray(allPosts) ? allPosts : [])
    .filter(isApprovedForSuggestions)
    .filter(post => String(post?._id || "") !== currentId)
    .map(post => {
      const haystack = normalizePostsSearch(`${post?.title || ""} ${post?.slug || ""} ${(post?.categories || []).join(" ")}`);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { post, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.post?.createdAt || 0) - new Date(a.post?.createdAt || 0);
    })
    .slice(0, 5);

  postEditLinkSuggestionsEl.innerHTML = "";

  if (!terms.length) {
    postEditLinkSuggestionsEl.innerHTML = '<li style="padding: 10px 12px; color: var(--text-muted);">Start typing title/categories to get suggestions.</li>';
    return;
  }

  if (!candidates.length) {
    postEditLinkSuggestionsEl.innerHTML = '<li style="padding: 10px 12px; color: var(--text-muted);">No strong matches yet.</li>';
    return;
  }

  candidates.forEach(({ post, score }) => {
    const li = document.createElement("li");
    li.className = "post-item";
    const safePostId = encodeURIComponent(post?._id || "");
    const safeSlug = encodeURIComponent(post?.slug || "");
    const href = `/post?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    li.innerHTML = `
      <a class="post-item-title" href="${href}" target="_blank" rel="noopener">${post?.title || "Untitled"}</a>
      <span class="release-event-date">/${post?.slug || ""} • relevance ${score}</span>
    `;
    postEditLinkSuggestionsEl.appendChild(li);
  });
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseCategories(value) {
  const normalized = String(value || "")
    .split(",")
    .map(item => item.replace(/\s+/g, " ").trim().toUpperCase())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function collectTextValues(value, result) {
  if (typeof value === "string") {
    result.push(value.replace(/<[^>]*>/g, " "));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTextValues(item, result));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectTextValues(item, result));
  }
}

function generateSummaryFromBlocks(blocks) {
  const values = [];
  collectTextValues(blocks, values);
  const normalized = values
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function extractImageAltText(block) {
  if (!block || block.type !== "image") return "";
  const rawAlt = String(
    block?.data?.alt ||
    block?.data?.caption ||
    block?.data?.file?.alt ||
    ""
  );
  return rawAlt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeRichTextValue(value) {
  const source = String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?o:p\b[^>]*>/gi, " ")
    .replace(/<\/?(?:meta|link|style|xml|w:[^>\s]+|m:[^>\s]+|v:[^>\s]+)\b[^>]*>/gi, "");

  if (!source.trim()) return "";

  const root = document.createElement("div");
  root.innerHTML = source;

  root.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6").forEach((element) => {
    element.insertAdjacentText("afterend", "\n");
  });

  const allowedTags = new Set(["A", "BR", "STRONG", "B", "EM", "I"]);
  const allNodes = Array.from(root.querySelectorAll("*"));

  allNodes.forEach((element) => {
    const tagName = element.tagName.toUpperCase();

    if (tagName === "A") {
      const hrefRaw = String(element.getAttribute("href") || "").trim();
      const isSafeHref = /^(https?:|mailto:|tel:)/i.test(hrefRaw);
      if (!isSafeHref) {
        element.replaceWith(document.createTextNode(element.textContent || ""));
        return;
      }

      element.removeAttribute("style");
      element.removeAttribute("class");
      element.removeAttribute("lang");
      element.setAttribute("href", hrefRaw);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
      return;
    }

    if (!allowedTags.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    element.removeAttribute("style");
    element.removeAttribute("class");
    element.removeAttribute("lang");
  });

  return root.innerHTML
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeListItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        ...item,
        content: normalizeRichTextValue(item.content || item.text || ""),
        items: normalizeListItems(item.items)
      };
    }

    return normalizeRichTextValue(item || "");
  });
}

function normalizeImageAltInBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  return list.map((block) => {
    if (!block || typeof block !== "object") return block;

    if (block.type === "image") {
      const alt = extractImageAltText(block);
      return {
        ...block,
        data: {
          ...(block.data || {}),
          alt,
          caption: normalizeRichTextValue(block?.data?.caption || "")
        }
      };
    }

    if (block.type === "paragraph") {
      return {
        ...block,
        data: {
          ...(block.data || {}),
          text: normalizeRichTextValue(block?.data?.text || "")
        }
      };
    }

    if (block.type === "header") {
      return {
        ...block,
        data: {
          ...(block.data || {}),
          text: normalizeRichTextValue(block?.data?.text || "")
        }
      };
    }

    if (block.type === "quote") {
      return {
        ...block,
        data: {
          ...(block.data || {}),
          text: normalizeRichTextValue(block?.data?.text || ""),
          caption: normalizeRichTextValue(block?.data?.caption || "")
        }
      };
    }

    if (block.type === "list") {
      return {
        ...block,
        data: {
          ...(block.data || {}),
          items: normalizeListItems(block?.data?.items)
        }
      };
    }

    return block;
  });
}

function getMissingImageAltCount(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  return list
    .filter(block => block?.type === "image")
    .filter(block => !extractImageAltText(block))
    .length;
}

async function confirmImageAltReminder(blocks) {
  const missingCount = getMissingImageAltCount(blocks);
  if (!missingCount) return true;

  const noun = missingCount === 1 ? "image is" : "images are";
  const promptText = `${missingCount} ${noun} missing alt text. Add short descriptive alt text to improve SEO and accessibility.`;
  if (window.showAppConfirm) {
    return window.showAppConfirm(promptText, {
      title: "Alt-text reminder",
      confirmText: "Publish anyway",
      cancelText: "Review images"
    });
  }

  return window.confirm(`${promptText} Continue publishing?`);
}

async function ensurePostEditor() {
  if (postEditor) return postEditor;

  postEditor = new EditorJS({
    holder: "posts-editor",
    async onChange() {
      schedulePostsEditorDraftAutosave();
    },
    tools: {
      paragraph: {
        class: Paragraph,
        inlineToolbar: true
      },
      image: {
        class: ImageTool,
        config: {
          uploader: {
            uploadByFile(file) {
              const form = new FormData();
              form.append("image", file);

              return fetch("/api/upload", {
                method: "POST",
                body: form
              })
                .then(res => res.json())
                .then(data => ({
                  success: 1,
                  file: { url: data.url }
                }));
            }
          }
        }
      },
      embed: {
        class: Embed,
        config: {
          services: {
            youtube: true,
            twitter: true
          }
        }
      },
      quote: {
        class: Quote,
        inlineToolbar: true
      },
      list: {
        class: EditorjsList,
        inlineToolbar: true,
        config: {
          defaultStyle: "unordered"
        }
      }
    }
  });

  await postEditor.isReady;
  return postEditor;
}

function openEditModal() {
  if (!editOverlay) return;
  editOverlay.hidden = false;
  document.body.style.overflow = IS_EMBED_EDITOR ? "" : "hidden";
}

async function closeEditModal() {
  if (!editOverlay) return;
  if (postsDraftTimer) {
    clearTimeout(postsDraftTimer);
    postsDraftTimer = null;
  }
  editOverlay.hidden = true;
  document.body.style.overflow = "";
  editForm?.reset();
  editIdInput.value = "";
  isEditingPost = false;
  isSlugManuallyEdited = false;

  if (postEditor) {
    await postEditor.clear();
  }

  if (editModalTitle) editModalTitle.textContent = "New Post";
  const saveButton = document.getElementById("post-edit-save");
  if (saveButton) saveButton.textContent = "Δημιουργία ανάρτησης";
  if (editCancelButton) editCancelButton.textContent = "Cancel";

  if (IS_EMBED_EDITOR && window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "posts-editor-close", refresh: true }, window.location.origin);
  }
}

async function cancelEditAndDiscardDraft() {
  if (postsDraftTimer) {
    clearTimeout(postsDraftTimer);
    postsDraftTimer = null;
  }
  const contextId = getPostsDraftContextId();
  removePostsDraft(contextId);
  await closeEditModal();
}

async function openCreatePostModal() {
  await ensurePostEditor();
  await closeEditModal();
  isEditingPost = false;
  openEditModal();
  await maybeRestorePostsEditorDraft("new");
  renderPostEditLinkSuggestions();
}

async function ensureStaffAccess() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    window.location.href = "/no-access";
    return false;
  }

  const profile = await res.json();
  if (profile.role !== "admin" && profile.role !== "staff") {
    window.location.href = "/no-access";
    return false;
  }

  currentUserRole = String(profile.role || "").toLowerCase();

  return true;
}

function getPostApprovalStatus(post) {
  const status = String(post?.approvalStatus || "").trim().toLowerCase();
  if (status === "pending" || status === "rejected") return status;
  return "approved";
}

function isEditedPendingSubmission(post) {
  return getPostApprovalStatus(post) === "pending" && Boolean(post?.isEditedSubmission);
}

function getPendingSubmissionBadgeHtml(post) {
  if (getPostApprovalStatus(post) !== "pending") return "";
  if (isEditedPendingSubmission(post)) {
    return '<span class="approval-badge submission-badge is-edit">Edit</span>';
  }
  return '<span class="approval-badge submission-badge is-new">New</span>';
}

function getPostApprovalBadge(post) {
  const status = getPostApprovalStatus(post);
  if (status === "pending") {
    return { label: "Pending approval", className: "approval-badge is-pending" };
  }
  if (status === "rejected") {
    return { label: "Rejected", className: "approval-badge is-rejected" };
  }
  return { label: "Approved", className: "approval-badge is-approved" };
}

function getPostModerationBanner(post) {
  const status = getPostApprovalStatus(post);
  if (status === "rejected") {
    return { label: "Rejected", className: "moderation-status-banner is-rejected" };
  }
  if (status === "pending") {
    return { label: "Pending approval", className: "moderation-status-banner is-pending" };
  }
  return { label: "Approved", className: "moderation-status-banner is-approved" };
}

function getPostApprovalInfo(post) {
  const status = getPostApprovalStatus(post);
  if (status === "rejected") {
    const note = String(post?.approvalComment || "").trim();
    return note ? `Rejected: ${note}` : "Rejected by admin";
  }
  if (status === "pending") {
    return isEditedPendingSubmission(post)
      ? "Edited post waiting for admin approval"
      : "Waiting for admin approval";
  }
  return "Approved by admin";
}

async function reviewPost(postId, status, comment) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/approval`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, comment })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showStatus(payload.error || "Δεν ήταν δυνατή η ενημέρωση της κατάστασης έγκρισης.", "error");
    return;
  }

  showStatus(status === "approved" ? "Η ανάρτηση εγκρίθηκε." : "Η ανάρτηση απορρίφθηκε.", status === "approved" ? "success" : "deleted");
  window.dispatchEvent(new CustomEvent("dashboard-pending-count-changed"));
  await loadPosts();
}

window.approvePost = async function approvePost(postId) {
  const confirmed = await window.showAppConfirm?.("Approve this post and publish it now?", {
    title: "Approve post",
    confirmText: "Approve",
    cancelText: "Cancel"
  });
  if (!confirmed) return;

  await reviewPost(postId, "approved", "Approved by admin");
};

window.rejectPost = async function rejectPost(postId) {
  const note = window.showAppPrompt
    ? await window.showAppPrompt("Add a short rejection reason for the staff author (optional):", {
      title: "Reject post",
      placeholder: "Add optional feedback for the staff author",
      defaultValue: "Please revise and resubmit.",
      confirmText: "Reject",
      cancelText: "Cancel",
      confirmClass: "danger"
    })
    : window.prompt("Add a short rejection reason for the staff author (optional):", "Please revise and resubmit.");
  if (note === null) return;

  await reviewPost(postId, "rejected", note);
};

function getFilteredPosts() {
  const latestVisiblePosts = allPosts.filter(post => {
    const status = getPostApprovalStatus(post);
    if (currentUserRole === "staff") {
      return status === "approved" || status === "rejected";
    }
    return status === "approved";
  });
  const query = normalizePostsSearch(document.getElementById("posts-search")?.value);
  if (!query) return latestVisiblePosts;

  return latestVisiblePosts.filter(post => {
    const title = normalizePostsSearch(post.title);
    const slug = normalizePostsSearch(post.slug);
    return title.includes(query) || slug.includes(query);
  });
}

function getPostImageUrl(post) {
  const optimizeCloudinaryThumbUrl = (value, maxWidth = 720) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const uploadPathToken = "/image/upload/";
    const width = Number.isFinite(Number(maxWidth)) && Number(maxWidth) > 0
      ? Number(maxWidth)
      : 720;
    const transformSegment = `f_auto,q_auto,dpr_auto,c_limit,w_${width}`;

    try {
      const parsed = new URL(raw, window.location.origin);
      if (!/(^|\.)res\.cloudinary\.com$/i.test(parsed.hostname)) return parsed.href;
      if (!parsed.pathname.includes(uploadPathToken)) return parsed.href;
      if (parsed.pathname.includes(`${uploadPathToken}${transformSegment}/`)) return parsed.href;

      const pathParts = parsed.pathname.split(uploadPathToken);
      const beforeUpload = pathParts[0] || "";
      const afterUpload = pathParts.slice(1).join(uploadPathToken).replace(/^\/+/, "");
      if (!afterUpload) return parsed.href;

      parsed.pathname = `${beforeUpload}${uploadPathToken}${transformSegment}/${afterUpload}`;
      return parsed.href;
    } catch {
      return raw;
    }
  };

  if (post?.thumbnailUrl) return optimizeCloudinaryThumbUrl(post.thumbnailUrl, 720);
  if (!Array.isArray(post?.content)) return "";
  const imageBlock = post.content.find(block => block?.type === "image");
  const resolved = imageBlock
    ? (imageBlock?.data?.file?.url || imageBlock?.data?.url || imageBlock?.data?.file || "")
    : "";
  return optimizeCloudinaryThumbUrl(resolved || DEFAULT_POST_IMAGE, 720);
}

function renderPostsList() {
  const list = document.getElementById("posts");
  if (!list) return;
  list.innerHTML = "";

  const filtered = getFilteredPosts();
  const hasQuery = Boolean(normalizePostsSearch(document.getElementById("posts-search")?.value));

  if (!filtered.length) {
    list.innerHTML = hasQuery
      ? '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No posts match your search</li>'
      : currentUserRole === "staff"
        ? '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No approved or rejected posts yet</li>'
        : '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No approved posts yet</li>';
    return;
  }

  filtered.forEach(post => {
    const li = document.createElement("li");
    li.className = "post-item posts-page-item";
    const imageUrl = getPostImageUrl(post);
    const safePostId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    const postUrl = `/post?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    const moderationBanner = getPostModerationBanner(post);
    const submissionBadge = getPendingSubmissionBadgeHtml(post);
    const approvalInfo = getPostApprovalInfo(post);
    const status = getPostApprovalStatus(post);
    const adminReviewActions = currentUserRole === "admin" && status === "pending"
      ? `<button class="secondary" data-click="approvePost('${post._id}')">Approve</button>
         <button class="danger" data-click="rejectPost('${post._id}')">Reject</button>`
      : "";
    li.innerHTML = `
      <div class="posts-page-main">
        <a href="${postUrl}" aria-label="Open ${post.title}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${post.title}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </a>
        <div class="posts-page-text">
          <div class="post-title-row">
            <span class="post-item-title">${post.title}</span>
            <span class="post-badge-stack">${submissionBadge}</span>
          </div>
          <span class="release-event-date">/${post.slug} • ${approvalInfo}</span>
        </div>
      </div>
      <div class="post-item-actions status-above-actions">
        <span class="${moderationBanner.className}">${moderationBanner.label}</span>
        <button class="secondary" data-click="editPostById(decodeURIComponent('${safePostId}'))">Edit</button>
        ${adminReviewActions}
        <button class="danger" data-click="deletePost('${post._id}')">Διαγραφή</button>
      </div>
    `;
    list.appendChild(li);
  });
}

async function loadPosts() {
  const res = await fetch("/api/posts/manage?list=1");
  if (!res.ok) {
    showStatus("Δεν ήταν δυνατή η φόρτωση των αναρτήσεων.", "error");
    return;
  }

  const posts = await res.json();
  allPosts = Array.isArray(posts)
    ? [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  renderPostsList();
  renderPostEditLinkSuggestions();
}

async function editPostById(postId) {
  let post = null;

  const res = await fetch("/api/posts/manage/by-id/" + encodeURIComponent(postId));
  if (res.ok) {
    post = await res.json();
  } else {
    const listRes = await fetch("/api/posts/manage");
    if (listRes.ok) {
      const list = await listRes.json();
      if (Array.isArray(list)) {
        post = list.find(item => String(item?._id || "") === String(postId)) || null;
      }
    }
  }

  if (!post) {
    showStatus("Δεν ήταν δυνατή η φόρτωση της ανάρτησης για επεξεργασία.", "error");
    return;
  }

  await ensurePostEditor();

  editIdInput.value = post._id || "";
  isEditingPost = true;
  editTitleInput.value = post.title || "";
  editSlugInput.value = post.slug || "";
  if (editCategoriesInput) {
    editCategoriesInput.value = POST_EDITOR_CATEGORIES_ENABLED && Array.isArray(post.categories)
      ? post.categories.join(", ")
      : "";
  }
  if (editSummaryInput) {
    editSummaryInput.value = String(post.metaDescription || post.excerpt || "").trim() || generateSummaryFromBlocks(post.content || []);
  }
  isSlugManuallyEdited = false;
  if (editModalTitle) editModalTitle.textContent = "Edit Post";
  const saveButton = document.getElementById("post-edit-save");
  if (saveButton) saveButton.textContent = "Ενημέρωση ανάρτησης";
  if (editCancelButton) editCancelButton.textContent = "Cancel Edit";

  await postEditor.render({ blocks: Array.isArray(post.content) ? post.content : [] });
  openEditModal();
  await maybeRestorePostsEditorDraft(String(post._id || postId || ""), {
    title: post.title,
    slug: post.slug,
    categories: POST_EDITOR_CATEGORIES_ENABLED && Array.isArray(post.categories) ? post.categories.join(", ") : "",
    metaDescription: String(post.metaDescription || post.excerpt || "").trim() || generateSummaryFromBlocks(post.content || []),
    content: Array.isArray(post.content) ? post.content : []
  });
  renderPostEditLinkSuggestions();
}

async function deletePost(id) {
  const confirmed = await window.showDeleteConfirm?.("Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την ανάρτηση;");
  if (!confirmed) return;

  const res = await fetch("/api/posts/" + id, { method: "DELETE" });
  if (!res.ok) {
    showStatus("Δεν ήταν δυνατή η διαγραφή της ανάρτησης. Δοκιμάστε ξανά.", "error");
    return;
  }

  showStatus("Η ανάρτηση διαγράφηκε.", "deleted");
  loadPosts();
}

async function openPostFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const postIdToEdit = params.get("editId");
  if (!postIdToEdit) return;

  await editPostById(postIdToEdit);

  params.delete("editId");
  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

document.getElementById("posts-search")?.addEventListener("input", renderPostsList);

editTitleInput?.addEventListener("input", () => {
  if (!isSlugManuallyEdited) {
    editSlugInput.value = toSlug(editTitleInput.value);
  }
  renderPostEditLinkSuggestions();
  schedulePostsEditorDraftAutosave();
});

editSlugInput?.addEventListener("input", () => {
  isSlugManuallyEdited = true;
  renderPostEditLinkSuggestions();
  schedulePostsEditorDraftAutosave();
});

editCategoriesInput?.addEventListener("input", () => {
  if (!POST_EDITOR_CATEGORIES_ENABLED) return;
  renderPostEditLinkSuggestions();
  schedulePostsEditorDraftAutosave();
});

editSummaryInput?.addEventListener("input", () => {
  schedulePostsEditorDraftAutosave();
});

editCloseButton?.addEventListener("click", closeEditModal);
editCancelButton?.addEventListener("click", cancelEditAndDiscardDraft);

editOverlay?.addEventListener("click", event => {
  if (event.target === editOverlay) {
    closeEditModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && editOverlay && !editOverlay.hidden) {
    closeEditModal();
  }
});

editForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!postEditor) return;

  const postId = String(editIdInput.value || "").trim();
  const isUpdate = isEditingPost && !!postId;
  const draftContextToClear = postId || "new";

  let blocks;
  try {
    blocks = await postEditor.save();
  } catch {
    showStatus("Editor content is invalid. Please review the post content and try again.", "error");
    return;
  }
  const normalizedBlocks = normalizeImageAltInBlocks(blocks.blocks);
  const canPublish = await confirmImageAltReminder(normalizedBlocks);
  if (!canPublish) {
    showStatus("Add alt text to image blocks before publishing.", "error");
    return;
  }
  const title = editTitleInput.value.trim();
  const slug = toSlug(editSlugInput.value.trim() || title);
  editSlugInput.value = slug;
  const categories = POST_EDITOR_CATEGORIES_ENABLED ? parseCategories(editCategoriesInput.value) : [];

  const payload = {
    title,
    slug,
    categories,
    excerpt: String(editSummaryInput?.value || "").trim() || generateSummaryFromBlocks(normalizedBlocks),
    metaDescription: String(editSummaryInput?.value || "").trim() || generateSummaryFromBlocks(normalizedBlocks),
    content: normalizedBlocks,
    published: true
  };

  const endpoint = isUpdate ? "/api/posts/" + postId : "/api/posts";
  const method = isUpdate ? "PUT" : "POST";

  const res = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    const fallback = isUpdate ? "Δεν ήταν δυνατή η αποθήκευση αλλαγών της ανάρτησης." : "Δεν ήταν δυνατή η δημιουργία ανάρτησης.";
    showStatus(errorPayload.error || fallback, "error");
    return;
  }

  const savedPost = await res.json().catch(() => ({}));
  const savedStatus = String(savedPost?.approvalStatus || "").toLowerCase();
  const successMessage = !isUpdate && savedStatus === "pending"
    ? "Η ανάρτηση υποβλήθηκε για έγκριση διαχειριστή."
    : isUpdate && currentUserRole === "staff"
      ? "Η ανάρτηση ενημερώθηκε και υποβλήθηκε ξανά για έγκριση."
      : isUpdate
        ? "Η ανάρτηση ενημερώθηκε επιτυχώς."
        : "Η ανάρτηση δημιουργήθηκε επιτυχώς.";

  removePostsDraft(draftContextToClear);
  showStatus(successMessage, "success");
  await closeEditModal();
  await loadPosts();
});

(async function initializePage() {
  const allowed = await ensureStaffAccess();
  if (!allowed) return;
  if (postEditCategoriesGroup) {
    postEditCategoriesGroup.hidden = !POST_EDITOR_CATEGORIES_ENABLED;
  }
  if (!POST_EDITOR_CATEGORIES_ENABLED && editCategoriesInput) {
    editCategoriesInput.value = "";
  }
  await loadPosts();
  await openPostFromQuery();

  if (IS_EMBED_EDITOR) {
    const createButton = document.querySelector('.admin-link-btn-primary');
    if (createButton) createButton.style.display = "none";
  }
})();
