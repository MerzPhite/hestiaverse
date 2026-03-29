/**
 * Home page: guest sign-in/up, signed-in without subscription (subscribe CTA), or full library with subscription.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { augmentAuthErrorMessage, supabaseEmailRedirectUrl } from "./auth-helpers";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";
import { userHasActiveSubscription } from "./subscription-access";

function show(el: HTMLElement | null, visible: boolean): void {
  if (el) el.hidden = !visible;
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function safeNextParam(): string | null {
  const next = new URLSearchParams(location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes(":")) return null;
  return next;
}

async function initHomePanels(): Promise<void> {
  const guest = document.getElementById("home-guest-panel");
  const needsSub = document.getElementById("home-needs-sub-panel");
  const signed = document.getElementById("home-signed-in-panel");
  if (!guest || !needsSub || !signed) return;

  const missingEl = document.getElementById("home-auth-missing-config");
  const errEl = document.getElementById("home-auth-error");
  const okEl = document.getElementById("home-auth-message");
  const sessionEmailEl = document.getElementById("home-session-email");
  const needsSubEmailEl = document.getElementById("home-needs-sub-email");
  const subscribeCta = document.getElementById("home-subscribe-cta") as HTMLAnchorElement | null;

  const cfg = await resolveSupabaseConfig();
  if (!cfg) {
    show(missingEl, true);
    guest.hidden = false;
    needsSub.hidden = true;
    signed.hidden = true;
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

  async function refreshPanels(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      guest.hidden = false;
      needsSub.hidden = true;
      signed.hidden = true;
      return;
    }

    const email = session.user.email ?? "Signed in";
    setText(sessionEmailEl, email);
    setText(needsSubEmailEl, email);

    const sub = await userHasActiveSubscription(supabase, session.user.id);
    if (sub) {
      guest.hidden = true;
      needsSub.hidden = true;
      signed.hidden = false;
    } else {
      guest.hidden = true;
      needsSub.hidden = false;
      signed.hidden = true;
      if (subscribeCta) {
        subscribeCta.href = "/subscribe/?next=" + encodeURIComponent("/");
      }
    }
  }

  const signInForm = document.getElementById("home-form-sign-in") as HTMLFormElement | null;
  signInForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const emailEl = document.getElementById("home-signin-email") as HTMLInputElement | null;
    const passEl = document.getElementById("home-signin-password") as HTMLInputElement | null;
    if (!emailEl || !passEl) return;
    const email = emailEl.value.trim();
    const password = passEl.value;
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
    await refreshPanels();
  });

  const signUpForm = document.getElementById("home-form-sign-up") as HTMLFormElement | null;
  signUpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const emailEl = document.getElementById("home-signup-email") as HTMLInputElement | null;
    const passEl = document.getElementById("home-signup-password") as HTMLInputElement | null;
    if (!emailEl || !passEl) return;
    const email = emailEl.value.trim();
    const password = passEl.value;
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
    await refreshPanels();
  });

  document.getElementById("home-sign-out")?.addEventListener("click", async () => {
    setError("");
    setOk("");
    await supabase.auth.signOut();
    await refreshPanels();
  });

  document.getElementById("home-needs-sub-sign-out")?.addEventListener("click", async () => {
    setError("");
    setOk("");
    await supabase.auth.signOut();
    await refreshPanels();
  });

  supabase.auth.onAuthStateChange(() => {
    void refreshPanels();
  });

  void refreshPanels();
}

document.addEventListener("DOMContentLoaded", () => {
  void initHomePanels();
});
