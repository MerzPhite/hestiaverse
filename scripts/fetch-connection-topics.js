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
  return `Search for the LATEST developments about "${topic}". Include ALL of the following that have real coverage in the last few months (do not skip controversies):

- New music, tours, festivals, brand deals, awards
- Viral moments, social media storms, fan arguments online
- Any reported incidents at shows, hotels, or airports (security, fan encounters, cancellations, political or mayor responses)
- Statements or apologies from the artist or their team

Summarize in one message with concrete names, places, and dates. If something blew up on TikTok or in the press (even if uncomfortable), mention it.

Do a second pass in your search mentally: look for festival or tour cities (e.g. Brazil, São Paulo, Rio), hotel or restaurant encounters, security or bodyguards and young fans, tears or distress, a mayor or city banning a show, or player/celebrity family names in headlines. If you find any of that, add a clear paragraph with who, where, and approximate date.

No generic fluff. Do not omit a major viral story because it is negative.`;
}

function buildPerplexityIncidentPrompt(topic) {
  return `Focused search only: "${topic}" plus any of: security guard, bodyguard, hotel, child fan, 11-year-old, teen fan, tears, Brazil, São Paulo, Rio, Lollapalooza, mayor, banned from performing, festival disinvited.

Report only what reputable outlets describe: who was involved, where, when (month/year), and what was said publicly (apologies, denials). If you find nothing specific, reply exactly: No major incident found in search.`;
}

async function perplexityComplete(apiKey, userContent) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: userContent }],
      max_tokens: 2048,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Perplexity request failed");
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function buildOpenAIBreakdownPrompt(topic, rawInfo) {
  return `You are helping parents connect with their kids. The child is into: "${topic}".

Here is the latest information we have (use this as the source of facts):

---
${rawInfo}
---

Using ONLY the information above, create 3 topics. Never invent events, quotes, or controversies that are not clearly supported by the text above. If the source is silent on security or fan incidents, do not make up a bodyguard story.

If the source DOES mention security or bodyguards and a child or teen fan, a hotel or restaurant, a mayor or city response, or a fan left upset: you MUST dedicate one full topic to that (what happened, responses, why kids are debating it). Do not drop it for lighter promo news.

Otherwise diversify: do not make all three about happy promo; include controversy or viral moments from the source when present.

For EACH topic output:

1. **title**: Short, specific title with names/dates (e.g. "DEADLINE album (February 2026)" or "Brazil hotel incident with young fan (March 2026)").
2. **whatHappened**: 2–4 sentences describing what actually happened or is happening. Be concrete (names, dates).
3. **whyKidsCare**: 1–2 sentences on why fans/kids care about this (e.g. first release in years, viral moment, tour dates, fairness, loyalty to the artist).
4. **thingsTheyMightBeTalkingAbout**: Exactly 3 short bullets: specific things kids might be discussing (song names, moments, rumours, merch, sides in a drama, etc.).
5. **easyConvoStarters**: An array of 2–4 short, natural phrases a parent could say to start a conversation (e.g. "I saw they dropped a new single — have you listened?", "Are you going to try to get tour tickets?"). Keep them casual and easy to say. For sensitive topics, keep starters non-judgemental and curious.

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
  console.log("  (parallel: general news + incident/fan-safety dig)");
  const [general, incidentDig] = await Promise.all([
    perplexityComplete(apiKey, buildPerplexityPrompt(topic)),
    perplexityComplete(apiKey, buildPerplexityIncidentPrompt(topic)),
  ]);
  return `GENERAL NEWS:\n${general}\n\n---\nINCIDENT / FAN-SAFETY DIG:\n${incidentDig}`;
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
        {
          role: "system",
          content:
            "You output only valid JSON. No markdown, no code blocks, no extra text. Use only facts from the user message; if a topic is not in the source, omit it and choose another angle that is.",
        },
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
