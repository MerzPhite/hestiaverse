/**
 * Require Supabase session on all pages except landing, signup (+ success), and login.
 */

import { createClient, type Session } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-env";

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

function setAuthedView(): void {
  html.classList.remove("hvs-auth-fail");
  html.classList.add("hvs-auth-ok");
}

function setWallView(missingConfig: boolean): void {
  html.classList.remove("hvs-auth-ok");
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
    link.href = "/login/?next=" + encodeURIComponent(next);
  }
}

async function init(): Promise<void> {
  if (pathIsPublic()) {
    html.classList.add("hvs-public");
    html.classList.remove("hvs-needs-auth", "hvs-auth-ok", "hvs-auth-fail");
    return;
  }

  html.classList.remove("hvs-public");
  html.classList.add("hvs-needs-auth");

  const cfg = await resolveSupabaseConfig();
  if (!cfg) {
    setWallView(true);
    return;
  }

  const supabase = createClient(cfg.url, cfg.anonKey);

  function applySession(session: Session | null): void {
    if (session) setAuthedView();
    else setWallView(false);
  }

  void supabase.auth.getSession().then(({ data }) => {
    applySession(data.session);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
}

document.addEventListener("DOMContentLoaded", () => void init());
