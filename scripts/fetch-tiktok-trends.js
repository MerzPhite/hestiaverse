#!/usr/bin/env node
/**
 * Fetches TikTok-related insight posts from New Engen's insights listing, scrapes each
 * article page (SSR HTML), and merges into src/_data/tiktokTrends.json.
 *
 * - Listing: https://newengen.com/insights/
 * - Picks hrefs whose slug contains "tiktok" (case-insensitive).
 * - Curated entries without a New Engen sourceUrl are preserved at the end of the list.
 *
 * Run: npm run fetch-tiktok-trends
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "_data", "tiktokTrends.json");
const LIST_URL = "https://newengen.com/insights/";
const BASE = "https://newengen.com";
const USER_AGENT = "HestiaverseTikTokTrendsBot/1.0 (+local dev; contact: site owner)";
const DELAY_MS = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

/** Slugs from listing page whose path is /insights/<slug>/ and slug mentions tiktok */
function extractTikTokSlugs(html) {
  const slugs = new Set();
  const re = /href="\/insights\/([a-z0-9-]+)\/?"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (slug === "insights") continue;
    if (slug.includes("tiktok")) slugs.add(m[1]);
  }
  return [...slugs];
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function metaContent(html, name) {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  if (m) return decodeHtmlEntities(m[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeHtmlEntities(m2[1].trim()) : "";
}

function ogProperty(html, prop) {
  const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  if (m) return decodeHtmlEntities(m[1].trim());
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeHtmlEntities(m2[1].trim()) : "";
}

function titleFromHtml(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m) return "";
  let t = decodeHtmlEntities(m[1].replace(/\s+/g, " ").trim());
  t = t.replace(/\s*\|\s*New Engen.*$/i, "").replace(/\s*–\s*New Engen.*$/i, "").trim();
  return t;
}

function stripTags(fragment) {
  return decodeHtmlEntities(
    fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
}

const NOISE_RE =
  /linkedin|share\s+linkedin|all articles|last updated:|marketing manager|^\s*trends\s+[\d.]+\s+/i;

/** Prefer main/article region so we skip header/nav paragraphs */
function mainHtmlRegion(html) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const art = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (art) return art[1];
  return html;
}

/** First few <p> bodies for fallback summary */
function paragraphSnippets(html, maxParas, maxLen) {
  const region = mainHtmlRegion(html);
  const parts = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(region)) !== null && parts.length < maxParas) {
    const text = stripTags(m[1]);
    if (text.length < 50) continue;
    if (NOISE_RE.test(text)) continue;
    parts.push(text);
  }
  const joined = parts.join(" ");
  if (joined.length <= maxLen) return joined;
  return joined.slice(0, maxLen - 1).trim() + "…";
}

function slugToLocalSlug(neSlug) {
  return `new-engen-${neSlug}`.replace(/[^a-z0-9-]/gi, "-");
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** e.g. march-2026-tiktok-trends → Date for sorting (newest first) */
function sortDateFromSlug(slug) {
  const m = slug.toLowerCase().match(/^([a-z]+)-(\d{4})-/);
  if (!m) return 0;
  const mo = MONTHS[m[1]];
  const y = Number(m[2], 10);
  if (!mo || !y) return 0;
  return y * 100 + mo;
}

async function scrapeArticle(slug) {
  const url = `${BASE}/insights/${slug}/`;
  const html = await fetchText(url);
  const title = titleFromHtml(html) || slug.replace(/-/g, " ");
  let summary = ogProperty(html, "og:description") || metaContent(html, "description");
  if (NOISE_RE.test(summary) || summary.length < 60) {
    const fromP = paragraphSnippets(html, 4, 520);
    if (fromP && fromP.length > 40) summary = fromP;
  }
  if (!summary || summary.length < 40) {
    const fromP = paragraphSnippets(html, 4, 520);
    if (fromP) summary = fromP;
  }
  if (!summary) summary = title;
  summary = summary.replace(/\s+/g, " ").trim();
  const published =
    ogProperty(html, "article:published_time") ||
    metaContent(html, "article:published_time") ||
    "";

  return {
    slug: slugToLocalSlug(slug),
    title,
    summary,
    sourceUrl: url,
    published: published ? published.slice(0, 10) : "",
    scrapedAt: new Date().toISOString(),
    source: "new-engen-insights",
  };
}

function isNewEngenInsightUrl(t) {
  return typeof t.sourceUrl === "string" && t.sourceUrl.includes("newengen.com/insights/");
}

function mainData() {
  return {
    source: {
      name: "New Engen Insights",
      url: LIST_URL,
    },
    updatedAt: new Date().toISOString(),
    trends: [],
  };
}

async function main() {
  console.log("Fetching insights listing…");
  const listHtml = await fetchText(LIST_URL);
  const slugs = extractTikTokSlugs(listHtml);
  if (!slugs.length) {
    console.error("No TikTok slugs found in listing HTML (layout may have changed).");
    process.exit(1);
  }
  console.log("Found slugs:", slugs.join(", "));

  const scraped = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    process.stdout.write(`  [${i + 1}/${slugs.length}] ${slug}… `);
    try {
      const row = await scrapeArticle(slug);
      scraped.push(row);
      console.log("ok");
    } catch (e) {
      console.log("fail:", e.message);
    }
    if (i < slugs.length - 1) await sleep(DELAY_MS);
  }

  scraped.sort((a, b) => {
    const neA = a.sourceUrl?.match(/\/insights\/([a-z0-9-]+)\/?$/i);
    const neB = b.sourceUrl?.match(/\/insights\/([a-z0-9-]+)\/?$/i);
    const sa = neA ? sortDateFromSlug(neA[1]) : 0;
    const sb = neB ? sortDateFromSlug(neB[1]) : 0;
    if (sb !== sa) return sb - sa;
    return (b.scrapedAt || "").localeCompare(a.scrapedAt || "");
  });

  let existing = mainData();
  if (fs.existsSync(OUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    } catch {
      /* use default */
    }
  }

  const curated = (existing.trends || []).filter((t) => !isNewEngenInsightUrl(t));
  const out = {
    source: existing.source || mainData().source,
    updatedAt: new Date().toISOString(),
    trends: [...scraped, ...curated],
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", OUT_PATH, "—", scraped.length, "scraped +", curated.length, "curated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
