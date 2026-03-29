/**
 * Cloudflare Worker: static assets + Stripe Checkout + webhooks.
 * Deploy: npm run build && npx wrangler deploy
 */

import Stripe from "stripe";

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

function corsFor(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const site = (env.SITE_URL || "").replace(/\/$/, "");
  const ok =
    !origin ||
    (site && origin === site) ||
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
  }
}

async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const site = (env.SITE_URL || "").replace(/\/$/, "");
  if (!site || !env.STRIPE_SECRET_KEY) {
    return json({ error: "Server not configured" }, 503, cors);
  }

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
    console.error(e);
    return json({ error: "Stripe error" }, 502, cors);
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
      if (session.mode === "subscription" && session.subscription) {
        const userId =
          session.client_reference_id ||
          session.metadata?.supabase_user_id ||
          undefined;
        const custId = stripeCustomerId(session.customer);
        if (userId && custId) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await upsertSubscription(env, {
            user_id: userId,
            stripe_customer_id: custId,
            stripe_subscription_id: subId,
            status: "active",
          });
        }
      }
    }
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        const active = sub.status === "active" || sub.status === "trialing";
        await upsertSubscription(env, {
          user_id: userId,
          stripe_customer_id: stripeCustomerId(sub.customer),
          stripe_subscription_id: sub.id,
          status: active ? sub.status : "canceled",
        });
      }
    }
  } catch (e) {
    console.error("Webhook handler", e);
    return json({ error: "Handler error" }, 500);
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
  const site = (env.SITE_URL || "").trim().replace(/\/+$/, "");
  const payload: { url: string; anonKey: string; siteUrl?: string } = {
    url: urlStr,
    anonKey,
  };
  if (site) payload.siteUrl = `${site}/`;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
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

    return env.ASSETS.fetch(request);
  },
};
