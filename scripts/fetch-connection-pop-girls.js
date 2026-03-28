#!/usr/bin/env node
/**
 * Fetches Connection 2 (Pop girl music) data: nodes, edges, topics.
 * Uses Perplexity + OpenAI. Needs both API keys in .env.
 * Run: npm run fetch-connection-pop-girls
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/** Written to assets so Eleventy copies it to /assets/… — no template rebuild needed after fetch. */
const OUT_PATH = path.join(ROOT, "src", "assets", "connectionTopicsPopGirls.json");

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

const PERPLEXITY_QUERY =
  "Pop girl music: Sabrina Carpenter, Chappell Roan, Dua Lipa, Olivia Rodrigo, Billie Eilish - latest news, albums, tours, Grammy appearances, TikTok trends March 2026";

function perplexityPrompt() {
  return `Search for the LATEST news, releases, and events about: ${PERPLEXITY_QUERY}. Summarize in one message: what has happened recently or is happening now, with concrete names and dates. Be specific and current. No generic fluff.`;
}

function openAIGraphPrompt(rawInfo) {
  return `You are helping parents connect with their kids. The child is into Pop girl music (Sabrina Carpenter, Chappell Roan, Dua Lipa, Olivia Rodrigo, etc.).

Here is the latest information we have:

---
${rawInfo}
---

From this info, create a knowledge graph with:
1. **nodes**: 4–8 nodes. Each has: id (short slug, e.g. "sabrina"), label (display name), type (one of: "artist", "event", "trend", "release").
2. **edges**: 4–12 connections. Each has: source (node id), target (node id), label (short phrase like "performed at", "collaborated with", "trending with").
3. **topics**: 3 topics. Each has: title, whatHappened, whyKidsCare, thingsTheyMightBeTalkingAbout (array of 3), easyConvoStarters (array of 2–4).

Output ONLY valid JSON with no markdown or code fence:
{"nodes":[{"id":"...","label":"...","type":"..."}],"edges":[{"source":"...","target":"...","label":"..."}],"topics":[{"title":"...","whatHappened":"...","whyKidsCare":"...","thingsTheyMightBeTalkingAbout":["...","...","..."],"easyConvoStarters":["...","..."]}]}`;
}

function parseGraph(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { nodes: [], edges: [], topics: [] };
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
  };
}

async function fetchRawWithPerplexity(apiKey) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: perplexityPrompt() }],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Perplexity failed");
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function breakDownWithOpenAI(rawInfo, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output only valid JSON. No markdown, no code blocks, no extra text." },
        { role: "user", content: openAIGraphPrompt(rawInfo) },
      ],
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI failed");
  return parseGraph(data?.choices?.[0]?.message?.content?.trim() || "");
}

async function main() {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!perplexityKey || !openaiKey) {
    console.error("Add PERPLEXITY_API_KEY and OPENAI_API_KEY to .env");
    process.exit(1);
  }

  console.log("Step 1: Fetching latest Pop girl music info with Perplexity...");
  const rawInfo = await fetchRawWithPerplexity(perplexityKey);
  if (!rawInfo) throw new Error("Perplexity returned no content.");

  console.log("Step 2: Building graph (nodes, edges, topics) with OpenAI...");
  const graph = await breakDownWithOpenAI(rawInfo, openaiKey);

  const out = {
    nodes: graph.nodes,
    edges: graph.edges,
    topics: graph.topics,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", OUT_PATH, "with", graph.nodes.length, "nodes,", graph.edges.length, "edges,", graph.topics.length, "topics");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
