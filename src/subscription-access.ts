/**
 * Client-side subscription check via Supabase `subscriptions` (RLS: read own row).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function userHasActiveSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const s = String((data as { status?: string }).status || "").toLowerCase();
  return s === "active" || s === "trialing";
}
