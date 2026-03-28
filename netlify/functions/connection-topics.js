/**
 * Netlify function: GET /.netlify/functions/connection-topics?topic=...
 * Step 1: Perplexity fetches latest info. Step 2: OpenAI breaks it into
 * whatHappened, whyKidsCare, thingsTheyMightBeTalkingAbout (3), easyConvoStarters.
 * For topic=pop-girl-music: also returns nodes + edges for graph visualization.
 * Set PERPLEXITY_API_KEY and OPENAI_API_KEY in Netlify.
 */

const TOPIC_CONFIG = {
  "pop-girl-music": {
    perplexityQuery: "Pop girl music: Sabrina Carpenter, Chappell Roan, Dua Lipa, Olivia Rodrigo, Billie Eilish - latest news, albums, tours, Grammy appearances, TikTok trends March 2026",
    graphMode: true,
  },
};

function perplexityPrompt(topic) {
  const config = TOPIC_CONFIG[topic];
  if (config) {
    return `Search for the LATEST news, releases, and events about: ${config.perplexityQuery}. Summarize in one message: what has happened recently or is happening now, with concrete names and dates. Be specific and current. No generic fluff.`;
  }
  return `Search for the LATEST news, releases, and events about "${topic}" (e.g. new albums, singles, tours, member news, dates). Summarize in one message: what has happened recently or is happening now, with concrete names and dates (album names, release dates, tour info). Be specific and current. No generic fluff.`;
}

function openAIBreakdownPrompt(topic, rawInfo) {
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
{"topics":[{"title":"...","whatHappened":"...","whyKidsCare":"...","thingsTheyMightBeTalkingAbout":["...","...","..."],"easyConvoStarters":["...","..."]}]}`;
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
3. **topics**: 3 topics in the same format as before (title, whatHappened, whyKidsCare, thingsTheyMightBeTalkingAbout, easyConvoStarters).

Output ONLY valid JSON with no markdown or code fence:
{"nodes":[{"id":"...","label":"...","type":"..."}],"edges":[{"source":"...","target":"...","label":"..."}],"topics":[{"title":"...","whatHappened":"...","whyKidsCare":"...","thingsTheyMightBeTalkingAbout":["...","...","..."],"easyConvoStarters":["...","..."]}]}`;
}

function parseBreakdown(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { topics: [] };
  return Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [];
}

function parseGraph(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { nodes: [], edges: [], topics: [] };
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes.slice(0, 10) : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges.slice(0, 15) : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 4) : [],
  };
}

async function fetchRawWithPerplexity(topic, apiKey) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: perplexityPrompt(topic) }],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Perplexity failed");
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function breakDownWithOpenAI(topic, rawInfo, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You output only valid JSON. No markdown, no code blocks, no extra text." },
        { role: "user", content: openAIBreakdownPrompt(topic, rawInfo) },
      ],
      temperature: 0.4,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI failed");
  return parseBreakdown(data?.choices?.[0]?.message?.content?.trim() || "");
}

async function breakDownWithGraph(rawInfo, apiKey) {
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

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const topic = event.queryStringParameters?.topic?.trim() || "Chappell Roan";
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!perplexityKey || !openaiKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ topics: [], error: "Set both PERPLEXITY_API_KEY and OPENAI_API_KEY in Netlify." }) };
  }

  const config = TOPIC_CONFIG[topic];
  const useGraph = config?.graphMode === true;

  try {
    const rawInfo = await fetchRawWithPerplexity(topic, perplexityKey);
    if (!rawInfo) return { statusCode: 200, headers, body: JSON.stringify({ topics: [], error: "No latest info returned." }) };

    if (useGraph) {
      const graph = await breakDownWithGraph(rawInfo, openaiKey);
      return { statusCode: 200, headers, body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges, topics: graph.topics }) };
    }

    const topics = await breakDownWithOpenAI(topic, rawInfo, openaiKey);
    return { statusCode: 200, headers, body: JSON.stringify({ topics }) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ topics: [], error: "Could not load topics. Try again later." }) };
  }
};
