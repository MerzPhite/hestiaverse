/**
 * Read Supabase URL + anon key from #supabase-config (build-time JSON in layout).
 */

/** Older builds escaped JSON as &quot; inside the script tag; decode so parse still works. */
export function decodeHtmlEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  const ta = document.createElement("textarea");
  ta.innerHTML = raw;
  return ta.value;
}

export function readSupabaseConfigFromDom(): { url: string; anonKey: string } | null {
  const el = document.getElementById("supabase-config");
  const raw = el?.textContent?.trim();
  if (!raw) return null;
  const tryParse = (s: string): { url?: string; anonKey?: string } | null => {
    try {
      return JSON.parse(s) as { url?: string; anonKey?: string };
    } catch {
      return null;
    }
  };
  const j = tryParse(raw) ?? tryParse(decodeHtmlEntities(raw));
  if (j?.url && j?.anonKey) return { url: j.url, anonKey: j.anonKey };
  return null;
}

/**
 * Prefer HTML from build (Eleventy + .env). If empty (e.g. CI built without env), ask the Worker
 * for the same public values (SUPABASE_URL + SUPABASE_ANON_KEY in Worker secrets).
 */
export async function resolveSupabaseConfig(): Promise<{ url: string; anonKey: string } | null> {
  const fromDom = readSupabaseConfigFromDom();
  if (fromDom) return fromDom;
  try {
    const res = await fetch("/api/public-config", { credentials: "same-origin" });
    if (!res.ok) return null;
    const j = (await res.json()) as { url?: string; anonKey?: string };
    if (j?.url && j?.anonKey) return { url: j.url, anonKey: j.anonKey };
  } catch {
    /* offline or static preview without Worker */
  }
  return null;
}
