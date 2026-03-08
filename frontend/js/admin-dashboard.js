document.getElementById('year').textContent = new Date().getFullYear();

function updateThemeLabel() {
  const label = document.getElementById('theme-label');
  const mode = document.documentElement.getAttribute('data-theme') || 'light';
  if (label) {
    label.textContent = mode === 'dark' ? 'Dark' : 'Light';
  }
}
window.addEventListener('DOMContentLoaded', updateThemeLabel);

async function ensureStaffAccess() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    window.location.href = "/no-access.html";
    return false;
  }

  const profile = await res.json();
  if (profile.role !== "admin" && profile.role !== "staff") {
    window.location.href = "/no-access.html";
    return false;
  }

  currentUserRole = String(profile.role || "").toLowerCase();
  document.body.classList.toggle("is-admin", currentUserRole === "admin");
  document.body.classList.toggle("is-staff", currentUserRole === "staff");
  setDashboardTitleForRole(currentUserRole);
  return true;
}

function setDashboardTitleForRole(role) {
  const normalizedRole = String(role || "").toLowerCase();
  const dashboardLabel = normalizedRole === "admin" ? "Admin" : "Teacher";
  const fullTitle = `${dashboardLabel} Dashboard`;
  document.title = fullTitle;
  if (dashboardTitleEl) {
    dashboardTitleEl.textContent = fullTitle;
  }
}

let isEditing = false;
let availableCategories = [];
let selectedCategories = [];
let categoryDeletePermissions = new Map();
let allDashboardPosts = [];
let releaseEditPostId = null;
let currentUserRole = "";
const POST_EDITOR_CATEGORIES_ENABLED = false;
const DASHBOARD_POST_LIMIT = 10;
const DASHBOARD_PENDING_PREVIEW_LIMIT = 10;
const DASHBOARD_RELEASE_LIMIT = 10;
const DASHBOARD_CATEGORY_LIMIT = 10;
const DASHBOARD_FEATURED_LIMIT = 6;
const DASHBOARD_PENDING_REFRESH_MS = 15000;
const dashboardTitleEl = document.querySelector(".admin-title");
const statusEl = document.getElementById("status");
const pendingSection = document.getElementById("dashboard-pending-section");
const staffPendingSection = document.getElementById("dashboard-staff-pending-section");
const dashboardEditOverlay = document.getElementById("dashboard-edit-overlay");
const dashboardEditClose = document.getElementById("dashboard-edit-close");
const dashboardPostEditTitle = document.getElementById("dashboard-post-edit-title");
const dashboardPostCategoriesGroup = document.getElementById("dashboard-post-categories-group");
const releaseEditOverlay = document.getElementById("release-edit-overlay");
const releaseEditClose = document.getElementById("release-edit-close");
const releaseEditTitle = document.getElementById("release-edit-title");
const featuredEditOverlay = document.getElementById("featured-edit-overlay");
const featuredEditClose = document.getElementById("featured-edit-close");
const featuredEditTitle = document.getElementById("featured-edit-title");
const categoryEditOverlay = document.getElementById("category-edit-overlay");
const categoryEditClose = document.getElementById("category-edit-close");
const categoryEditTitle = document.getElementById("category-edit-title");
const categoryOldNameInput = document.getElementById("category-old-name");
const categoryNameInput = document.getElementById("category-name-input");
const saveCategoryButton = document.getElementById("save-category-btn");
const dashboardNewCategoryButton = document.getElementById("dashboard-new-category-btn");
const postSummaryInput = document.getElementById("post-summary");
const dashboardLinkSuggestionsEl = document.getElementById("dashboard-link-suggestions");
let featuredDashboardPosts = [];
let statusHideTimer = null;
let dashboardPendingRefreshTimer = null;
let dashboardPostsRefreshInFlight = false;
const DEFAULT_POST_IMAGE = "/assets/default-post.svg";
const DASHBOARD_DRAFT_PREFIX = "dashboard-post-draft-v1:";
let dashboardDraftTimer = null;
let dashboardDraftRestoreInProgress = false;

function getDashboardDraftContextId() {
  const postIdInput = document.getElementById("postId");
  const id = String(postIdInput?.value || "").trim();
  return id || "new";
}

function getDashboardDraftKey(contextId = getDashboardDraftContextId()) {
  return `${DASHBOARD_DRAFT_PREFIX}${contextId}`;
}

function parseDashboardDraft(raw) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getDashboardDraftByContext(contextId = getDashboardDraftContextId()) {
  try {
    const key = getDashboardDraftKey(contextId);
    const raw = localStorage.getItem(key);
    return parseDashboardDraft(raw);
  } catch {
    return null;
  }
}

function hasDashboardDraftContent(payload) {
  const draft = payload && typeof payload === "object" ? payload : {};
  const hasTitle = String(draft.title || "").trim().length > 0;
  const hasSlug = String(draft.slug || "").trim().length > 0;
  const hasSummary = String(draft.metaDescription || "").trim().length > 0;
  const hasCategories = POST_EDITOR_CATEGORIES_ENABLED && Array.isArray(draft.categories) && draft.categories.length > 0;
  const hasBlocks = Array.isArray(draft.content) && draft.content.length > 0;
  return hasTitle || hasSlug || hasSummary || hasCategories || hasBlocks;
}

function toComparableDashboardCategories(values) {
  return sortCategories(Array.isArray(values) ? values : []);
}

function toComparableDashboardBlocks(blocks) {
  return JSON.stringify(Array.isArray(blocks) ? blocks : []);
}

function isDashboardDraftDifferentFromBase(draft, baseState) {
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

  const draftCategories = JSON.stringify(toComparableDashboardCategories(draft?.categories));
  const baseCategories = JSON.stringify(toComparableDashboardCategories(base?.categories));
  if (draftCategories !== baseCategories) return true;

  const draftBlocks = toComparableDashboardBlocks(draft?.content);
  const baseBlocks = toComparableDashboardBlocks(base?.content);
  return draftBlocks !== baseBlocks;
}

function removeDashboardDraft(contextId = getDashboardDraftContextId()) {
  try {
    localStorage.removeItem(getDashboardDraftKey(contextId));
  } catch {
  }
}

