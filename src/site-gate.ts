/**
 * Require Supabase session on protected pages; require active subscription for premium content.
 * Keep path rules in sync with worker/paywall.ts (edge redirects before static HTML is served).
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";
import { userHasActiveSubscription } from "./subscription-access";

const html = document.documentElement;

/** Match inline script in layouts (keep in sync). */
export function pathIsPublic(): boolean {
  let p = location.pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p) p = "/";
  if (p === "/") return true;
  if (p === "/about") return true;
  if (p === "/connection" || p.startsWith("/connection/")) return true;
  if (p === "/connection-2" || p.startsWith("/connection-2/")) return true;
  if (
    p === "/signup" ||
    p === "/signup-success" ||
    p === "/login" ||
    p === "/subscribe/success" ||
    p === "/subscribe/cancel"
  ) {
    return true;
  }
  if (p === "/landing" || p.startsWith("/landing/")) return true;
  return false;
}

function normalizePath(): string {
  let p = location.pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p) p = "/";
  return p;
}

/** Premium library: subscription required once signed in. Subscribe and assessment flows stay reachable. */
function pathRequiresActiveSubscription(): boolean {
  if (pathIsPublic()) return false;
  const p = normalizePath();
  if (p === "/subscribe") return false;
  if (p === "/assessment" || p.startsWith("/assessment/")) return false;
  return true;
}

function clearGateOutcomeClasses(): void {
  html.classList.remove("hvs-auth-ok", "hvs-auth-fail", "hvs-sub-fail");
}

function setCheckingView(): void {
  clearGateOutcomeClasses();
}

function setAuthedView(): void {
  clearGateOutcomeClasses();
  html.classList.add("hvs-auth-ok");
}

function setWallView(missingConfig: boolean): void {
  clearGateOutcomeClasses();
  html.classList.add("hvs-auth-fail");
  const wallMissing = document.getElementById("site-auth-wall-missing");
  const wallSignin = document.getElementById("site-auth-wall-signin");
  if (wallMissing && wallSignin) {
    wallMissing.hidden = !missingConfig;
    wallSignin.hidden = missingConfig;
  }
  const link = document.getElementById("site-auth-wall-login-link") as HTMLAnchorElement | null;
  if (link && !missingConfig) {
    const next = location.pathname + location.search;
    link.href = "/?next=" + encodeURIComponent(next);
  }
}

function setSubWallView(): void {
  clearGateOutcomeClasses();
  html.classList.add("hvs-sub-fail");
  const next = location.pathname + location.search;
  const subLink = document.getElementById("site-sub-wall-subscribe-link") as HTMLAnchorElement | null;
  if (subLink) subLink.href = "/subscribe/?next=" + encodeURIComponent(next);
  const homeLink = document.getElementById("site-sub-wall-home-link") as HTMLAnchorElement | null;
  if (homeLink) homeLink.href = "/";
}

async function applyAccess(
  supabase: SupabaseClient,
  session: Session | null
): Promise<void> {
  if (!session) {
    setWallView(false);
    return;
  }
  if (!pathRequiresActiveSubscription()) {
    setAuthedView();
    return;
  }
  const ok = await userHasActiveSubscription(supabase, session.user.id);
  if (ok) setAuthedView();
  else setSubWallView();
}

async function init(): Promise<void> {
  if (pathIsPublic()) {
    html.classList.add("hvs-public");
    html.classList.remove("hvs-needs-auth", "hvs-auth-ok", "hvs-auth-fail", "hvs-sub-fail");
    return;
  }

  html.classList.remove("hvs-public");
  html.classList.add("hvs-needs-auth");
  setCheckingView();

  const cfg = await resolveSupabaseConfig();
  if (!cfg) {
    setWallView(true);
    return;
  }

  const supabase = createSupabaseBrowserClient(cfg.url, cfg.anonKey);

  async function refreshFromSession(session: Session | null): Promise<void> {
    setCheckingView();
    await applyAccess(supabase, session);
  }

  const {
    data: { session: initial },
  } = await supabase.auth.getSession();
  await refreshFromSession(initial);

  supabase.auth.onAuthStateChange((_event, session) => {
    void refreshFromSession(session);
  });
}

document.addEventListener("DOMContentLoaded", () => void init());
