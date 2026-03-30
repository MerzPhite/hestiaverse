/**
 * Cloudflare Worker: static assets + Stripe Checkout + webhooks.
 * Deploy: npm run build && npx wrangler deploy
 */

import Stripe from "stripe";
import { edgePaywallResponse } from "./paywall";

export interface Env {
  ASSETS: Fetcher;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SITE_URL: string;
  STRIPE_PRICE_MONTHLY: string;
  STRIPE_PRICE_YEARLY: string;
}

const ALLOWED_SUCCESS_PATHS = new Set(["/subscribe/success", "/assessment/report"]);
const ALLOWED_CANCEL_PATHS = new Set(["/subscribe/cancel", "/assessment/paywall"]);

/** Public site origin for Stripe redirects and CORS. Falls back to this request's host if SITE_URL is unset. */
function effectiveSiteUrl(request: Request, env: Env): string {
  const fromEnv = (env.SITE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin.replace(/\/$/, "");
}

function stripeClient(secret: string): Stripe {
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function stripeCustomerId(
  c: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if ("deleted" in c && c.deleted) return null;
  if ("id" in c && typeof c.id === "string") return c.id;
  return null;
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

function stripeFailureBody(e: unknown): { detail: string; code?: string; stripeType?: string } {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const detail = typeof o.message === "string" ? o.message : JSON.stringify(e);
    const code = typeof o.code === "string" ? o.code : undefined;
    const stripeType = typeof o.type === "string" ? o.type : undefined;
    return { detail, code, stripeType };
  }
  return { detail: String(e) };
}

function corsFor(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const site = effectiveSiteUrl(request, env);
  const ok =
    !origin ||
    origin === site ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  if (!ok) return {};
  return {
    "Access-Control-Allow-Origin": origin || site || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

async function getSupabaseUser(
  env: Env,
  authHeader: string | null
): Promise<{ id: string; email?: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string; email?: string };
  if (!u.id) return null;
  return { id: u.id, email: u.email };
}

async function getSubscriptionRowForUser(
  env: Env,
  userId: string
): Promise<{
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  updated_at?: string;
} | null> {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const res = await fetch(
    `${base}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(
      userId
    )}&select=user_id,stripe_customer_id,stripe_subscription_id,status,updated_at`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    console.error("Supabase read failed", res.status, t);
    throw new Error(`Supabase subscriptions read failed (${res.status}): ${t}`);
  }
  const rows = (await res.json()) as Array<{
    user_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    status: string;
    updated_at?: string;
  }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] ?? null;
}

async function upsertSubscription(
  env: Env,
  row: {
    user_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    status: string;
    updated_at?: string;
  }
): Promise<void> {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const payload = { ...row, updated_at: row.updated_at ?? new Date().toISOString() };
  const res = await fetch(`${base}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Supabase upsert failed", res.status, t);
    throw new Error(`Supabase subscriptions upsert failed (${res.status}): ${t}`);
  }
}

/**
 * One Stripe API read: subscription metadata often has supabase_user_id even if the session payload omits client_reference_id.
 */
async function checkoutSessionSubscriptionWriteContext(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<{ userId: string; sub: Stripe.Subscription } | null> {
  if (session.mode !== "subscription" || !session.subscription) return null;
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId =
    session.client_reference_id?.trim() ||
    session.metadata?.supabase_user_id?.trim() ||
    sub.metadata?.supabase_user_id?.trim() ||
    undefined;
  if (!userId) return null;
  return { userId, sub };
}

function applySubscriptionRowFromStripeSubscription(
  sub: Stripe.Subscription
): {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  status: string;
} | null {
  const userId = sub.metadata?.supabase_user_id?.trim();
  if (!userId) return null;
  return {
    user_id: userId,
    stripe_customer_id: stripeCustomerId(sub.customer),
    stripe_subscription_id: sub.id,
    status: sub.status,
  };
}

async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  if (!env.STRIPE_SECRET_KEY?.trim()) {
    return json(
      {
        error: "Server not configured",
        detail:
          "Add STRIPE_SECRET_KEY to this Worker (for example wrangler secret put STRIPE_SECRET_KEY).",
        missing: ["STRIPE_SECRET_KEY"],
      },
      503,
      cors
    );
  }

  const site = effectiveSiteUrl(request, env);

  let body: { priceId?: string; successPath?: string; cancelPath?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  const monthly = env.STRIPE_PRICE_MONTHLY?.trim();
  const yearly = env.STRIPE_PRICE_YEARLY?.trim();
  const allowedPrices = new Set([monthly, yearly].filter(Boolean));
  const priceId = body.priceId?.trim();
  if (!priceId || !allowedPrices.has(priceId)) {
    return json({ error: "Invalid price" }, 400, cors);
  }

  const user = await getSupabaseUser(env, request.headers.get("Authorization"));
  if (!user) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  let successPath = "/subscribe/success";
  if (typeof body.successPath === "string" && ALLOWED_SUCCESS_PATHS.has(body.successPath)) {
    successPath = body.successPath;
  }
  let cancelPath = "/subscribe/cancel";
  if (typeof body.cancelPath === "string" && ALLOWED_CANCEL_PATHS.has(body.cancelPath)) {
    cancelPath = body.cancelPath;
  }

  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}${cancelPath}`,
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });
    return json({ url: session.url }, 200, cors);
  } catch (e) {
    console.error("Stripe checkout.sessions.create", e);
    const { detail, code, stripeType } = stripeFailureBody(e);
    return json(
      {
        error: "Stripe error",
        detail,
        code,
        stripeType,
        hint:
          "Common fixes: use a secret key and price IDs from the same Stripe mode (test vs live), and use recurring prices for subscription checkout.",
      },
      502,
      cors
    );
  }
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const sig = request.headers.get("stripe-signature");
  if (!sig || !env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) {
    return json({ error: "Not configured" }, 503);
  }
  const raw = await request.text();
  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature", err);
    return json({ error: "Invalid signature" }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const ctx = await checkoutSessionSubscriptionWriteContext(stripe, session);
      const custId = stripeCustomerId(session.customer);
      if (!ctx) {
        console.error(
          "checkout.session.completed: could not resolve Supabase user id (set client_reference_id on Checkout or supabase_user_id on subscription metadata)",
          session.id
        );
      } else if (!custId) {
        console.error("checkout.session.completed: missing Stripe customer on session", session.id);
      } else {
        await upsertSubscription(env, {
          user_id: ctx.userId,
          stripe_customer_id: custId,
          stripe_subscription_id: ctx.sub.id,
          status: ctx.sub.status,
        });
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const row = applySubscriptionRowFromStripeSubscription(sub);
      if (row) {
        await upsertSubscription(env, row);
      } else {
        console.warn("subscription webhook skipped: missing metadata supabase_user_id", event.type, sub.id);
      }
    }
  } catch (e) {
    console.error("Webhook handler", e);
    return json(
      { error: "Handler error", detail: e instanceof Error ? e.message : String(e) },
      500
    );
  }

  return json({ received: true });
}

