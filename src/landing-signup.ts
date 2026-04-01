/**
 * Landing page: email-only sign up (magic link / OTP).
 */

import { createSupabaseBrowserClient } from "./supabase-browser";
import { augmentAuthErrorMessage, supabaseEmailRedirectUrl } from "./auth-helpers";
import { resolveSupabaseConfig } from "./supabase-env";

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function show(el: HTMLElement | null, visible: boolean): void {
  if (el) el.hidden = !visible;
}

async function initLandingSignup(): Promise<void> {
  const form = document.getElementById("landing-signup-form") as HTMLFormElement | null;
  if (!form) return;

  const emailInput = document.getElementById("landing-email") as HTMLInputElement | null;
  const btn = document.getElementById("landing-signup-submit") as HTMLButtonElement | null;
  const errEl = document.getElementById("landing-signup-error");
  const okEl = document.getElementById("landing-signup-ok");

  const cfg = await resolveSupabaseConfig();
  if (!cfg) return;

  const emailRedirectTo = supabaseEmailRedirectUrl(cfg.siteUrl);
  const supabase = createSupabaseBrowserClient(cfg.url, cfg.anonKey);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    show(errEl, false);
    show(okEl, false);
    setText(errEl, "");
    setText(okEl, "");
    if (btn) btn.disabled = true;

    const email = emailInput?.value?.trim() || "";
    if (!email) {
      show(errEl, true);
      setText(errEl, "Please enter your email address.");
      if (btn) btn.disabled = false;
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      show(errEl, true);
      setText(errEl, augmentAuthErrorMessage(error.message, emailRedirectTo));
      if (btn) btn.disabled = false;
      return;
    }

    show(okEl, true);
    setText(okEl, "Check your email for a sign-in link. You can close this tab after you click it.");
    if (btn) btn.disabled = false;
  });
}

document.addEventListener("DOMContentLoaded", () => void initLandingSignup());

