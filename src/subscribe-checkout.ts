/**
 * /subscribe/ page: monthly and yearly Checkout buttons.
 */

import { mergeCheckoutPricesFromWorker } from "./checkout-prices";
import { startSubscriptionCheckout } from "./checkout-start";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";

async function init(): Promise<void> {
  await mergeCheckoutPricesFromWorker();
  const buttons = document.querySelectorAll<HTMLElement>("[data-checkout-price]");
  let anyPrice = false;
  buttons.forEach((btn) => {
    const priceId = btn.dataset.checkoutPrice?.trim();
    if (!priceId) {
      (btn as HTMLButtonElement).disabled = true;
      return;
    }
    anyPrice = true;
    btn.addEventListener("click", () => {
      void startSubscriptionCheckout(priceId, {
        successPath: "/subscribe/success",
        cancelPath: "/subscribe/cancel",
      });
    });
  });
  if (!anyPrice) {
    document.getElementById("subscribe-config-hint")?.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => void init());

type SubscriptionSummary = {
  status: string;
  stripe_subscription_id: string | null;
  updated_at?: string;
  stripe?: {
    unit_amount: number | null;
    currency: string | null;
    interval: string | null;
    interval_count: number | null;
    current_period_end: number | null;
    cancel_at_period_end: boolean | null;
  };
};

function show(el: HTMLElement | null, visible: boolean): void {
  if (el) el.hidden = !visible;
}

function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

function moneyFromMinorUnits(unitAmount: number, currency: string): string {
  const cur = currency.toUpperCase();
  const major = unitAmount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(major);
  } catch {
    return `${major.toFixed(2)} ${cur}`;
  }
}

function fmtStripePeriodEnd(unixSeconds: number): string {
  const ms = unixSeconds * 1000;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function parseUnixSeconds(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) return input;
  if (typeof input === "string") {
    const n = Number(input);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function statusLabel(status: string | undefined | null): string {
  const s = String(status || "").trim();
  if (!s) return "No subscription found";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchSubscription(accessToken: string): Promise<SubscriptionSummary | null> {
  const res = await fetch("/api/subscription", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Request failed (${res.status})`);
  }
  return (await res.json()) as SubscriptionSummary;
}

async function cancelSubscription(accessToken: string): Promise<void> {
  const res = await fetch("/api/cancel-subscription", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Request failed (${res.status})`);
  }
}

async function initManage(): Promise<void> {
  const manage = document.getElementById("manage-subscription");
  const statusEl = document.getElementById("manage-sub-status");
  const detailEl = document.getElementById("manage-sub-detail");
  const errEl = document.getElementById("manage-sub-error");
  const cancelBtn = document.getElementById("manage-sub-cancel") as HTMLButtonElement | null;
  if (!manage || !statusEl || !detailEl || !cancelBtn) return;

  const cfg = await resolveSupabaseConfig();
  if (!cfg?.url || !cfg?.anonKey) return;

  const supabase = createSupabaseBrowserClient(cfg.url, cfg.anonKey);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  try {
    const sub = await fetchSubscription(session.access_token);
    if (!sub) return;

    const s = String(sub.status || "").toLowerCase();
    const active = s === "active" || s === "trialing";
    if (!active) return;

    show(manage, true);
    setText(statusEl, statusLabel(sub.status));

    const parts: string[] = [];
    const stripe = sub.stripe;
    if (stripe?.unit_amount != null && stripe.currency) {
      const interval = stripe.interval || "month";
      const count = stripe.interval_count && stripe.interval_count > 1 ? stripe.interval_count : null;
      const every = count ? `every ${count} ${interval}s` : `per ${interval}`;
      parts.push(`${moneyFromMinorUnits(stripe.unit_amount, stripe.currency)} ${every}`);
    }
    const renewalTs = parseUnixSeconds(stripe?.current_period_end);
    if (renewalTs) parts.push(`Renews ${fmtStripePeriodEnd(renewalTs)}`);
    if (stripe?.cancel_at_period_end) parts.push("Canceling at period end");
    if (sub.stripe_subscription_id) parts.push(`ID ${sub.stripe_subscription_id}`);
    setText(detailEl, parts.join(" · "));

    cancelBtn.disabled = stripe?.cancel_at_period_end === true;
    cancelBtn.onclick = async () => {
      const ok = confirm(
        "Cancel your subscription?\n\nYour access may continue until the end of the current billing period."
      );
      if (!ok) return;
      cancelBtn.disabled = true;
      show(errEl, false);
      try {
        const { data } = await supabase.auth.getSession();
        const fresh = data.session;
        if (!fresh?.access_token) throw new Error("Not signed in.");
        await cancelSubscription(fresh.access_token);
        setText(detailEl, parts.concat(["Canceling at period end"]).join(" · "));
      } catch (e) {
        cancelBtn.disabled = false;
        show(errEl, true);
        setText(errEl, e instanceof Error ? e.message : String(e));
      }
    };
  } catch (e) {
    show(manage, true);
    setText(statusEl, "Could not load");
    show(errEl, true);
    setText(errEl, e instanceof Error ? e.message : String(e));
  }
}

document.addEventListener("DOMContentLoaded", () => void initManage());
