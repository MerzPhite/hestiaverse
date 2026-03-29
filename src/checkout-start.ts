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
    alert("Subscription prices are not configured for this build. Add STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY to your environment and rebuild.");
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

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) {
    alert(data.error || "Could not start checkout");
    return;
  }
  if (data.url) {
    window.location.href = data.url;
  }
}
