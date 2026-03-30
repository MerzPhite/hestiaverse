const fs = require("fs");
const path = require("path");

function parseDate(input) {
  if (!input || typeof input !== "string") return null;
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/**
 * Count article entries from src/_data/articles.js that are from the last 30 days.
 * Primary signal: article.createdAt (new pipeline) or article.published (if present).
 * Fallback for legacy entries with no date:
 * - if articles.js itself was created in the last 30 days, treat undated entries as recent.
 */
function countRecentArticleEntries() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const articlesPath = path.join(__dirname, "articles.js");
  let articles = [];
  try {
    const resolved = require.resolve(articlesPath);
    delete require.cache[resolved];
    articles = require(articlesPath);
  } catch {
    return 0;
  }
  if (!Array.isArray(articles) || articles.length === 0) return 0;

  let datedRecent = 0;
  let undated = 0;
  for (const a of articles) {
    const d = parseDate(a?.createdAt) || parseDate(a?.published);
    if (!d) {
      undated += 1;
      continue;
    }
    if (d >= cutoff) datedRecent += 1;
  }

  if (undated > 0) {
    try {
      const stat = fs.statSync(articlesPath);
      const fileCreated = stat.birthtime instanceof Date ? stat.birthtime : new Date(stat.birthtimeMs);
      if (fileCreated >= cutoff) {
        return datedRecent + undated;
      }
    } catch {
      // Ignore stat failures; fall back to dated count.
    }
  }
  return datedRecent;
}

module.exports = {
  newInfoLast30Days: countRecentArticleEntries(),
};

