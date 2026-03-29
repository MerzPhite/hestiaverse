/**
 * Edge paywall: do not serve premium HTML from ASSETS until session cookie + active subscription.
 * Path rules should stay aligned with src/site-gate.ts (subscription + public + subscribe + assessment).
 */

import { createServerClient } from "@supabase/ssr";
import { parse } from "cookie";

export type PaywallEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

function normalizePath(pathname: string): string {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p) p = "/";
  return p;
}

function isStaticAssetPath(path: string): boolean {
  if (path.startsWith("/js/")) return true;
  if (path.startsWith("/assets/")) return true;
  if (path === "/favicon.ico") return true;
  const lower = path.toLowerCase();
  if (/\.(js|mjs|cjs|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|map|txt|json)$/.test(lower)) return true;
  return false;
}

function isPublicPath(p: string): boolean {
  if (p === "/") return true;
  if (p === "/about") return true;
  if (p === "/connection" || p.startsWith("/connection/")) return true;
  if (p === "/connection-2" || p.startsWith("/connection-2/")) return true;
  if (p === "/signup" || p === "/signup-success" || p === "/login") return true;
  if (p === "/subscribe/success" || p === "/subscribe/cancel") return true;
  if (p === "/landing" || p.startsWith("/landing/")) return true;
  return false;
}

function allowsWithoutSubscription(p: string): boolean {
  if (p === "/subscribe") return true;
  if (p === "/assessment" || p.startsWith("/assessment/")) return true;
  return false;
}

export function edgePaywallApplies(path: string): boolean {
  if (path.startsWith("/api/")) return false;
  if (isStaticAssetPath(path)) return false;
  if (isPublicPath(path)) return false;
  if (allowsWithoutSubscription(path)) return false;
  return true;
}

function cookiePairs(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  const parsed = parse(header);
  return Object.entries(parsed).map(([name, value]) => ({
    name,
    value: value ?? "",
  }));
}

async function subscriptionActive(env: PaywallEnv, userId: string): Promise<boolean> {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const res = await fetch(
    `${base}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=status`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return false;
  const rows = (await res.json()) as { status?: string }[];
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const s = String(rows[0].status || "").toLowerCase();
  return s === "active" || s === "trialing";
}

/**
 * If non-null, return this Response instead of serving static HTML (redirect to sign-in or subscribe).
 */
export async function edgePaywallResponse(
  request: Request,
  env: PaywallEnv
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!edgePaywallApplies(path)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookiePairs(request.headers.get("Cookie"));
      },
      setAll() {
        /* Session refresh is handled in the browser; gate is read-only. */
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const origin = url.origin;
  const returnTo = `${path}${url.search}`;

  if (!user) {
    return Response.redirect(`${origin}/?next=${encodeURIComponent(returnTo)}`, 302);
  }

  const ok = await subscriptionActive(env, user.id);
  if (!ok) {
    return Response.redirect(`${origin}/subscribe/?next=${encodeURIComponent(returnTo)}`, 302);
  }

  return null;
}
