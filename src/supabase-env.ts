/**
 * Read Supabase URL + anon key from #supabase-config (build-time JSON in layout).
 */

export type ResolvedSupabaseConfig = {
  url: string;
  anonKey: string;
  /** Canonical origin for Supabase emailRedirectTo (trailing slash). From SITE_URL in build or Worker. */
  siteUrl?: string;
};

/** Older builds escaped JSON as &quot; inside the script tag; decode so parse still works. */
export function decodeHtmlEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  const ta = document.createElement("textarea");
  ta.innerHTML = raw;
  return ta.value;
}

function normalizeRedirectBase(s: string): string {
  const t = s.trim().replace(/\/+$/, "");
  return t ? `${t}/` : "";
}

export function readSupabaseConfigFromDom(): ResolvedSupabaseConfig | null {
  const el = document.getElementById("supabase-config");
  const raw = el?.textContent?.trim();
  if (!raw) return null;
  const tryParse = (s: string): Partial<ResolvedSupabaseConfig> | null => {
    try {
      return JSON.parse(s) as Partial<ResolvedSupabaseConfig>;
    } catch {
      return null;
    }
  };
  const j = tryParse(raw) ?? tryParse(decodeHtmlEntities(raw));
  if (!j?.url || !j?.anonKey) return null;
  const out: ResolvedSupabaseConfig = { url: j.url, anonKey: j.anonKey };
  if (typeof j.siteUrl === "string" && j.siteUrl.trim()) {
    out.siteUrl = normalizeRedirectBase(j.siteUrl);
  }
  return out;
}

/**
 * Prefer HTML from build (Eleventy + .env). If empty (e.g. CI built without env), ask the Worker
 * for the same public values (SUPABASE_URL + SUPABASE_ANON_KEY in Worker secrets).
 * When HTML has keys but no siteUrl, merges siteUrl from GET /api/public-config (Worker SITE_URL).
 */
export async function resolveSupabaseConfig(): Promise<ResolvedSupabaseConfig | null> {
  let cfg = readSupabaseConfigFromDom();
  if (!cfg) {
    try {
      const res = await fetch("/api/public-config", { credentials: "same-origin" });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        url?: string;
        anonKey?: string;
        siteUrl?: string;
      };
      if (!j?.url || !j?.anonKey) return null;
      cfg = { url: j.url, anonKey: j.anonKey };
      if (typeof j.siteUrl === "string" && j.siteUrl.trim()) {
        cfg.siteUrl = normalizeRedirectBase(j.siteUrl);
      }
      return cfg;
    } catch {
      return null;
    }
  }

  if (!cfg.siteUrl) {
    try {
      const res = await fetch("/api/public-config", { credentials: "same-origin" });
      if (res.ok) {
        const j = (await res.json()) as { siteUrl?: string };
        if (typeof j.siteUrl === "string" && j.siteUrl.trim()) {
          cfg = { ...cfg, siteUrl: normalizeRedirectBase(j.siteUrl) };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return cfg;
}
