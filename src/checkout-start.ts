/**
 * Start Stripe Checkout (hosted) via Worker. Used by assessment paywall and /subscribe/.
 */

import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";

export type CheckoutPaths = {
  successPath?: string;
  cancelPath?: string;
};

export async function startSubscriptionCheckout(
  priceId: string,
  paths?: CheckoutPaths
): Promise<void> {
  const trimmed = priceId?.trim();
  if (!trimmed) {
    alert(
      "Subscription price IDs are missing. Add STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY to your Cloudflare Worker (same as checkout validation) or to .env before build."
    );
    return;
  }

  const cfg = await resolveSupabaseConfig();
  if (!cfg?.url || !cfg?.anonKey) {
    alert("Sign-in is not configured. Add Supabase keys and rebuild.");
    return;
  }

  const supabase = createSupabaseBrowserClient(cfg.url, cfg.anonKey);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/?next=${next}`;
    return;
  }

  let res: Response;
  try {
    res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        priceId: trimmed,
        successPath: paths?.successPath,
        cancelPath: paths?.cancelPath,
      }),
    });
  } catch {
    alert(
      "Could not reach checkout. Use your deployed site with the Worker (wrangler deploy), or run wrangler dev after npm run build."
    );
    return;
  }

  let data: {
    url?: string;
    error?: string;
    detail?: string;
    code?: string;
    stripeType?: string;
    hint?: string;
    missing?: string[];
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    alert(`Checkout failed (${res.status}). Check the Worker has STRIPE_SECRET_KEY set.`);
    return;
  }
  if (!res.ok) {
    const lines = [
      data.error,
      data.detail,
      data.code ? `Stripe code: ${data.code}` : "",
      data.stripeType ? `Stripe type: ${data.stripeType}` : "",
      data.hint,
      data.missing?.length ? `Missing on Worker: ${data.missing.join(", ")}` : "",
      res.status === 503
        ? "Debug: open /api/public-config in a new tab. If stripeSecretConfigured is false, this deployment’s Worker does not see STRIPE_SECRET_KEY (wrong worker, env, or an empty [vars] entry overriding the secret)."
        : "",
    ].filter(Boolean);
    alert(lines.length ? lines.join("\n\n") : "Could not start checkout");
    return;
  }
  if (data.url) {
    window.location.href = data.url;
  }
}