async function saveDashboardDraft() {
  if (dashboardDraftRestoreInProgress) return;
  if (!dashboardEditOverlay || dashboardEditOverlay.hidden) return;

  const postIdInput = document.getElementById("postId");
  const titleInput = document.getElementById("title");
  const slugInput = document.getElementById("slug");
  if (!postIdInput || !titleInput || !slugInput) return;

  let contentBlocks = [];
  try {
    const editorPayload = await editor.save();
    contentBlocks = Array.isArray(editorPayload?.blocks) ? editorPayload.blocks : [];
  } catch {
    return;
  }

  const contextId = getDashboardDraftContextId();
  const draft = {
    contextId,
    title: String(titleInput.value || ""),
    slug: String(slugInput.value || ""),
    metaDescription: String(postSummaryInput?.value || ""),
    categories: POST_EDITOR_CATEGORIES_ENABLED && Array.isArray(selectedCategories) ? [...selectedCategories] : [],
    content: contentBlocks,
    updatedAt: new Date().toISOString()
  };

  if (!hasDashboardDraftContent(draft)) {
    removeDashboardDraft(contextId);
    return;
  }

  try {
    localStorage.setItem(getDashboardDraftKey(contextId), JSON.stringify(draft));
  } catch {
  }
}

function scheduleDashboardDraftAutosave(delayMs = 1200) {
  if (dashboardDraftRestoreInProgress) return;
  if (dashboardDraftTimer) {
    clearTimeout(dashboardDraftTimer);
  }

  dashboardDraftTimer = setTimeout(() => {
    dashboardDraftTimer = null;
    saveDashboardDraft();
  }, Math.max(350, Number(delayMs) || 1200));
}

