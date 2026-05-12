const path = require("path");
// Resolve from repo root so Eleventy still finds .env if cwd is not the project folder.
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function boolFromEnv(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

const explicitShowConnectionNav = boolFromEnv(process.env.SHOW_CONNECTION_NAV);
const siteUrlRaw = (process.env.SITE_URL || "").trim();
// Keep connection pages hidden by default in all environments.
// To show them locally, set SHOW_CONNECTION_NAV=true in .env.
const showConnectionNav = explicitShowConnectionNav === true;

/** Injected at build time. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (local) or CI. */
module.exports = {
  supabaseUrl: (process.env.SUPABASE_URL || "").trim(),
  supabaseAnonKey: (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim(),
  /**
   * Canonical public origin (no trailing slash in env). Used for Supabase emailRedirectTo so
   * confirmation links match URL Configuration. Same value as Worker SITE_URL in production.
   */
  siteUrl: siteUrlRaw.replace(/\/+$/, ""),
  /** Stripe Price IDs (safe in HTML): subscription prices from Stripe Dashboard. */
  stripePriceMonthly: (process.env.STRIPE_PRICE_MONTHLY || "").trim(),
  stripePriceYearly: (process.env.STRIPE_PRICE_YEARLY || "").trim(),
  /** Header nav: hidden by default. Set SHOW_CONNECTION_NAV=true to show links. */
  showConnectionNav,
};
