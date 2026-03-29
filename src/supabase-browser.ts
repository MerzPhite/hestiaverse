/**
 * Browser Supabase client: persists session in cookies so the Cloudflare Worker can read it for edge paywall.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient(url: string, anonKey: string): SupabaseClient {
  return createBrowserClient(url, anonKey, {
    isSingleton: true,
  });
}
