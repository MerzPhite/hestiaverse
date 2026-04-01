/**
 * Supabase auth: sign up, sign in, sign out (bundled for /login/).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { augmentAuthErrorMessage, supabaseEmailRedirectUrl } from "./auth-helpers";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";

function safeNextParam(): string | null {
  const next = new URLSearchParams(location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes(":")) return null;
  return next;
}

function show(el: HTMLElement | null, visible: boolean): void {
  if (el) el.hidden = !visible;
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function showNoticeModal(message: string): void {
  const modal = document.getElementById("auth-notice-modal");
  const text = document.getElementById("auth-notice-text");
  const closeBtn = document.getElementById("auth-notice-close");
  if (!modal || !text || !closeBtn) return;

  setText(text, message);
  show(modal as HTMLElement, true);
  modal.setAttribute("aria-hidden", "false");

  const close = (): void => {
    show(modal as HTMLElement, false);
    modal.setAttribute("aria-hidden", "true");
  };

  closeBtn.onclick = close;

  modal.onclick = (e: MouseEvent): void => {
    if (e.target === modal) close();
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") close();
    },
    { once: true }
  );
}

async function initAuth(): Promise<void> {
  const root = document.getElementById("login-page");
  if (!root) return;

  const cfg = await resolveSupabaseConfig();
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

  const emailRedirectTo = supabaseEmailRedirectUrl(cfg.siteUrl);
  const supabase: SupabaseClient = createSupabaseBrowserClient(cfg.url, cfg.anonKey);

  const { data: initial } = await supabase.auth.getSession();
  const next = safeNextParam();
  if (initial.session && next) {
    location.replace(next);
    return;
  }

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
      setError(augmentAuthErrorMessage(error.message, emailRedirectTo));
      return;
    }
    const n = safeNextParam();
    if (n) {
      location.assign(n);
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });
    if (error) {
      setError(augmentAuthErrorMessage(error.message, emailRedirectTo));
      return;
    }
    setOk(
      "Check your email to confirm your account if required. You can sign in after confirming."
    );
    showNoticeModal(
      "Check your email to confirm your account if required. You can sign in after confirming."
    );
    await refreshSession();
  });

  // If landing page provided an email, prefill the sign-up form to reduce friction.
  const prefillEmail = new URLSearchParams(location.search).get("email");
  if (prefillEmail) {
    const signupEmail = document.getElementById("signup-email") as HTMLInputElement | null;
    if (signupEmail && !signupEmail.value) signupEmail.value = prefillEmail;
  }

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

document.addEventListener("DOMContentLoaded", () => {
  void initAuth();
});
