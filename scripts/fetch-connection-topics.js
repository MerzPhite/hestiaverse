#!/usr/bin/env node
/**
 * Fetches Connection page topics for the hardcoded interest (e.g. Blackpink).
 * Step 1: Perplexity gets latest news (web search). Step 2: OpenAI breaks it into:
 *   whatHappened, whyKidsCare, thingsTheyMightBeTalkingAbout (3), easyConvoStarters.
 * Needs PERPLEXITY_API_KEY and OPENAI_API_KEY in .env for the full flow.
 *
 * Run: npm run fetch-connection-topics
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "_data", "connectionTopics.json");

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

const TOPIC = "Chappell Roan";

const BREAKDOWN_JSON_SCHEMA = `{"topics":[{"title":"...","whatHappened":"...","whyKidsCare":"...","thingsTheyMightBeTalkingAbout":["...","...","..."],"easyConvoStarters":["...","..."]}]}`;

function buildPerplexityPrompt(topic) {
  return `Search for the LATEST news, releases, and events about "${topic}" (e.g. new albums, singles, tours, member news, dates). Summarize in one message: what has happened recently or is happening now, with concrete names and dates (album names, release dates, tour info). Be specific and current. No generic fluff.`;
}

function buildOpenAIBreakdownPrompt(topic, rawInfo) {
  return `You are helping parents connect with their kids. The child is into: "${topic}".

Here is the latest information we have (use this as the source of facts):

---
${rawInfo}
---

Using ONLY the information above, create 3 topics. For EACH topic output:

1. **title**: Short, specific title with names/dates (e.g. "DEADLINE album (February 2026)").
2. **whatHappened**: 2–4 sentences describing what actually happened or is happening. Be concrete (names, dates).
3. **whyKidsCare**: 1–2 sentences on why fans/kids care about this (e.g. first release in years, viral moment, tour dates).
4. **thingsTheyMightBeTalkingAbout**: Exactly 3 short bullets: specific things kids might be discussing (song names, moments, rumours, merch, etc.).
5. **easyConvoStarters**: An array of 2–4 short, natural phrases a parent could say to start a conversation (e.g. "I saw they dropped a new single — have you listened?", "Are you going to try to get tour tickets?"). Keep them casual and easy to say.

Output ONLY valid JSON with no markdown or code fence. Use this exact structure:
${BREAKDOWN_JSON_SCHEMA}`;
}

function parseBreakdownResponse(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { topics: [] };
  return Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [];
}

async function fetchRawInfoWithPerplexity(topic) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "user", content: buildPerplexityPrompt(topic) },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Perplexity request failed");
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function breakDownWithOpenAI(topic, rawInfo) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required to break down into parent format.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output only valid JSON. No markdown, no code blocks, no extra text." },
        { role: "user", content: buildOpenAIBreakdownPrompt(topic, rawInfo) },
      ],
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  const raw = data?.choices?.[0]?.message?.content?.trim() || "";
  return parseBreakdownResponse(raw);
}

async function main() {
  const hasPerplexity = !!process.env.PERPLEXITY_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (!hasPerplexity && !hasOpenAI) {
    console.error("Add PERPLEXITY_API_KEY and OPENAI_API_KEY to .env (both needed: Perplexity for latest info, OpenAI to break it down).");
    process.exit(1);
  }

  let rawInfo = "";
  if (hasPerplexity) {
    console.log("Step 1: Fetching latest info with Perplexity...");
    rawInfo = await fetchRawInfoWithPerplexity(TOPIC);
    if (!rawInfo) throw new Error("Perplexity returned no content.");
  }

  let topics = [];
  if (hasOpenAI) {
    console.log("Step 2: Breaking down with OpenAI (what happened, why kids care, 3 things they might be talking about, easy convo starters)...");
    if (rawInfo) {
      topics = await breakDownWithOpenAI(TOPIC, rawInfo);
    } else {
      console.error("No raw info from Perplexity; add PERPLEXITY_API_KEY for latest news.");
      process.exit(1);
    }
  } else {
    console.error("OPENAI_API_KEY is required to break down into the parent format.");
    process.exit(1);
  }

  const out = { topics, updatedAt: new Date().toISOString() };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", OUT_PATH, "with", topics.length, "topics for", TOPIC);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
