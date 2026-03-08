document.getElementById("year").textContent = new Date().getFullYear();

const statusEl = document.getElementById("status");
const eventsListEl = document.getElementById("events-list");
const searchInput = document.getElementById("events-search");
const dateFilterInput = document.getElementById("events-date-filter");
const monthFilterSelect = document.getElementById("events-month-filter");
const yearFilterSelect = document.getElementById("events-year-filter");

const editOverlay = document.getElementById("events-edit-overlay");
const editCloseButton = document.getElementById("events-edit-close");
const editCancelButton = document.getElementById("events-edit-cancel");
const editForm = document.getElementById("eventsEditForm");
const editTitle = document.getElementById("events-edit-title");
const saveButton = document.getElementById("events-save-btn");
const eventPostSelect = document.getElementById("event-post-select");
const eventDateInput = document.getElementById("event-date-input");

let allPosts = [];
let editingPostId = null;
let statusHideTimer = null;

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

function normalizeSearch(value) {
  return String(value || "").toLowerCase().trim();
}

function formatCalendarDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getEventDateInfo(post) {
  const rawValue = post?.releaseDate || post?.createdAt || null;
  const date = rawValue ? new Date(rawValue) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { iso: "", month: "", year: "", timestamp: 0 };
  }

  const iso = date.toISOString().slice(0, 10);
  return {
    iso,
    month: String(date.getMonth() + 1),
    year: String(date.getFullYear()),
    timestamp: date.getTime()
  };
}

function getEventPosts() {
  return allPosts.filter(post => !!post.includeInCalendar || !!post.releaseDate);
}

function populateEventPostOptions() {
  if (!eventPostSelect) return;

  const previous = eventPostSelect.value;
  eventPostSelect.innerHTML = '<option value="">Select post</option>';

  allPosts.forEach(post => {
    const option = document.createElement("option");
    option.value = String(post._id);
    option.textContent = `${post.title} (${post.slug})`;
    eventPostSelect.appendChild(option);
  });

  if (previous && allPosts.some(post => String(post._id) === String(previous))) {
    eventPostSelect.value = previous;
  }
}

function populateYearFilter() {
  if (!yearFilterSelect) return;

  const current = yearFilterSelect.value;
  const years = [...new Set(getEventPosts()
    .map(post => getEventDateInfo(post).year)
    .filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));

  yearFilterSelect.innerHTML = '<option value="">All years</option>';
  years.forEach(year => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilterSelect.appendChild(option);
  });

  if (current && years.includes(current)) {
    yearFilterSelect.value = current;
  }
}

function getFilteredEvents() {
  const query = normalizeSearch(searchInput?.value);
  const dateValue = String(dateFilterInput?.value || "").trim();
  const monthValue = String(monthFilterSelect?.value || "").trim();
  const yearValue = String(yearFilterSelect?.value || "").trim();

  return getEventPosts()
    .filter(post => {
      const info = getEventDateInfo(post);
      const title = normalizeSearch(post.title);
      const slug = normalizeSearch(post.slug);

      if (query && !title.includes(query) && !slug.includes(query)) return false;
      if (dateValue && info.iso !== dateValue) return false;
      if (monthValue && info.month !== monthValue) return false;
      if (yearValue && info.year !== yearValue) return false;

      return true;
    })
    .sort((a, b) => getEventDateInfo(b).timestamp - getEventDateInfo(a).timestamp);
}

function renderEventsList() {
  if (!eventsListEl) return;

  const filtered = getFilteredEvents();
  eventsListEl.innerHTML = "";

  if (!filtered.length) {
    eventsListEl.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">No events found</li>';
    return;
  }

    filtered.forEach(post => {
      const safePostId = encodeURIComponent(post._id || "");
      const safeSlug = encodeURIComponent(post.slug || "");
    const li = document.createElement("li");
    li.className = "post-item events-page-item";
    li.innerHTML = `
      <div class="release-event-main">
            <a class="post-item-title" href="/post?id=${safePostId}${safeSlug ? `&slug=${safeSlug}` : ""}" target="_blank" rel="noopener">${post.title}</a>
        <span class="release-event-date">${formatCalendarDate(post.releaseDate)} • /${post.slug}</span>
      </div>
      <div class="post-item-actions">
        <button class="secondary" data-click="editEvent('${post._id}')">Edit</button>
        <button class="danger" data-click="deleteEvent('${post._id}')">Διαγραφή</button>
      </div>
    `;
    eventsListEl.appendChild(li);
  });
}

