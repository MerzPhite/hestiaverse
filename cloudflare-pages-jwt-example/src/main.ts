/**
 * Simple demo: login (get JWT) and call protected API.
 * Build with: npm run build. Served as static asset from index.html.
 */
const form = document.getElementById("login-form") as HTMLFormElement;
const out = document.getElementById("out") as HTMLPreElement;
const protectedBtn = document.getElementById("protected-btn") as HTMLButtonElement;

let token: string | null = null;

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (document.getElementById("email") as HTMLInputElement).value;
  const password = (document.getElementById("password") as HTMLInputElement).value;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      out.textContent = `Error: ${data.error ?? res.status}`;
      return;
    }
    token = data.token;
    out.textContent = "Logged in. Token saved. Click 'Call protected API'.";
  } catch (err) {
    out.textContent = `Request failed: ${err}`;
  }
});

protectedBtn?.addEventListener("click", async () => {
  if (!token) {
    out.textContent = "Log in first.";
    return;
  }
  try {
    const res = await fetch("/api/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = `Request failed: ${err}`;
  }
});