/** Public client config (anon key is safe for browsers with RLS). Filled from Worker secrets when HTML build omitted them. */
function handlePublicConfig(request: Request, env: Env): Response {
  const cors = corsFor(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, cors);
  }
  const urlStr = (env.SUPABASE_URL || "").trim();
  const anonKey = (env.SUPABASE_ANON_KEY || "").trim();
  const siteFromEnv = (env.SITE_URL || "").trim().replace(/\/+$/, "");
  const site = siteFromEnv || new URL(request.url).origin.replace(/\/+$/, "");
  const monthly = env.STRIPE_PRICE_MONTHLY?.trim();
  const yearly = env.STRIPE_PRICE_YEARLY?.trim();
  const payload: {
    url: string;
    anonKey: string;
    siteUrl?: string;
    stripePriceMonthly?: string;
    stripePriceYearly?: string;
    /** True when this Worker has STRIPE_SECRET_KEY (same check as checkout). Open this URL in the browser to debug 503 on checkout. */
    stripeSecretConfigured: boolean;
  } = {
    url: urlStr,
    anonKey,
    stripeSecretConfigured: !!env.STRIPE_SECRET_KEY?.trim(),
  };
  if (site) payload.siteUrl = `${site}/`;
  if (monthly) payload.stripePriceMonthly = monthly;
  if (yearly) payload.stripePriceYearly = yearly;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

