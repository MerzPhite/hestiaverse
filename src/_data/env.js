const path = require("path");
// Resolve from repo root so Eleventy still finds .env if cwd is not the project folder.
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

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
  siteUrl: (process.env.SITE_URL || "").trim().replace(/\/+$/, ""),
  /** Stripe Price IDs (safe in HTML): subscription prices from Stripe Dashboard. */
  stripePriceMonthly: (process.env.STRIPE_PRICE_MONTHLY || "").trim(),
  stripePriceYearly: (process.env.STRIPE_PRICE_YEARLY || "").trim(),
};
