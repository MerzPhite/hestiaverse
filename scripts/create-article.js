#!/usr/bin/env node
/**
 * Create one new article and append to src/_data/articles.js.
 * Uses OPENAI_API_KEY to generate content that follows PROMPT-RESEARCH-NEW-RISKS.md.
 *
 * Run every hour via cron or GitHub Actions:
 *   0 * * * * cd /path/to/Hestiaverse && node scripts/create-article.js
 *
 * Requires: OPENAI_API_KEY in environment.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTICLES_PATH = path.join(ROOT, "src", "_data", "articles.js");
const QUEUE_DIR = path.join(ROOT, "queue", "pending");

const {
  slugify: slugifyLib,
  appendToArticlesJs,
  appendToResearchOutputs,
  maybeAppendToAppsReferenced,
} = require("./lib/article-io");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  });
}
loadEnv();

const PROMPT_PATH = path.join(ROOT, "src", "PROMPT-RESEARCH-NEW-RISKS.md");
const APPS_PATH = path.join(ROOT, "src", "APPS-REFERENCED.md");
const RESEARCH_PATH = path.join(ROOT, "src", "RESEARCH-OUTPUTS.md");

function getExistingSlugs() {
  const content = fs.readFileSync(ARTICLES_PATH, "utf8");
  const slugs = [];
  const slugRe = /slug:\s*["']([^"']+)["']/g;
  let m;
  while ((m = slugRe.exec(content)) !== null) slugs.push(m[1]);
  return slugs;
}

function getExistingApps() {
  if (!fs.existsSync(APPS_PATH)) return [];
  const content = fs.readFileSync(APPS_PATH, "utf8");
  const apps = [];
  const tableRe = /\|\s*([^|]+)\s*\|\s*Home/g;
  let m;
  while ((m = tableRe.exec(content)) !== null) {
    const name = m[1].trim();
    if (name && !name.startsWith("App") && name !== "---") apps.push(name);
  }
  return apps;
}

function getPromptRules() {
  if (!fs.existsSync(PROMPT_PATH)) return "Suggest one new online danger to children (app, platform, or trend) from the last 12 months. Output JSON only.";
  return fs.readFileSync(PROMPT_PATH, "utf8");
}

function buildSystemPrompt(existingSlugs, existingApps, rules) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are writing exactly ONE new article for HESTIA VERSE, a site that helps parents understand online risks to children.

${rules}

CRITICAL RULES:
- Do NOT suggest any app or topic already in this list of existing article slugs: ${existingSlugs.join(", ")}
- Do NOT suggest any app already in this list: ${existingApps.join(", ")}
- Today's date is ${today}. The finding must have reports or mentions in the last 12 months.
- Output ONLY valid JSON. No markdown, no code fence, no explanation. The JSON must have exactly these keys (all strings except arrays): slug, title, labels (array of lowercase hyphenated strings), section (one of: platforms, emerging, ongoing, advice), excerpt, whatItIs, whyDangerous, whoAffected, parentActions (array of strings), severity (Low or Medium or High), platformTags (array of strings, e.g. TikTok, Discord), content (string; can be empty ""), sourceTitle (string; title of the article or report you used, e.g. "BBC News - App safety warning"), sourceUrl (string; full URL so readers can verify, e.g. "https://..."). You MUST provide a real, working URL from the last 12 months that supports your finding.
- No em dashes in any text. Do not include "(30 seconds)" in any field.
- slug must be unique and lowercase-hyphenated (e.g. "new-app-name").

SPECIFICITY (do not be vague):
- You MUST name a specific app, specific trend, or specific challenge. Examples: "the Blackout Challenge", "the Nyquil chicken trend", "BeReal", "Gas app", "the [Name] challenge". Do NOT write generic articles like "a wave of TikTok dance challenges" or "increasingly dangerous stunts" without naming the exact trend, app, or challenge.
- In "What it is" and "Why it's dangerous", include at least one concrete detail: the exact name of the challenge or app, a specific incident (e.g. "reported by the CDC in 2022"), or a specific harm (e.g. "has been linked to at least X hospitalisations").
- "What parents should do today" must be 2–4 CONCRETE, doable steps. Good: "Search your child's TikTok for [specific challenge name] and discuss what you find"; "Turn off DMs from non-friends in Instagram settings"; "Bookmark the NCMEC CyberTipline." Bad: "Monitor your child's activity"; "Talk about risks"; "Encourage them to think critically." Every step should be something a parent can do in a few minutes or one conversation.
- "Which kids are affected" must be specific: age range and where (e.g. "Ages 10–14, mainly on TikTok and Instagram", not just "teens").

SEVERITY (be conservative; do not over-use High):
- Use High ONLY when there is documented serious harm or major enforcement: FTC/regulatory ban, app removed from stores, law enforcement warnings, widespread sextortion/grooming with recent enforcement, or clear link to deaths/serious injury. Do not use High just because a platform is big or "risky in general."
- For major established platforms (Meta/Threads, Instagram, Facebook, YouTube, etc.), default to MEDIUM unless there is specific recent enforcement, lawsuit, or documented serious harm that clearly justifies High.
- Use Medium for significant risk with recent reports; scams or harm with good evidence but no ban; or any large platform where risk is real but not in the High category above.
- Use Low for emerging or lower-impact issues.

REAL TRENDS ONLY (do not invent):
- Do not make up or assume a challenge or trend exists. Only suggest something that has clear recent coverage (news, safety organisations, law enforcement). If you are not sure a specific named challenge is real and reported, choose a different topic (e.g. a different app or a well-documented trend).`;
}

async function generateArticle(apiKey) {
  const existingSlugs = getExistingSlugs();
  const existingApps = getExistingApps();
  const rules = getPromptRules();

  const systemPrompt = buildSystemPrompt(existingSlugs, existingApps, rules);
  const userPrompt = `Generate one new article that we do not already cover. It must be about a NAMED app, NAMED trend, or NAMED challenge with clear recent coverage. Include concrete details and specific parent actions. You MUST include sourceTitle and sourceUrl: a real article or report from the last 12 months (full URL) so the editor can verify the finding. Output only the JSON object.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  return JSON.parse(jsonStr);
}

function slugify(s) {
  return slugifyLib(s);
}

function writeToQueue(article) {
  if (!fs.existsSync(path.dirname(QUEUE_DIR))) {
    fs.mkdirSync(path.dirname(QUEUE_DIR), { recursive: true });
  }
  if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
  }
  const slug = article.slug || slugify(article.title || "new-article");
  const filename = `${slug}.json`;
  const filepath = path.join(QUEUE_DIR, filename);
  const payload = { ...article, slug, queuedAt: new Date().toISOString() };
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf8");
  return filepath;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set OPENAI_API_KEY to generate articles.");
    console.error("  Option 1: Create a .env file in the project root with:");
    console.error("    OPENAI_API_KEY=sk-...");
    console.error("  Option 2: Export it in the environment (avoid pasting the key in the terminal).");
    console.error("To run every hour via cron, use .env so the key is never on the command line.");
    process.exit(1);
  }

  const existingSlugs = getExistingSlugs();
  let article;
  try {
    article = await generateArticle(apiKey);
  } catch (e) {
    console.error("Generation failed:", e.message);
    process.exit(1);
  }

  const slug = article.slug || slugify(article.title || "new-article");
  if (existingSlugs.includes(slug)) {
    console.error("Generated article slug already exists:", slug);
    process.exit(1);
  }

  article.slug = slug;

  const publishDirect = process.argv.includes("--publish");
  if (publishDirect) {
    appendToArticlesJs(article);
    appendToResearchOutputs(article);
    maybeAppendToAppsReferenced(article);
    console.log("Published article:", slug, "-", article.title);
  } else {
    writeToQueue(article);
    console.log("Queued article:", slug, "-", article.title);
    console.log("  Review and accept with: npm run accept-article", slug);
  }
}

main();
