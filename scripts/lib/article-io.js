const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ARTICLES_PATH = path.join(ROOT, "src", "_data", "articles.js");
const APPS_PATH = path.join(ROOT, "src", "APPS-REFERENCED.md");
const RESEARCH_PATH = path.join(ROOT, "src", "RESEARCH-OUTPUTS.md");

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeJsString(s) {
  if (typeof s !== "string") return '""';
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function formatArticleEntry(a) {
  const slug = a.slug || slugify(a.title || "new-article");
  const title = escapeJsString(a.title || "Untitled");
  const labels = Array.isArray(a.labels) ? a.labels : ["emerging"];
  const section = ["platforms", "emerging", "ongoing", "advice"].includes(a.section) ? a.section : "emerging";
  const excerpt = escapeJsString(a.excerpt || "");
  const lines = [
    "  {",
    `    slug: "${slug}",`,
    `    title: ${title},`,
    `    labels: [${labels.map((l) => `"${l}"`).join(", ")}],`,
    `    section: "${section}",`,
    `    excerpt: ${excerpt},`,
  ];

  if (a.whatItIs) {
    lines.push(`    whatItIs: ${escapeJsString(a.whatItIs)},`);
    lines.push(`    whyDangerous: ${escapeJsString(a.whyDangerous || "")},`);
    lines.push(`    whoAffected: ${escapeJsString(a.whoAffected || "")},`);
    if (Array.isArray(a.parentActions) && a.parentActions.length) {
      lines.push("    parentActions: [");
      a.parentActions.forEach((p) => lines.push(`      ${escapeJsString(p)},`));
      lines.push("    ],");
    }
    lines.push(`    severity: "${(a.severity || "Medium").replace(/"/g, '\\"')}",`);
    if (Array.isArray(a.platformTags) && a.platformTags.length) {
      lines.push(`    platformTags: [${a.platformTags.map((t) => `"${t}"`).join(", ")}],`);
    }
    if (a.sourceUrl || a.sourceTitle) {
      if (a.sourceTitle) lines.push(`    sourceTitle: ${escapeJsString(a.sourceTitle)},`);
      if (a.sourceUrl) lines.push(`    sourceUrl: ${escapeJsString(a.sourceUrl)},`);
    }
    lines.push("    content: ``,");
  } else if (a.content) {
    lines.push(`    content: \`${(a.content || "").replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`,`);
  } else {
    lines.push("    content: ``,");
  }

  lines.push("  },");
  return lines.join("\n");
}

function appendToArticlesJs(newEntry) {
  let content = fs.readFileSync(ARTICLES_PATH, "utf8");
  const entry = formatArticleEntry(newEntry);
  content = content.replace(/\n\];\s*$/, "\n" + entry + "\n];");
  fs.writeFileSync(ARTICLES_PATH, content, "utf8");
}

function appendToResearchOutputs(article) {
  if (!fs.existsSync(RESEARCH_PATH)) return;
  const block = `
---

## ${new Date().toISOString().slice(0, 7)} — ${article.title}

**Title:** ${article.title}

**Summary:** ${article.excerpt}

**Section:** ${article.section}

**Labels:** ${(article.labels || []).join(" ")}

**Severity:** ${article.severity || "—"}. **Platform tags:** ${(article.platformTags || []).join(", ") || "—"}.

**Added to site:** Accepted from queue.
`;
  fs.appendFileSync(RESEARCH_PATH, block, "utf8");
}

function maybeAppendToAppsReferenced(article) {
  if (!fs.existsSync(APPS_PATH) || !article.platformTags?.length) return;
  const name = article.platformTags[0] || article.title?.split("—")[0]?.trim();
  if (!name) return;
  const row = `| ${name} | Home | In focus: specific platforms | ${new Date().toISOString().slice(0, 7)} |\n`;
  const content = fs.readFileSync(APPS_PATH, "utf8");
  const insertBefore = "---\n\n## How to use";
  if (content.includes(insertBefore)) {
    const newContent = content.replace(insertBefore, row + insertBefore);
    fs.writeFileSync(APPS_PATH, newContent, "utf8");
  }
}

module.exports = {
  ROOT,
  ARTICLES_PATH,
  slugify,
  formatArticleEntry,
  appendToArticlesJs,
  appendToResearchOutputs,
  maybeAppendToAppsReferenced,
};
