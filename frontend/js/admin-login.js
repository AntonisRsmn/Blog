document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const email = document.getElementById("email")?.value;
  const password = document.getElementById("password")?.value;
  const apiBase = typeof API_BASE === "string" && API_BASE.trim() ? API_BASE : "/api";

  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    document.getElementById("error").textContent = "Το email ή ο κωδικός είναι λανθασμένα. Προσπαθήστε ξανά.";
    return;
  }

  const profileRes = await fetch(`${apiBase}/auth/profile`);
  if (!profileRes.ok) {
    window.location.href = "/admin/login";
    return;
  }

  const profile = await profileRes.json();
  const isAdminRole = profile.role === "admin" || profile.role === "staff";
  window.location.href = isAdminRole ? "/admin/dashboard" : "/admin/profile";
});
