/**
 * Supabase auth: sign up, sign in, sign out (bundled for /login/).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readConfig(): { url: string; anonKey: string } | null {
  const el = document.getElementById("supabase-config");
  if (!el?.textContent?.trim()) return null;
  try {
    const j = JSON.parse(el.textContent) as { url?: string; anonKey?: string };
    if (j.url && j.anonKey) return { url: j.url, anonKey: j.anonKey };
  } catch {
    /* ignore */
  }
  return null;
}

function show(el: HTMLElement | null, visible: boolean): void {
  if (el) el.hidden = !visible;
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function init(): void {
  const root = document.getElementById("login-page");
  if (!root) return;

  const cfg = readConfig();
  const missingEl = document.getElementById("auth-missing-config");
  const signedOutEl = document.getElementById("auth-signed-out");
  const signedInEl = document.getElementById("auth-signed-in");
  const userEmailEl = document.getElementById("auth-user-email");
  const errEl = document.getElementById("auth-error");
  const okEl = document.getElementById("auth-message");

  if (!cfg) {
    show(missingEl, true);
    show(signedOutEl, false);
    show(signedInEl, false);
    return;
  }

  show(missingEl, false);

  const supabase: SupabaseClient = createClient(cfg.url, cfg.anonKey);

  function setError(msg: string): void {
    setText(errEl, msg);
    show(errEl, msg.length > 0);
    if (msg) setText(okEl, "");
    show(okEl, false);
  }

  function setOk(msg: string): void {
    setText(okEl, msg);
    show(okEl, msg.length > 0);
    if (msg) setText(errEl, "");
    show(errEl, false);
  }

  async function refreshSession(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session?.user) {
      setText(userEmailEl, session.user.email ?? "Signed in");
      show(signedOutEl, false);
      show(signedInEl, true);
    } else {
      show(signedOutEl, true);
      show(signedInEl, false);
    }
  }

  const signInForm = document.getElementById("form-sign-in") as HTMLFormElement | null;
  signInForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = (document.getElementById("signin-email") as HTMLInputElement).value.trim();
    const password = (document.getElementById("signin-password") as HTMLInputElement).value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    setOk("You're signed in.");
    await refreshSession();
  });

  const signUpForm = document.getElementById("form-sign-up") as HTMLFormElement | null;
  signUpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = (document.getElementById("signup-email") as HTMLInputElement).value.trim();
    const password = (document.getElementById("signup-password") as HTMLInputElement).value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    setOk(
      "Check your email to confirm your account if required. You can sign in after confirming."
    );
    await refreshSession();
  });

  document.getElementById("auth-sign-out")?.addEventListener("click", async () => {
    setError("");
    setOk("");
    await supabase.auth.signOut();
    await refreshSession();
    setOk("You're signed out.");
  });

  supabase.auth.onAuthStateChange(() => {
    void refreshSession();
  });

  void refreshSession();
}

document.addEventListener("DOMContentLoaded", init);
