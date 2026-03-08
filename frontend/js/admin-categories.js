document.getElementById("year").textContent = new Date().getFullYear();

const statusEl = document.getElementById("status");
const listEl = document.getElementById("categories-list");
const searchEl = document.getElementById("categories-search");
const editOverlay = document.getElementById("categories-edit-overlay");
const editTitle = document.getElementById("categories-edit-title");
const editCloseButton = document.getElementById("categories-edit-close");
const editCancelButton = document.getElementById("categories-edit-cancel");
const editForm = document.getElementById("categoriesEditForm");
const editOldNameInput = document.getElementById("categories-old-name");
const editNameInput = document.getElementById("categories-name-input");
const editSaveButton = document.getElementById("categories-save-btn");
const newCategoryButton = document.getElementById("categories-new-btn");
let allCategories = [];
let currentUserRole = "";
let statusHideTimer = null;

function normalizeCategory(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().trim();
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

function getFilteredCategories() {
  const query = normalizeSearch(searchEl?.value);
  if (!query) return allCategories;

  return allCategories.filter(item => normalizeSearch(item.name).includes(query));
}

function renderCategories() {
  if (!listEl) return;
  listEl.innerHTML = "";

  const categories = getFilteredCategories();

  if (!categories.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "post-item";

    const emptyText = document.createElement("span");
    emptyText.className = "post-item-title";
    emptyText.textContent = "No categories found.";

    emptyItem.appendChild(emptyText);
    listEl.appendChild(emptyItem);
    return;
  }

  categories.forEach(itemMeta => {
    const name = String(itemMeta?.name || "");
    const canDelete = Boolean(itemMeta?.canDelete);

    const item = document.createElement("li");
    item.className = "post-item";

    const title = document.createElement("span");
    title.className = "post-item-title";
    title.textContent = name;

    const actions = document.createElement("div");
    actions.className = "post-item-actions";

    if (canDelete) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "danger";
      removeButton.textContent = "Διαγραφή";
      removeButton.addEventListener("click", () => deleteCategory(name));
      actions.appendChild(removeButton);
    }

    item.appendChild(title);
    if (actions.childElementCount > 0) {
      item.appendChild(actions);
    }
    listEl.appendChild(item);
  });
}

async function loadCategories() {
  const response = await fetch("/api/categories/manage");
  if (!response.ok) {
    throw new Error("Δεν ήταν δυνατή η φόρτωση κατηγοριών");
  }

  const payload = await response.json();
  allCategories = Array.isArray(payload)
    ? payload
      .map(entry => ({
        name: normalizeCategory(entry?.name),
        canDelete: Boolean(entry?.canDelete)
      }))
      .filter(entry => entry.name)
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  renderCategories();
}

async function createCategory(name) {
  const normalized = normalizeCategory(name);
  if (!normalized) {
    showStatus("Category name is required.", "error");
    return;
  }

  const response = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: normalized })
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    showStatus(errorPayload.error || `Δεν ήταν δυνατή η προσθήκη κατηγορίας (HTTP ${response.status}).`, "error");
    return;
  }

  if (editNameInput) editNameInput.value = "";
  await loadCategories();
  showStatus("Category added.", "success");
  return true;
}

function openCreateCategoryModal() {
  if (editOldNameInput) editOldNameInput.value = "";
  if (editNameInput) editNameInput.value = "";
  if (editTitle) editTitle.textContent = "New Category";
  if (editSaveButton) editSaveButton.textContent = "Add Category";
  if (editOverlay) {
    editOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

function closeCategoryModal() {
  if (editOldNameInput) editOldNameInput.value = "";
  if (editNameInput) editNameInput.value = "";
  if (editTitle) editTitle.textContent = "New Category";
  if (editSaveButton) editSaveButton.textContent = "Add Category";
  if (editOverlay) {
    editOverlay.hidden = true;
    document.body.style.overflow = "";
  }
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

  const selected = allCategories.find(item => item.name === normalized);
  if (currentUserRole !== "admin" && !selected?.canDelete) {
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

    await loadCategories();
    showStatus("Category deleted.", "deleted");
  } catch {
    showStatus("Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή. Δοκιμάστε ξανά.", "error");
  }
}

async function ensureStaffAccess() {
  const response = await fetch("/api/auth/profile");
  if (!response.ok) {
    window.location.href = "/no-access";
    return false;
  }

  const profile = await response.json();
  const role = String(profile.role || "").toLowerCase();
  if (role !== "admin" && role !== "staff") {
    window.location.href = "/no-access";
    return false;
  }

  currentUserRole = role;

  return true;
}

editForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const ok = await createCategory(editNameInput?.value || "");
  if (ok) closeCategoryModal();
});

searchEl?.addEventListener("input", renderCategories);

editCloseButton?.addEventListener("click", closeCategoryModal);
editCancelButton?.addEventListener("click", closeCategoryModal);

editOverlay?.addEventListener("click", event => {
  if (event.target === editOverlay) {
    closeCategoryModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && editOverlay && !editOverlay.hidden) {
    closeCategoryModal();
  }
});

(async function initializeCategoriesPage() {
  const allowed = await ensureStaffAccess();
  if (!allowed) return;

  try {
    await loadCategories();
  } catch {
    allCategories = [];
    renderCategories();
    showStatus("Δεν ήταν δυνατή η φόρτωση κατηγοριών.", "error");
  }
})();