async function handleGetSubscription(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);

  const user = await getSupabaseUser(env, request.headers.get("Authorization"));
  if (!user) return json({ error: "Unauthorized" }, 401, cors);

  const row = await getSubscriptionRowForUser(env, user.id);
  if (!row) return json({ error: "Not found" }, 404, cors);

  if (env.STRIPE_SECRET_KEY?.trim() && row.stripe_subscription_id) {
    const stripe = stripeClient(env.STRIPE_SECRET_KEY);
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const firstItem = sub.items?.data?.[0];
      const price = firstItem?.price;
      const unitAmount = typeof price?.unit_amount === "number" ? price.unit_amount : null;
      const currency = typeof price?.currency === "string" ? price.currency : null;
      const interval = typeof price?.recurring?.interval === "string" ? price.recurring.interval : null;
      const intervalCount =
        typeof price?.recurring?.interval_count === "number" ? price.recurring.interval_count : null;
      const itemPeriodEndRaw = (firstItem as unknown as { current_period_end?: unknown } | undefined)
        ?.current_period_end;
      const currentPeriodEndFromSub =
        typeof sub.current_period_end === "number" ? sub.current_period_end : null;
      const currentPeriodEndFromItem =
        typeof itemPeriodEndRaw === "number" ? itemPeriodEndRaw : null;
      const currentPeriodEnd = currentPeriodEndFromSub ?? currentPeriodEndFromItem;
      const cancelAtPeriodEnd =
        typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end : null;

      return json(
        {
          ...row,
          stripe: {
            unit_amount: unitAmount,
            currency,
            interval,
            interval_count: intervalCount,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
          },
        },
        200,
        { ...cors, "Cache-Control": "no-store" }
      );
    } catch (e) {
      console.error("Stripe subscription retrieve failed", row.stripe_subscription_id, e);
      // Fall back to DB row only if Stripe is temporarily unavailable.
    }
  }

  return json(row, 200, { ...cors, "Cache-Control": "no-store" });
}

async function handleCancelSubscription(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "Not configured" }, 503, cors);

  const user = await getSupabaseUser(env, request.headers.get("Authorization"));
  if (!user) return json({ error: "Unauthorized" }, 401, cors);

  const row = await getSubscriptionRowForUser(env, user.id);
  if (!row?.stripe_subscription_id) return json({ error: "No active subscription" }, 409, cors);

  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  await upsertSubscription(env, {
    user_id: user.id,
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_id: updated.id,
    status: updated.status,
  });

  return json(
    {
      ok: true,
      stripe_subscription_id: updated.id,
      status: updated.status,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end,
    },
    200,
    { ...cors, "Cache-Control": "no-store" }
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (path === "/api/public-config") {
      return handlePublicConfig(request, env);
    }

    if (path === "/api/create-checkout-session") {
      return handleCreateCheckout(request, env);
    }
    if (path === "/api/stripe-webhook") {
      return handleWebhook(request, env);
    }
    if (path === "/api/subscription") {
      return handleGetSubscription(request, env);
    }
    if (path === "/api/cancel-subscription") {
      return handleCancelSubscription(request, env);
    }

    const paywalled = await edgePaywallResponse(request, env);
    if (paywalled) {
      return paywalled;
    }

    return env.ASSETS.fetch(request);
  },
};
