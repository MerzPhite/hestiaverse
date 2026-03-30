import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { resolveSupabaseConfig } from "./supabase-env";

type SubscriptionSummary = {
  user_id: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
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

function statusLabel(status: string | undefined | null): string {
  const s = String(status || "").trim();
  if (!s) return "No subscription found";
  return s.charAt(0).toUpperCase() + s.slice(1);
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

function bindMenuInteractions(): void {
  const menu = document.getElementById("settings-menu");
  const btn = document.getElementById("settings-menu-button") as HTMLButtonElement | null;
  const panel = document.getElementById("settings-menu-panel");
  if (!menu || !btn || !panel) return;
  const btnEl: HTMLButtonElement = btn;
  const panelEl: HTMLElement = panel;

  function close(): void {
    show(panelEl, false);
    btnEl.setAttribute("aria-expanded", "false");
  }

  function toggle(): void {
    const next = panelEl.hidden;
    show(panelEl, next);
    btnEl.setAttribute("aria-expanded", next ? "true" : "false");
  }

  btnEl.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  document.addEventListener("click", (e) => {
    if (panelEl.hidden) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (menu.contains(target)) return;
    close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

async function renderForSession(
  supabase: SupabaseClient,
  session: Session | null
): Promise<void> {
  const menu = document.getElementById("settings-menu");
  const emailEl = document.getElementById("settings-user-email");
  const statusEl = document.getElementById("settings-subscription-status");
  const detailEl = document.getElementById("settings-subscription-detail");
  const cancelBtn = document.getElementById("settings-cancel-subscription") as HTMLButtonElement | null;
  const errEl = document.getElementById("settings-subscription-error");

  if (!menu || !statusEl || !detailEl || !cancelBtn) return;

  show(errEl, false);
  cancelBtn.disabled = true;

  if (!session?.user || !session.access_token) {
    show(menu, false);
    return;
  }

  show(menu, true);
  setText(emailEl, session.user.email ?? "Signed in");
  setText(statusEl, "Loading…");
  setText(detailEl, "");

  try {
    const sub = await fetchSubscription(session.access_token);
    if (!sub) {
      setText(statusEl, "No subscription found");
      setText(detailEl, "If you already paid, wait a moment and refresh.");
      cancelBtn.disabled = true;
      return;
    }

    setText(statusEl, statusLabel(sub.status));
    const s = String(sub.status || "").toLowerCase();
    const parts: string[] = [];

    const stripe = sub.stripe;
    if (stripe?.unit_amount != null && stripe.currency) {
      const interval = stripe.interval || "month";
      const count = stripe.interval_count && stripe.interval_count > 1 ? stripe.interval_count : null;
      const every = count ? `every ${count} ${interval}s` : `per ${interval}`;
      parts.push(`${moneyFromMinorUnits(stripe.unit_amount, stripe.currency)} ${every}`);
    }
    const renewalTs = parseUnixSeconds(stripe?.current_period_end);
    if (renewalTs) {
      parts.push(`Renews ${fmtStripePeriodEnd(renewalTs)}`);
    }
    if (stripe?.cancel_at_period_end) parts.push("Canceled (ends at period end)");
    if (s === "canceled") parts.push("Subscription canceled");

    setText(detailEl, parts.join("\n"));

    if (s === "canceled") {
      cancelBtn.disabled = true;
      cancelBtn.textContent = "Subscription canceled";
    } else if (stripe?.cancel_at_period_end) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = "Canceled at period end";
    } else {
      cancelBtn.textContent = "Cancel";
      cancelBtn.disabled = !(s === "active" || s === "trialing");
    }
  } catch (e) {
    setText(statusEl, "Could not load");
    setText(detailEl, "");
    show(errEl, true);
    setText(errEl, e instanceof Error ? e.message : String(e));
    cancelBtn.disabled = true;
  }

  cancelBtn.onclick = async () => {
    const ok = confirm(
      "Cancel your subscription?\n\nYour access may continue until the end of the current billing period."
    );
    if (!ok) return;
    cancelBtn.disabled = true;
    try {
      const { data } = await supabase.auth.getSession();
      const fresh = data.session;
      if (!fresh?.access_token) throw new Error("Not signed in.");
      await cancelSubscription(fresh.access_token);
      setText(statusEl, "Cancellation requested");
      show(errEl, false);
      setText(errEl, "");
    } catch (e) {
      show(errEl, true);
      setText(errEl, e instanceof Error ? e.message : String(e));
      cancelBtn.disabled = false;
    }
  };
}

async function init(): Promise<void> {
  bindMenuInteractions();

  const cfg = await resolveSupabaseConfig();
  if (!cfg) return;

  const supabase = createSupabaseBrowserClient(cfg.url, cfg.anonKey);
  const {
    data: { session: initial },
  } = await supabase.auth.getSession();
  await renderForSession(supabase, initial);

  supabase.auth.onAuthStateChange((_event, session) => {
    void renderForSession(supabase, session);
  });
}

document.addEventListener("DOMContentLoaded", () => void init());

