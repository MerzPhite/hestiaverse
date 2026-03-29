/**
 * Stripe Price IDs in HTML can be empty when CI builds without .env. Worker exposes them on GET /api/public-config.
 */

export type PublicConfigWithStripe = {
  stripePriceMonthly?: string;
  stripePriceYearly?: string;
};

async function fetchPublicConfig(): Promise<PublicConfigWithStripe | null> {
  try {
    const res = await fetch("/api/public-config", { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as PublicConfigWithStripe;
  } catch {
    return null;
  }
}

/**
 * Fills `data-checkout-price` from the Worker when missing, for elements with `data-checkout-interval`.
 */
export async function mergeCheckoutPricesFromWorker(
  root: Document | HTMLElement = document
): Promise<void> {
  const buttons = root.querySelectorAll<HTMLElement>("[data-checkout-interval]");
  const needsMerge = [...buttons].some((b) => !b.dataset.checkoutPrice?.trim());
  if (!needsMerge) return;
  const cfg = await fetchPublicConfig();
  if (!cfg) return;
  const m = cfg.stripePriceMonthly?.trim();
  const y = cfg.stripePriceYearly?.trim();
  buttons.forEach((btn) => {
    if (btn.dataset.checkoutPrice?.trim()) return;
    const iv = btn.dataset.checkoutInterval;
    if (iv === "monthly" && m) btn.dataset.checkoutPrice = m;
    if (iv === "yearly" && y) btn.dataset.checkoutPrice = y;
  });
}
