document.getElementById('year').textContent = new Date().getFullYear();

function updateThemeLabel() {
  const label = document.getElementById('theme-label');
  const mode = document.documentElement.getAttribute('data-theme') || 'light';
  if (label) {
    label.textContent = mode === 'dark' ? 'Σκούρο' : 'Ανοιχτό';
  }
}
window.addEventListener('DOMContentLoaded', updateThemeLabel);

const statusEl = document.getElementById("status");
let statusHideTimer = null;
const DEFAULT_PROFILE_AVATAR = "/assets/default-avatar.svg";

function showStatus(message, type) {
  if (!statusEl) return;
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
  if (!statusEl) return;
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }
  statusEl.textContent = "";
  statusEl.classList.remove("success", "error", "show");
}

async function loadProfile() {
  const res = await fetch("/api/auth/profile");
  if (!res.ok) {
    showStatus("Παρακαλώ συνδεθείτε ξανά.", "error");
    return;
  }

  const profile = await res.json();
  document.getElementById("email").value = profile.email || "";
  document.getElementById("firstName").value = profile.firstName || "";
  document.getElementById("lastName").value = profile.lastName || "";
  document.getElementById("avatarUrl").value = profile.avatarUrl || "";

  const bioEl = document.getElementById("bio");
  if (bioEl) {
    bioEl.value = profile.bio || "";
    const counter = document.getElementById("bioCharCount");
    if (counter) counter.textContent = bioEl.value.length;
  }

  const avatarPreview = document.getElementById("avatarPreview");
  avatarPreview.src = profile.avatarUrl || DEFAULT_PROFILE_AVATAR;
  avatarPreview.onerror = () => {
    avatarPreview.onerror = null;
    avatarPreview.src = DEFAULT_PROFILE_AVATAR;
  };
}

async function uploadAvatar(file) {
  const form = new FormData();
  form.append("image", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    showStatus("Η μεταφόρτωση εικόνας απέτυχε.", "error");
    return null;
  }

  const data = await res.json();
  return data.url;
}

// Bio character counter
const bioField = document.getElementById("bio");
const bioCounter = document.getElementById("bioCharCount");
if (bioField && bioCounter) {
  bioField.addEventListener("input", () => {
    bioCounter.textContent = bioField.value.length;
  });
}

document.getElementById("avatar").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  clearStatus();
  const url = await uploadAvatar(file);
  if (!url) return;

  document.getElementById("avatarUrl").value = url;
  document.getElementById("avatarPreview").src = url;
  showStatus("Το avatar μεταφορτώθηκε. Αποθηκεύστε το προφίλ για εφαρμογή.", "success");
});

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearStatus();

  const payload = {
    firstName: document.getElementById("firstName").value,
    lastName: document.getElementById("lastName").value,
    avatarUrl: document.getElementById("avatarUrl").value,
    bio: (document.getElementById("bio")?.value || "").slice(0, 500)
  };

  const res = await fetch("/api/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    showStatus("Η ενημέρωση προφίλ απέτυχε.", "error");
    return;
  }

  showStatus("Το προφίλ ενημερώθηκε.", "success");
});

document.getElementById("passwordForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearStatus();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword !== confirmPassword) {
    showStatus("Οι νέοι κωδικοί δεν ταιριάζουν.", "error");
    return;
  }

  const res = await fetch("/api/auth/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!res.ok) {
    showStatus("Ο τρέχων κωδικός είναι λανθασμένος.", "error");
    return;
  }

  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  showStatus("Ο κωδικός ενημερώθηκε.", "success");
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/admin/login.html";
});

loadProfile();
