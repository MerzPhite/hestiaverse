/**
 * Shared Supabase auth helpers for browser bundles.
 */

/**
 * Use for signUp `emailRedirectTo`. Must appear under Supabase → Authentication → URL Configuration
 * (Redirect URLs). Prefer `canonicalSiteUrl` from SITE_URL so it matches production even in dev.
 */
export function supabaseEmailRedirectUrl(canonicalSiteUrl?: string | null): string {
  const c = canonicalSiteUrl?.trim();
  if (c) {
    const base = c.replace(/\/+$/, "");
    return `${base}/`;
  }
  return `${window.location.origin}/`;
}

/** Append dashboard hints when the API message points to common misconfiguration. */
export function augmentAuthErrorMessage(message: string, redirectUsed?: string): string {
  const m = message.trim();
  if (!m) return m;
  const tipUrl = redirectUsed ?? supabaseEmailRedirectUrl();
  if (/captcha/i.test(m)) {
    return `${m} Tip: If Bot Protection (CAPTCHA) is on in Supabase, either disable it for testing or wire Turnstile or hCaptcha and pass options.captchaToken in signUp and signIn.`;
  }
  if (/redirect|not allowed|invalid.*url|url.*invalid|email link/i.test(m)) {
    return `${m} Tip: In Supabase → Authentication → URL Configuration, set Site URL to your live origin and add this Redirect URL: ${tipUrl}`;
  }
  return m;
}