function openEditModal() {
  if (!editOverlay) return;
  editOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  if (!editOverlay) return;
  editOverlay.hidden = true;
  document.body.style.overflow = "";
}

function resetEventEditor() {
  editingPostId = null;
  if (eventPostSelect) eventPostSelect.value = "";
  if (eventDateInput) eventDateInput.value = "";
  if (editTitle) editTitle.textContent = "New Event";
  if (saveButton) saveButton.textContent = "Δημιουργία συμβάντος";
  if (editCancelButton) editCancelButton.textContent = "Cancel";
}

window.openCreateEventModal = function openCreateEventModal() {
  resetEventEditor();
  openEditModal();
};

window.editEvent = function editEvent(postId) {
  const post = allPosts.find(item => String(item._id) === String(postId));
  if (!post) return;

  editingPostId = String(post._id);

  if (eventPostSelect) eventPostSelect.value = String(post._id);
  if (eventDateInput) eventDateInput.value = post.releaseDate ? new Date(post.releaseDate).toISOString().slice(0, 10) : "";
  if (editTitle) editTitle.textContent = "Edit Event";
  if (saveButton) saveButton.textContent = "Ενημέρωση συμβάντος";
  if (editCancelButton) editCancelButton.textContent = "Cancel Edit";

  openEditModal();
};

window.deleteEvent = async function deleteEvent(postId) {
  const confirmed = await window.showDeleteConfirm?.("Are you sure you want to delete this event?");
  if (!confirmed) return;

  const response = await fetch("/api/posts/" + postId, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeInCalendar: false,
      releaseDate: null,
      releaseType: ""
    })
  });

  if (!response.ok) {
    showStatus("Δεν ήταν δυνατή η διαγραφή συμβάντος.", "error");
    return;
  }

  if (editingPostId === String(postId)) {
    resetEventEditor();
    closeEditModal();
  }

  showStatus("Το συμβάν διαγράφηκε", "deleted");
  await loadPosts();
};

async function saveEvent() {
  const selectedPostId = eventPostSelect?.value;
  const releaseDate = eventDateInput?.value;

  if (!selectedPostId) {
    showStatus("Επιλέξτε πρώτα ανάρτηση.", "error");
    return;
  }

  if (!releaseDate) {
    showStatus("Επιλέξτε ημερομηνία δημοσίευσης.", "error");
    return;
  }

  const targetPost = allPosts.find(post => String(post._id) === String(selectedPostId));
  if (!targetPost) {
    showStatus("Η επιλεγμένη ανάρτηση δεν βρέθηκε.", "error");
    return;
  }

  const response = await fetch("/api/posts/" + targetPost._id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      includeInCalendar: true,
      releaseDate,
      releaseType: targetPost.releaseType || ""
    })
  });

  if (!response.ok) {
    showStatus("Δεν ήταν δυνατή η αποθήκευση συμβάντος.", "error");
    return;
  }

  showStatus(editingPostId ? "Το συμβάν ενημερώθηκε" : "Το συμβάν δημιουργήθηκε", "success");
  resetEventEditor();
  closeEditModal();
  await loadPosts();
}

async function loadPosts() {
  const response = await fetch("/api/posts/manage?list=1");
  const posts = await response.json();

  allPosts = Array.isArray(posts) ? posts : [];
  populateEventPostOptions();
  populateYearFilter();
  renderEventsList();
}

async function openEventFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const eventToEdit = params.get("edit");
  if (!eventToEdit) return;

  window.editEvent(eventToEdit);

  params.delete("edit");
  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

async function ensureStaffAccess() {
  const response = await fetch("/api/auth/profile");
  if (!response.ok) {
    window.location.href = "/no-access";
    return;
  }

  const profile = await response.json();
  if (profile.role !== "admin" && profile.role !== "staff") {
    window.location.href = "/no-access";
    return;
  }
}

[searchInput, dateFilterInput, monthFilterSelect, yearFilterSelect]
  .forEach(element => element?.addEventListener("input", renderEventsList));

editForm?.addEventListener("submit", async event => {
  event.preventDefault();
  await saveEvent();
});

editCloseButton?.addEventListener("click", () => {
  resetEventEditor();
  closeEditModal();
});

editCancelButton?.addEventListener("click", () => {
  resetEventEditor();
  closeEditModal();
});

editOverlay?.addEventListener("click", event => {
  if (event.target === editOverlay) {
    resetEventEditor();
    closeEditModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && editOverlay && !editOverlay.hidden) {
    resetEventEditor();
    closeEditModal();
  }
});

(async function initializeEventsPage() {
  await ensureStaffAccess();
  await loadPosts();
  await openEventFromQuery();
})();