async function maybeRestoreDashboardDraft(contextId = getDashboardDraftContextId(), baseState = null) {
  const draft = getDashboardDraftByContext(contextId);
  if (!draft || !hasDashboardDraftContent(draft)) return;
  if (!isDashboardDraftDifferentFromBase(draft, baseState)) return;

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

  dashboardDraftRestoreInProgress = true;
  try {
    document.getElementById("title").value = String(draft.title || "");
    document.getElementById("slug").value = String(draft.slug || "");
    if (postSummaryInput) {
      postSummaryInput.value = String(draft.metaDescription || "");
    }
    if (POST_EDITOR_CATEGORIES_ENABLED) {
      setSelectedCategories(Array.isArray(draft.categories) ? draft.categories : []);
    } else {
      setSelectedCategories([]);
    }
    await editor.render({ blocks: Array.isArray(draft.content) ? draft.content : [] });
    showStatus("Το πρόχειρο επαναφέρθηκε.", "success");
  } finally {
    dashboardDraftRestoreInProgress = false;
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

function clearStatus() {
  if (!statusEl) return;
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  statusEl.textContent = "";
  statusEl.classList.remove("success", "error", "deleted", "show");
}

function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeCategory(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function sortCategories(values) {
  return [...new Set(values.map(normalizeCategory).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function renderCategoryOptions() {
  const select = document.getElementById("categorySelect");
  if (!select) return;

  const candidates = availableCategories.filter(name => !selectedCategories.includes(name));
  select.innerHTML = '<option value="">Select category</option>';

  candidates.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function renderSelectedCategories() {
  const container = document.getElementById("selectedCategories");
  if (!container) return;

  container.innerHTML = "";
  selectedCategories.forEach(name => {
    const chip = document.createElement("span");
    chip.className = "category-chip";

    const text = document.createElement("span");
    text.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove ${name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      selectedCategories = selectedCategories.filter(category => category !== name);
      renderSelectedCategories();
      renderCategoryOptions();
      scheduleDashboardDraftAutosave();
    });

    chip.appendChild(text);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

function setSelectedCategories(values) {
  selectedCategories = sortCategories(values || []);
  availableCategories = sortCategories([...availableCategories, ...selectedCategories]);
  renderSelectedCategories();
  renderCategoryOptions();
  scheduleDashboardDraftAutosave(700);
}

function addSelectedCategory(name) {
  const normalized = normalizeCategory(name);
  if (!normalized) return;

  if (!selectedCategories.includes(normalized)) {
    selectedCategories.push(normalized);
    selectedCategories = sortCategories(selectedCategories);
  }

  if (!availableCategories.includes(normalized)) {
    availableCategories.push(normalized);
    availableCategories = sortCategories(availableCategories);
  }

  renderSelectedCategories();
  renderCategoryOptions();
  scheduleDashboardDraftAutosave(700);
}

async function loadCategories() {
  try {
    const response = await fetch("/api/categories/manage");
    if (!response.ok) throw new Error("Δεν ήταν δυνατή η φόρτωση κατηγοριών");
    const categories = await response.json();

    const normalized = Array.isArray(categories)
      ? categories
        .map(item => ({
          name: normalizeCategory(item?.name),
          canDelete: Boolean(item?.canDelete)
        }))
        .filter(item => item.name)
      : [];

    categoryDeletePermissions = new Map(normalized.map(item => [item.name, item.canDelete]));
    availableCategories = sortCategories(normalized.map(item => item.name));
  } catch {
    categoryDeletePermissions = new Map();
    availableCategories = [];
  }

  renderCategoryOptions();
  renderDashboardCategories();
}

function renderDashboardCategories() {
  const list = document.getElementById("dashboard-categories");
  if (!list) return;

  list.innerHTML = "";

  if (!availableCategories.length) {
    list.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No categories yet</li>';
    return;
  }

  availableCategories.slice(0, DASHBOARD_CATEGORY_LIMIT).forEach(name => {
    const item = document.createElement("li");
    item.className = "post-item";

    const title = document.createElement("span");
    title.className = "post-item-title";
    title.textContent = name;
    item.appendChild(title);

    const canDelete = currentUserRole === "admin" || Boolean(categoryDeletePermissions.get(name));
    if (canDelete) {
      const actions = document.createElement("div");
      actions.className = "post-item-actions";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "danger";
      removeButton.textContent = "Διαγραφή";
      removeButton.addEventListener("click", () => deleteCategory(name));

      actions.appendChild(removeButton);
      item.appendChild(actions);
    }

    list.appendChild(item);
  });
}

async function createCategory(name) {
  if (currentUserRole !== "admin" && currentUserRole !== "staff") {
    showStatus("Staff access required.", "error");
    return false;
  }

  const normalized = normalizeCategory(name);
  if (!normalized) {
    showStatus("Category name is required.", "error");
    return false;
  }

  const response = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: normalized })
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    showStatus(errorPayload.error || `Δεν ήταν δυνατή η προσθήκη κατηγορίας (HTTP ${response.status}).`, "error");
    return false;
  }

  await loadCategories();
  showStatus("Category added.", "success");
  return true;
}

async function deleteCategory(name) {
  if (currentUserRole !== "admin" && currentUserRole !== "staff") {
    showStatus("Staff access required.", "error");
    return;
  }

  const confirmed = await window.showDeleteConfirm?.("Are you sure you want to delete this category?");
  if (!confirmed) return;

  const normalized = normalizeCategory(name);
  if (!normalized) return;

  const canDelete = currentUserRole === "admin" || Boolean(categoryDeletePermissions.get(normalized));
  if (!canDelete) {
    showStatus("You can only delete categories created by your account.", "error");
    return;
  }

  try {
    const response = await fetch("/api/categories/" + encodeURIComponent(normalized), {
      method: "DELETE"
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      showStatus(errorPayload.error || `Δεν ήταν δυνατή η διαγραφή κατηγορίας (HTTP ${response.status}).`, "error");
      return;
    }

    selectedCategories = selectedCategories.filter(category => category !== normalized);
    renderSelectedCategories();
    renderCategoryOptions();
    await loadCategories();
    showStatus("Category deleted.", "deleted");
  } catch {
    showStatus("Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή. Δοκιμάστε ξανά.", "error");
  }
}

function openCreateCategoryModal() {
  if (currentUserRole !== "admin" && currentUserRole !== "staff") {
    showStatus("Staff access required.", "error");
    return;
  }

  if (categoryOldNameInput) categoryOldNameInput.value = "";
  if (categoryNameInput) categoryNameInput.value = "";
  if (categoryEditTitle) categoryEditTitle.textContent = "New Category";
  if (saveCategoryButton) saveCategoryButton.textContent = "Add Category";
  if (categoryEditOverlay) {
    categoryEditOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

function closeCategoryModal() {
  if (categoryOldNameInput) categoryOldNameInput.value = "";
  if (categoryNameInput) categoryNameInput.value = "";
  if (categoryEditTitle) categoryEditTitle.textContent = "New Category";
  if (saveCategoryButton) saveCategoryButton.textContent = "Add Category";
  if (categoryEditOverlay) {
    categoryEditOverlay.hidden = true;
    if ((dashboardEditOverlay && !dashboardEditOverlay.hidden) || (releaseEditOverlay && !releaseEditOverlay.hidden)) {
      return;
    }
    document.body.style.overflow = "";
  }
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

function parseDateFromText(text) {
  const monthPattern = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/i;
  const dayMonthPattern = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+20\d{2}\b/i;
  const isoPattern = /\b20\d{2}[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/;
  const dmyPattern = /\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](20\d{2})\b/;

  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const cleaned = monthMatch[0].replace(/(st|nd|rd|th)/gi, "").trim();
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const dayMonthMatch = text.match(dayMonthPattern);
  if (dayMonthMatch) {
    const cleaned = dayMonthMatch[0].replace(/(st|nd|rd|th)/gi, "").trim();
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const isoMatch = text.match(isoPattern);
  if (isoMatch) {
    return isoMatch[0].replace(/[/.]/g, "-");
  }

  const dmyMatch = text.match(dmyPattern);
  if (dmyMatch) {
    const [day, month, year] = dmyMatch[0].split(/[\/.-]/);
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

function inferReleaseDateFromBlocks(blocks) {
  const values = [];
  collectTextValues(blocks, values);
  return parseDateFromText(values.join(" "));
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

function updateCalendarUx() {
  const toggle = document.getElementById("includeInCalendar");
  const fields = document.getElementById("calendarFields");
  const releaseDate = document.getElementById("releaseDate");
  const releaseType = document.getElementById("releaseType");
  const enabled = !!toggle?.checked;

  if (fields) {
    fields.classList.toggle("is-disabled", !enabled);
    fields.setAttribute("aria-disabled", String(!enabled));
  }

  if (releaseDate) releaseDate.disabled = !enabled;
  if (releaseType) releaseType.disabled = !enabled;
}

const editor = new EditorJS({
  holder: "editor",
  onChange: () => {
    scheduleDashboardDraftAutosave();
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

async function loadPosts() {
  if (dashboardPostsRefreshInFlight) return;
  dashboardPostsRefreshInFlight = true;

  const res = await fetch("/api/posts/manage?list=1");
  try {
    const posts = await res.json();

    allDashboardPosts = Array.isArray(posts) ? posts : [];
    renderPostsList();
    renderPendingApprovalsList();
    renderStaffAwaitingList();
    renderDashboardLinkSuggestions();
  } finally {
    dashboardPostsRefreshInFlight = false;
  }
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
    return '<button class="secondary submission-state-btn is-edit" type="button" disabled aria-disabled="true">Edit</button>';
  }
  return '<button class="secondary submission-state-btn is-new" type="button" disabled aria-disabled="true">New</button>';
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
  clearStatus();
  const confirmed = await window.showAppConfirm?.("Approve this post and publish it now?", {
    title: "Approve post",
    confirmText: "Approve",
    cancelText: "Cancel"
  });
  if (!confirmed) return;
  await reviewPost(postId, "approved", "Approved by admin");
};

window.rejectPost = async function rejectPost(postId) {
  clearStatus();
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

async function loadFeaturedPosts() {
  if (!featuredSection) return;

  const response = await fetch("/api/posts/manage/featured");
  if (response.status === 403) {
    featuredSection.style.display = "none";
    return;
  }

  if (!response.ok) {
    featuredDashboardPosts = [];
    renderFeaturedPostsList();
    return;
  }

  featuredSection.style.display = "";
  const payload = await response.json();
  featuredDashboardPosts = Array.isArray(payload) ? payload : [];
  renderFeaturedPostOptions();
  renderFeaturedPostsList();
}

function renderFeaturedPostOptions() {
  const select = document.getElementById("featured-post-select-modal");
  if (!select) return;

  const previousValue = select.value;
  const featuredIds = new Set(featuredDashboardPosts.map(post => String(post._id)));

  select.innerHTML = '<option value="">Select post</option>';

  const choices = [...allDashboardPosts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  choices.forEach(post => {
    if (featuredIds.has(String(post._id))) return;
    const option = document.createElement("option");
    option.value = String(post._id);
    option.textContent = `${post.title} (${post.slug})`;
    select.appendChild(option);
  });

  if (previousValue && Array.from(select.options).some(option => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function resetFeaturedForm() {
  const select = document.getElementById("featured-post-select-modal");
  const saveButton = document.getElementById("save-featured-btn");
  const cancelButton = document.getElementById("cancel-featured-btn");

  if (select) select.value = "";
  if (saveButton) saveButton.textContent = "Add Feature";
  if (cancelButton) cancelButton.textContent = "Cancel";
  if (featuredEditTitle) featuredEditTitle.textContent = "New Feature";
}

function openFeaturedModal() {
  if (!featuredEditOverlay) return;
  featuredEditOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeFeaturedModal() {
  if (!featuredEditOverlay) return;
  featuredEditOverlay.hidden = true;
  document.body.style.overflow = "";
}

window.openCreateFeaturedModal = function openCreateFeaturedModal() {
  resetFeaturedForm();
  renderFeaturedPostOptions();
  openFeaturedModal();
};

function renderFeaturedPostsList() {
  const list = document.getElementById("featured-posts");
  if (!list) return;
  list.innerHTML = "";

  const featured = [...featuredDashboardPosts]
    .sort((a, b) => new Date(b.featuredAddedAt || 0) - new Date(a.featuredAddedAt || 0))
    .slice(0, DASHBOARD_FEATURED_LIMIT);

  if (!featured.length) {
    list.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No manual featured posts yet</li>';
    return;
  }

  featured.forEach(post => {
    const li = document.createElement("li");
    const safePostId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    li.className = "post-item events-page-item";
    li.innerHTML = `
      <div class="release-event-main">
        <a class="post-item-title" href="/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}">${post.title}</a>
        <span class="release-event-date">Added: ${formatCalendarDate(post.featuredAddedAt || post.createdAt)}</span>
      </div>
      <div class="post-item-actions">
        <button class="danger" data-click="removeFeaturedPost('${post._id}')">Remove</button>
      </div>
    `;
    list.appendChild(li);
  });
}

async function addFeaturedPost() {
  clearStatus();
  const select = document.getElementById("featured-post-select-modal");
  const postId = String(select?.value || "").trim();
  if (!postId) {
    showStatus("Select a post to feature.", "error");
    return;
  }

  const response = await fetch("/api/posts/manage/featured", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showStatus(payload.error || "Δεν ήταν δυνατή η προσθήκη προβεβλημένης ανάρτησης.", "error");
    return;
  }

  const payload = await response.json().catch(() => ({}));
  const removedCount = Number(payload?.removedCount || 0);
  if (select) select.value = "";
  showStatus(removedCount > 0 ? "Featured post added. Oldest featured post was removed to keep max 6." : "Featured post added.", "success");
  closeFeaturedModal();
  await loadPosts();
}

window.removeFeaturedPost = async function removeFeaturedPost(postId) {
  clearStatus();

  const confirmed = await window.showDeleteConfirm?.("Are you sure you want to remove this featured post?");
  if (!confirmed) return;

  const response = await fetch("/api/posts/manage/featured/" + encodeURIComponent(postId), {
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showStatus(payload.error || "Δεν ήταν δυνατή η αφαίρεση προβεβλημένης ανάρτησης.", "error");
    return;
  }

  showStatus("Featured post removed.", "deleted");
  await loadPosts();
};

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

function renderDashboardLinkSuggestions() {
  if (!dashboardLinkSuggestionsEl) return;

  const title = String(document.getElementById("title")?.value || "");
  const slug = String(document.getElementById("slug")?.value || "");
  const currentId = String(document.getElementById("postId")?.value || "").trim();
  const terms = [...new Set([
    ...toSuggestionTerms(title),
    ...toSuggestionTerms(slug),
    ...toSuggestionTerms((selectedCategories || []).join(" "))
  ])];

  const isApprovedForSuggestions = (post) => {
    const status = String(post?.approvalStatus || "").trim().toLowerCase();
    const isPublished = post?.published === true;
    if (!isPublished) return false;
    if (!status) return true;
    return status === "approved";
  };

  const candidates = (Array.isArray(allDashboardPosts) ? allDashboardPosts : [])
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

  dashboardLinkSuggestionsEl.innerHTML = "";

  if (!terms.length) {
    dashboardLinkSuggestionsEl.innerHTML = '<li style="padding: 10px 12px; color: var(--text-muted);">Start typing title/categories to get suggestions.</li>';
    return;
  }

  if (!candidates.length) {
    dashboardLinkSuggestionsEl.innerHTML = '<li style="padding: 10px 12px; color: var(--text-muted);">No strong matches yet.</li>';
    return;
  }

  candidates.forEach(({ post, score }) => {
    const li = document.createElement("li");
    li.className = "post-item";
    const safePostId = encodeURIComponent(post?._id || "");
    const safeSlug = encodeURIComponent(post?.slug || "");
    const href = `/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    li.innerHTML = `
      <a class="post-item-title" href="${href}" target="_blank" rel="noopener">${post?.title || "Untitled"}</a>
      <span class="release-event-date">/${post?.slug || ""} • relevance ${score}</span>
    `;
    dashboardLinkSuggestionsEl.appendChild(li);
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

function getFilteredPosts() {
  const input = document.getElementById("posts-search");
  const query = normalizePostsSearch(input?.value);
  if (!query) return allDashboardPosts;

  return allDashboardPosts.filter(post => {
    const title = normalizePostsSearch(post.title);
    const slug = normalizePostsSearch(post.slug);
    return title.includes(query) || slug.includes(query);
  });
}

function renderPostsList() {
  const list = document.getElementById("posts");
  if (!list) return;
  list.innerHTML = "";

  const latestDashboardPosts = [...allDashboardPosts]
    .filter(post => {
      const status = getPostApprovalStatus(post);
      if (currentUserRole === "staff") {
        return status === "approved" || status === "rejected";
      }
      return status === "approved";
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, DASHBOARD_POST_LIMIT);

  if (!latestDashboardPosts.length) {
    list.innerHTML = currentUserRole === "staff"
      ? '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No approved or rejected posts yet</li>'
      : '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No approved posts yet</li>';
    return;
  }

  latestDashboardPosts.forEach(p => {
    const li = document.createElement("li");
    const imageUrl = getPostImageUrl(p);
    const safePostId = encodeURIComponent(p._id || "");
    const safeSlug = encodeURIComponent(p.slug || "");
    const postUrl = `/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    const moderationBanner = getPostModerationBanner(p);
    const submissionBadge = getPendingSubmissionBadgeHtml(p);
    const approvalInfo = getPostApprovalInfo(p);
    const isPending = getPostApprovalStatus(p) === "pending";
    const adminReviewActions = currentUserRole === "admin" && isPending
      ? `<button class="secondary" data-click="approvePost('${p._id}')">Approve</button>
         <button class="danger" data-click="rejectPost('${p._id}')">Reject</button>`
      : "";
    li.className = "post-item posts-page-item";
    li.innerHTML = `
      <div class="posts-page-main">
        <a href="${postUrl}" aria-label="Open ${p.title}">
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${p.title}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </a>
        <div class="posts-page-text">
          <div class="post-title-row">
            <a href="${postUrl}" class="post-item-title">${p.title}</a>
            <span class="post-badge-stack">${submissionBadge}</span>
          </div>
          <span class="release-event-date">/${p.slug} • ${approvalInfo}</span>
        </div>
      </div>
      <div class="post-item-actions status-above-actions">
        <span class="${moderationBanner.className}">${moderationBanner.label}</span>
        <button class="secondary" data-click="editPostById(decodeURIComponent('${safePostId}'))">Edit</button>
        ${adminReviewActions}
        <button class="danger" data-click="deletePost('${p._id}')">Διαγραφή</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function renderPendingApprovalsList() {
  if (!pendingSection) return;

  if (currentUserRole !== "admin") {
    pendingSection.hidden = true;
    return;
  }

  const pendingList = document.getElementById("pending-posts");
  if (!pendingList) return;

  const pendingPosts = [...allDashboardPosts]
    .filter(post => getPostApprovalStatus(post) === "pending")
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .slice(0, DASHBOARD_PENDING_PREVIEW_LIMIT);

  pendingSection.hidden = false;
  pendingList.innerHTML = "";

  if (!pendingPosts.length) {
    pendingList.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No pending posts</li>';
    return;
  }

  pendingPosts.forEach(post => {
    const item = document.createElement("li");
    const safeId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    const imageUrl = getPostImageUrl(post);
    const submissionBadge = getPendingSubmissionBadgeHtml(post);
    item.className = "post-item posts-page-item";
    item.innerHTML = `
      <div class="posts-page-main">
        <div>
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${post.title}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </div>
        <div class="posts-page-text">
          <div class="post-title-row">
            <a href="/post.html?id=${safeId}${safeSlug ? `&slug=${safeSlug}` : ''}" class="post-item-title">${post.title}</a>
          </div>
          <span class="release-event-date">by ${post.author || "Unknown"} • /${post.slug || ""}</span>
        </div>
      </div>
      <div class="post-item-actions">
        <div class="pending-action-stack">
          ${submissionBadge}
          <button class="secondary" data-click="editPostById(decodeURIComponent('${safeId}'))">Review/Edit</button>
        </div>
        <div class="pending-action-stack">
          <button class="secondary" data-click="approvePost('${post._id}')">Approve</button>
          <button class="danger" data-click="rejectPost('${post._id}')">Reject</button>
        </div>
      </div>
    `;
    pendingList.appendChild(item);
  });
}

function renderStaffAwaitingList() {
  if (!staffPendingSection) return;

  if (currentUserRole !== "staff") {
    staffPendingSection.hidden = true;
    return;
  }

  const pendingList = document.getElementById("staff-pending-posts");
  if (!pendingList) return;

  const pendingPosts = [...allDashboardPosts]
    .filter(post => getPostApprovalStatus(post) === "pending")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  staffPendingSection.hidden = false;
  pendingList.innerHTML = "";

  if (!pendingPosts.length) {
    pendingList.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No posts awaiting approval</li>';
    return;
  }

  pendingPosts.forEach(post => {
    const li = document.createElement("li");
    const safePostId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    const postUrl = `/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}`;
    const imageUrl = getPostImageUrl(post);
    const submissionBadge = getPendingSubmissionBadgeHtml(post);
    li.className = "post-item posts-page-item";
    li.innerHTML = `
      <div class="posts-page-main">
        <div>
          ${imageUrl
            ? `<img src="${imageUrl}" alt="${post.title || "Untitled"}" class="posts-page-thumb" />`
            : '<div class="posts-page-thumb posts-page-thumb-placeholder" aria-hidden="true"></div>'}
        </div>
        <div class="posts-page-text">
          <div class="post-title-row">
            <a href="${postUrl}" class="post-item-title">${post.title || "Untitled"}</a>
          </div>
          <span class="release-event-date">/${post.slug || ""} • Waiting for admin approval</span>
        </div>
      </div>
      <div class="post-item-actions status-above-actions">
        ${submissionBadge}
        <button class="secondary" data-click="editPostById(decodeURIComponent('${safePostId}'))">Edit</button>
        <button class="danger" data-click="deletePost('${post._id}')">Διαγραφή</button>
      </div>
    `;
    pendingList.appendChild(li);
  });
}

function renderReleasePostOptions() {
  const select = document.getElementById("release-post-select");
  if (!select) return;

  const previousValue = select.value;

  const selectablePosts = allDashboardPosts.filter(post => {
    const isEditingCurrentPost = releaseEditPostId && String(post._id) === String(releaseEditPostId);
    const alreadyInCalendar = !!post.includeInCalendar || !!post.releaseDate;
    return isEditingCurrentPost || !alreadyInCalendar;
  });

  select.innerHTML = '<option value="">Select post</option>';

  selectablePosts.forEach(post => {
    const option = document.createElement("option");
    option.value = String(post._id);
    option.textContent = `${post.title} (${post.slug})`;
    option.dataset.title = normalizePostsSearch(post.title);
    option.dataset.slug = normalizePostsSearch(post.slug);
    option.dataset.search = normalizePostsSearch(`${post.title} ${post.slug}`);
    select.appendChild(option);
  });

  if (releaseEditPostId && selectablePosts.some(post => String(post._id) === releaseEditPostId)) {
    select.value = releaseEditPostId;
    return;
  }

  if (previousValue && selectablePosts.some(post => String(post._id) === previousValue)) {
    select.value = previousValue;
  }
}

let releasePostTypeBuffer = "";
let releasePostTypeTimer = null;

function resetReleasePostTypeBuffer() {
  releasePostTypeBuffer = "";
  if (releasePostTypeTimer) {
    clearTimeout(releasePostTypeTimer);
    releasePostTypeTimer = null;
  }
}

function findReleasePostOptionByQuery(select, query) {
  const normalizedQuery = normalizePostsSearch(query);
  if (!normalizedQuery) return null;

  const options = Array.from(select.options).slice(1);
  const byTitlePrefix = options.find(option => (option.dataset.title || "").startsWith(normalizedQuery));
  if (byTitlePrefix) return byTitlePrefix;

  const bySlugPrefix = options.find(option => (option.dataset.slug || "").startsWith(normalizedQuery));
  if (bySlugPrefix) return bySlugPrefix;

  const startsWithMatch = options.find(option => {
    const searchText = option.dataset.search || normalizePostsSearch(option.textContent || "");
    return searchText.startsWith(normalizedQuery);
  });
  if (startsWithMatch) return startsWithMatch;

  return options.find(option => {
    const searchText = option.dataset.search || normalizePostsSearch(option.textContent || "");
    return searchText.includes(normalizedQuery);
  }) || null;
}

function initializeReleasePostTypeahead() {
  const select = document.getElementById("release-post-select");
  if (!select) return;
  if (select.dataset.typeaheadBound === "true") return;
  select.dataset.typeaheadBound = "true";

  select.addEventListener("focus", resetReleasePostTypeBuffer);
  select.addEventListener("blur", resetReleasePostTypeBuffer);

  select.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "Backspace") {
      releasePostTypeBuffer = releasePostTypeBuffer.slice(0, -1);
    } else if (event.key.length === 1) {
      releasePostTypeBuffer += event.key.toLowerCase();
    } else {
      return;
    }

    if (releasePostTypeTimer) {
      clearTimeout(releasePostTypeTimer);
    }
    releasePostTypeTimer = setTimeout(() => {
      resetReleasePostTypeBuffer();
    }, 1200);

    const match = findReleasePostOptionByQuery(select, releasePostTypeBuffer);

    if (match) {
      select.value = match.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      event.preventDefault();
    }
  });
}

function formatCalendarDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function renderReleaseEventsList() {
  const list = document.getElementById("release-events");
  if (!list) return;

  const events = allDashboardPosts
    .filter(post => !!post.includeInCalendar || !!post.releaseDate)
    .sort((a, b) => new Date(b.releaseDate || b.createdAt) - new Date(a.releaseDate || a.createdAt))
    .slice(0, DASHBOARD_RELEASE_LIMIT);

  list.innerHTML = "";

  if (!events.length) {
    list.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No calendar events yet</li>';
    return;
  }

  events.forEach(post => {
    const li = document.createElement("li");
    li.className = "post-item events-page-item";
    const safePostId = encodeURIComponent(post._id || "");
    const safeSlug = encodeURIComponent(post.slug || "");
    li.innerHTML = `
      <div class="release-event-main">
        <a class="post-item-title" href="/post.html?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}">${post.title}</a>
        <span class="release-event-date">${formatCalendarDate(post.releaseDate)}</span>
      </div>
      <div class="post-item-actions">
        <button class="secondary" data-click="editReleaseEvent('${post._id}')">Edit</button>
        <button class="danger" data-click="deleteReleaseEvent('${post._id}')">Διαγραφή</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function resetReleaseForm() {
  releaseEditPostId = null;
  const postSelect = document.getElementById("release-post-select");
  const dateInput = document.getElementById("release-date");
  const saveButton = document.getElementById("save-release-btn");
  const cancelButton = document.getElementById("cancel-release-edit-btn");

  if (postSelect) postSelect.value = "";
  if (dateInput) dateInput.value = "";
  if (saveButton) saveButton.textContent = "Δημιουργία συμβάντος";
  if (cancelButton) cancelButton.textContent = "Cancel";
  if (releaseEditTitle) releaseEditTitle.textContent = "New Event";
}

function openReleaseModal() {
  if (!releaseEditOverlay) return;
  releaseEditOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeReleaseModal() {
  if (!releaseEditOverlay) return;
  releaseEditOverlay.hidden = true;
  document.body.style.overflow = "";
}

window.openCreateReleaseModal = function openCreateReleaseModal() {
  resetReleaseForm();
  openReleaseModal();
};

window.editReleaseEvent = function editReleaseEvent(postId) {
  const post = allDashboardPosts.find(item => String(item._id) === String(postId));
  if (!post) return;

  releaseEditPostId = String(post._id);
  const postSelect = document.getElementById("release-post-select");
  const dateInput = document.getElementById("release-date");
  const saveButton = document.getElementById("save-release-btn");
  const cancelButton = document.getElementById("cancel-release-edit-btn");

  if (postSelect) postSelect.value = String(post._id);
  if (dateInput) dateInput.value = post.releaseDate ? new Date(post.releaseDate).toISOString().slice(0, 10) : "";
  if (saveButton) saveButton.textContent = "Ενημέρωση συμβάντος";
  if (cancelButton) cancelButton.textContent = "Cancel Edit";
  if (releaseEditTitle) releaseEditTitle.textContent = "Edit Event";
  openReleaseModal();
};

window.deleteReleaseEvent = async function deleteReleaseEvent(postId) {
  clearStatus();

  const confirmed = await window.showDeleteConfirm?.("Are you sure you want to delete this event?");
  if (!confirmed) return;

  const res = await fetch("/api/posts/" + postId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeInCalendar: false,
      releaseDate: null,
      releaseType: ""
    })
  });

  if (!res.ok) {
    showStatus("Δεν ήταν δυνατή η διαγραφή συμβάντος ημερολογίου.", "error");
    return;
  }

  if (releaseEditPostId === String(postId)) {
    resetReleaseForm();
  }

  showStatus("Το συμβάν διαγράφηκε", "deleted");
  await loadPosts();
};

async function saveReleaseEvent() {
  clearStatus();

  const postSelect = document.getElementById("release-post-select");
  const dateInput = document.getElementById("release-date");
  const selectedPostId = postSelect?.value;
  const releaseDate = dateInput?.value;

  if (!selectedPostId) {
    showStatus("Επιλέξτε πρώτα ανάρτηση.", "error");
    return;
  }

  if (!releaseDate) {
    showStatus("Επιλέξτε ημερομηνία δημοσίευσης.", "error");
    return;
  }

  const targetPost = allDashboardPosts.find(post => String(post._id) === String(selectedPostId)) || null;

  if (!targetPost) {
    showStatus("Η επιλεγμένη ανάρτηση δεν βρέθηκε.", "error");
    return;
  }

  const res = await fetch("/api/posts/" + targetPost._id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeInCalendar: true,
      releaseDate,
      releaseType: targetPost.releaseType || ""
    })
  });

  if (!res.ok) {
    showStatus("Δεν ήταν δυνατή η αποθήκευση συμβάντος ημερολογίου.", "error");
    return;
  }

  showStatus(releaseEditPostId ? "Το συμβάν ενημερώθηκε" : "Το συμβάν δημιουργήθηκε", "success");
  resetReleaseForm();
  closeReleaseModal();
  await loadPosts();
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

  isEditing = true;

  document.getElementById("postId").value = post._id;
  document.getElementById("title").value = post.title;
  document.getElementById("slug").value = post.slug;
  if (postSummaryInput) {
    postSummaryInput.value = String(post.metaDescription || post.excerpt || "").trim() || generateSummaryFromBlocks(post.content || []);
  }
  if (POST_EDITOR_CATEGORIES_ENABLED) {
    setSelectedCategories(Array.isArray(post.categories) ? post.categories : []);
  } else {
    setSelectedCategories([]);
  }

  const savePostButton = document.getElementById("save-post-btn");
  const cancelPostEditButton = document.getElementById("cancel-post-edit-btn");
  if (savePostButton) savePostButton.textContent = "Ενημέρωση ανάρτησης";
  if (cancelPostEditButton) cancelPostEditButton.textContent = "Cancel Edit";
  if (dashboardPostEditTitle) dashboardPostEditTitle.textContent = "Edit Post";
  if (cancelPostEditButton) cancelPostEditButton.style.display = "inline-block";

  await editor.render({ blocks: post.content });
  if (dashboardEditOverlay) {
    dashboardEditOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  await maybeRestoreDashboardDraft(String(post._id || ""), {
    title: post.title,
    slug: post.slug,
    metaDescription: String(post.metaDescription || post.excerpt || "").trim() || generateSummaryFromBlocks(post.content || []),
    categories: POST_EDITOR_CATEGORIES_ENABLED && Array.isArray(post.categories) ? post.categories : [],
    content: Array.isArray(post.content) ? post.content : []
  });
  renderDashboardLinkSuggestions();

  clearStatus();
}

async function openCreatePostModal() {
  await cancelPostEdit();

  const savePostButton = document.getElementById("save-post-btn");
  const cancelPostEditButton = document.getElementById("cancel-post-edit-btn");
  if (savePostButton) savePostButton.textContent = "Δημιουργία ανάρτησης";
  if (cancelPostEditButton) cancelPostEditButton.textContent = "Cancel";
  if (dashboardPostEditTitle) dashboardPostEditTitle.textContent = "New Post";

  if (dashboardEditOverlay) {
    dashboardEditOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  await maybeRestoreDashboardDraft("new");
  renderDashboardLinkSuggestions();
}

async function cancelPostEdit(preserveStatus = false, options = {}) {
  const settings = options && typeof options === "object" ? options : {};
  const discardDraft = Boolean(settings.discardDraft);
  if (dashboardDraftTimer) {
    clearTimeout(dashboardDraftTimer);
    dashboardDraftTimer = null;
  }
  if (discardDraft) {
    const currentContextId = getDashboardDraftContextId();
    removeDashboardDraft(currentContextId);
  }

  document.getElementById("postForm").reset();
  document.getElementById("postId").value = "";
  setSelectedCategories([]);
  await editor.clear();
  isEditing = false;

  const savePostButton = document.getElementById("save-post-btn");
  const cancelPostEditButton = document.getElementById("cancel-post-edit-btn");
  if (savePostButton) savePostButton.textContent = "Δημιουργία ανάρτησης";
  if (cancelPostEditButton) cancelPostEditButton.textContent = "Cancel";
  if (dashboardPostEditTitle) dashboardPostEditTitle.textContent = "New Post";
  if (cancelPostEditButton) cancelPostEditButton.style.display = "inline-block";

  if (dashboardEditOverlay) {
    dashboardEditOverlay.hidden = true;
    document.body.style.overflow = "";
  }

  if (!preserveStatus) {
    clearStatus();
  }
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

document.getElementById("postForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearStatus();
  const postIdValue = String(document.getElementById("postId")?.value || "").trim();
  const isUpdate = isEditing && !!postIdValue;

  let data;
  try {
    data = await editor.save();
  } catch {
    showStatus("Editor content is invalid. Please review the post content and try again.", "error");
    return;
  }

  const normalizedBlocks = normalizeImageAltInBlocks(data.blocks);
  const canPublish = await confirmImageAltReminder(normalizedBlocks);
  if (!canPublish) {
    showStatus("Add alt text to image blocks before publishing.", "error");
    return;
  }

  const titleValue = document.getElementById("title").value;
  const slugInput = document.getElementById("slug");
  const slugValue = toSlug(slugInput.value || titleValue);
  slugInput.value = slugValue;

  const post = {
    title: titleValue,
    slug: slugValue,
    categories: POST_EDITOR_CATEGORIES_ENABLED ? selectedCategories : [],
    excerpt: String(postSummaryInput?.value || "").trim() || generateSummaryFromBlocks(normalizedBlocks),
    metaDescription: String(postSummaryInput?.value || "").trim() || generateSummaryFromBlocks(normalizedBlocks),
    content: normalizedBlocks,
    published: true
  };

  const method = isUpdate ? "PUT" : "POST";
  const url = isUpdate
    ? "/api/posts/" + postIdValue
    : "/api/posts";
  const draftContextId = isUpdate
    ? postIdValue || "new"
    : "new";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(post)
  });

  if (res.ok) {
    const savedPost = await res.json().catch(() => ({}));
    const savedStatus = String(savedPost?.approvalStatus || "").toLowerCase();
    const successMessage = !isUpdate && savedStatus === "pending"
      ? "Η ανάρτηση υποβλήθηκε για έγκριση διαχειριστή."
      : isUpdate && currentUserRole === "staff"
        ? "Η ανάρτηση ενημερώθηκε και υποβλήθηκε ξανά για έγκριση."
        : isUpdate
          ? "Η ανάρτηση ενημερώθηκε επιτυχώς."
          : "Η ανάρτηση δημιουργήθηκε επιτυχώς.";
    removeDashboardDraft(draftContextId);
    showStatus(successMessage, "success");
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cancelPostEdit(true);
    await loadPosts();
  } else {
    const errorPayload = await res.json().catch(() => ({}));
    showStatus(errorPayload.error || "Error saving post. Try again.", "error");
  }
});

// Auto-generate slug from title
document.getElementById("title").addEventListener("input", () => {
  if (!isEditing) {
    const slug = toSlug(document.getElementById("title").value);
    document.getElementById("slug").value = slug;
  }
  renderDashboardLinkSuggestions();
  scheduleDashboardDraftAutosave(900);
});

document.getElementById("slug")?.addEventListener("input", () => {
  renderDashboardLinkSuggestions();
  scheduleDashboardDraftAutosave(900);
});

postSummaryInput?.addEventListener("input", () => {
  scheduleDashboardDraftAutosave(900);
});

document.getElementById("categorySelect")?.addEventListener("change", () => {
  if (!POST_EDITOR_CATEGORIES_ENABLED) return;
  const select = document.getElementById("categorySelect");
  const value = normalizeCategory(select?.value);
  if (!value) return;
  addSelectedCategory(value);
  if (select) select.value = "";
});

document.getElementById("releaseEventForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  await saveReleaseEvent();
});
document.getElementById("featuredForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  await addFeaturedPost();
});
document.getElementById("categoryForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const ok = await createCategory(categoryNameInput?.value || "");
  if (ok) closeCategoryModal();
});
document.getElementById("cancel-release-edit-btn")?.addEventListener("click", () => {
  resetReleaseForm();
  closeReleaseModal();
});
document.getElementById("cancel-featured-btn")?.addEventListener("click", () => {
  resetFeaturedForm();
  closeFeaturedModal();
});
document.getElementById("cancel-category-btn")?.addEventListener("click", closeCategoryModal);
categoryEditClose?.addEventListener("click", closeCategoryModal);
releaseEditClose?.addEventListener("click", () => {
  resetReleaseForm();
  closeReleaseModal();
});
featuredEditClose?.addEventListener("click", () => {
  resetFeaturedForm();
  closeFeaturedModal();
});
document.getElementById("cancel-post-edit-btn")?.addEventListener("click", () => cancelPostEdit(false, { discardDraft: true }));
dashboardEditClose?.addEventListener("click", cancelPostEdit);

dashboardEditOverlay?.addEventListener("click", event => {
  if (event.target === dashboardEditOverlay) {
    cancelPostEdit();
  }
});

releaseEditOverlay?.addEventListener("click", event => {
  if (event.target === releaseEditOverlay) {
    resetReleaseForm();
    closeReleaseModal();
  }
});

featuredEditOverlay?.addEventListener("click", event => {
  if (event.target === featuredEditOverlay) {
    resetFeaturedForm();
    closeFeaturedModal();
  }
});

categoryEditOverlay?.addEventListener("click", event => {
  if (event.target === categoryEditOverlay) {
    closeCategoryModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && categoryEditOverlay && !categoryEditOverlay.hidden) {
    closeCategoryModal();
    return;
  }

  if (event.key === "Escape" && releaseEditOverlay && !releaseEditOverlay.hidden) {
    resetReleaseForm();
    closeReleaseModal();
    return;
  }

  if (event.key === "Escape" && featuredEditOverlay && !featuredEditOverlay.hidden) {
    resetFeaturedForm();
    closeFeaturedModal();
    return;
  }

  if (event.key === "Escape" && dashboardEditOverlay && !dashboardEditOverlay.hidden) {
    cancelPostEdit();
  }
});

function initializeDashboardPendingAutoRefresh() {
  if (dashboardPendingRefreshTimer) return;

  const refreshIfVisible = () => {
    if (document.hidden) return;
    loadPosts();
  };

  dashboardPendingRefreshTimer = window.setInterval(refreshIfVisible, DASHBOARD_PENDING_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    loadPosts();
  });

  window.addEventListener("focus", () => {
    loadPosts();
  });

  window.addEventListener("dashboard-pending-count-changed", () => {
    loadPosts();
  });

  window.addEventListener("beforeunload", () => {
    if (!dashboardPendingRefreshTimer) return;
    window.clearInterval(dashboardPendingRefreshTimer);
    dashboardPendingRefreshTimer = null;
  });
}

(async function initializeDashboardPage() {
  await ensureStaffAccess();

  /* Show newsletter section for admin only */
  const newsletterSection = document.getElementById('dashboard-newsletter-section');
  if (newsletterSection && currentUserRole === 'admin') {
    newsletterSection.hidden = false;
  }

  if (dashboardPostCategoriesGroup) {
    dashboardPostCategoriesGroup.hidden = !POST_EDITOR_CATEGORIES_ENABLED;
  }
  if (POST_EDITOR_CATEGORIES_ENABLED) {
    await loadCategories();
  } else {
    selectedCategories = [];
    renderSelectedCategories();
    renderCategoryOptions();
  }
  await loadPosts();
  initializeDashboardPendingAutoRefresh();
  initializeReleasePostTypeahead();
})();
