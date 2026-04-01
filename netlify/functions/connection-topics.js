/**
 * Netlify function: GET /.netlify/functions/connection-topics?topic=...
 * pop-girl-music: mind map JSON (hub + clouds + expandable points).
 * Other topics: 3 talking-point topics only.
 * Set PERPLEXITY_API_KEY and OPENAI_API_KEY in Netlify.
 */

const TOPIC_CONFIG = {
  "pop-girl-music": {
    perplexityQuery:
      "Rihanna: latest music, performances, tours or one-off shows, awards and chart moments; Fenty Beauty, Savage X Fenty, and other business or brand moves; film, TV, or soundtrack work; philanthropy and causes; fashion and cultural influence; viral social moments or notable fan press coverage. Be concrete with names, titles, and dates.",
    mindMapMode: true,
  },
};

function perplexityPrompt(topic) {
  const config = TOPIC_CONFIG[topic];
  if (config?.mindMapMode) {
    return `Search for the LATEST developments about: ${config.perplexityQuery}

Cover multiple lanes: music releases and shows, film/TV/streaming tie-ins, personal passions (sports, art, activism), style and brands, and what fans argue about online. Include controversies or viral incidents if reported. Concrete names, titles, and dates. One thorough summary. No generic fluff.`;
  }
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

const MIND_MAP_SCHEMA = `{"hubTitle":"...","hubSubtitle":"one short line under the hub (optional, can be empty string)","clouds":[{"id":"music","title":"Music & live shows","teaser":"Max ~120 chars","points":[{"headline":"Short label","detail":"2-4 sentences"},{"headline":"...","detail":"..."}]},...]}`;

function openAIMindMapPrompt(rawInfo) {
  return `You are helping parents visually explore what their teen might care about. The research summary is centered on **Rihanna**: her music, media, brands, values, and how people talk about her online.

SOURCE (only use facts supported here; do not invent):
---
${rawInfo}
---

Build a PARENT-FACING mind map as JSON.

1. **hubTitle**: A warm 3–8 word centre title. Because the source is focused on one public figure, the hub may name Rihanna (e.g. "Rihanna: what's in the conversation" or "Catching up on Rihanna").

2. **hubSubtitle**: Optional one line under the hub; may be empty string.

3. **clouds**: Exactly **5** clouds, in this order, with these **id** values (keep ids exactly):
   - **music** — albums, singles, tours, festivals, awards, viral songs, TikTok sounds
   - **films** — movies, TV, streaming, soundtracks, premieres tied to Rihanna or projects she is linked to
   - **passions** — hobbies, causes, sports, art, "what they stand for" outside charts
   - **style** — fashion, beauty, brands, red carpet, aesthetics fans copy
   - **social** — apps, memes, fandom fights, stan culture, online trends (keep age-appropriate)

For EACH cloud:
- **title**: 2–5 words shown on the cloud (can differ slightly from id, e.g. "Films & TV" for id films).
- **teaser**: One line, max ~120 characters, shown BEFORE click (the hook).
- **points**: 3 to 5 items. Each has **headline** (very short) and **detail** (2–4 sentences, concrete).

If the source lacks info for a cloud, still include the cloud with 2–3 points that honestly say what is thin or what parents could ask open-ended (no fabrication of fake events).

Output ONLY valid JSON, no markdown:
${MIND_MAP_SCHEMA}`;
}

function parseBreakdown(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { topics: [] };
  return Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [];
}

function parseMindMap(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { hubTitle: "", hubSubtitle: "", clouds: [] };
  const parsed = JSON.parse(jsonMatch[0]);
  const clouds = Array.isArray(parsed.clouds) ? parsed.clouds : [];
  const allowed = ["music", "films", "passions", "style", "social"];
  const byId = new Map(clouds.map((c) => [c.id, c]));
  const ordered = allowed.map((id) => {
    const c = byId.get(id);
    if (!c) return null;
    const points = Array.isArray(c.points) ? c.points : [];
    return {
      id,
      title: String(c.title || id),
      teaser: String(c.teaser || "").slice(0, 200),
      points: points
        .filter((p) => p && (p.headline || p.detail))
        .map((p) => ({
          headline: String(p.headline || "").trim(),
          detail: String(p.detail || "").trim(),
        }))
        .slice(0, 6),
    };
  });
  return {
    hubTitle: String(parsed.hubTitle || "What they are into").trim(),
    hubSubtitle: String(parsed.hubSubtitle || "").trim(),
    clouds: ordered.filter(Boolean),
  };
}

async function fetchRawWithPerplexity(topic, apiKey) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: perplexityPrompt(topic) }],
      max_tokens: 2048,
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

async function breakDownWithMindMap(rawInfo, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You output only valid JSON. No markdown, no code blocks, no extra text. Use only facts from the user message; where the source is thin, say so instead of inventing.",
        },
        { role: "user", content: openAIMindMapPrompt(rawInfo) },
      ],
      temperature: 0.35,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI failed");
  return parseMindMap(data?.choices?.[0]?.message?.content?.trim() || "");
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
  const useMindMap = config?.mindMapMode === true;

  try {
    const rawInfo = await fetchRawWithPerplexity(topic, perplexityKey);
    if (!rawInfo) return { statusCode: 200, headers, body: JSON.stringify({ topics: [], error: "No latest info returned." }) };

    if (useMindMap) {
      const mm = await breakDownWithMindMap(rawInfo, openaiKey);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          hubTitle: mm.hubTitle,
          hubSubtitle: mm.hubSubtitle,
          clouds: mm.clouds,
          updatedAt: new Date().toISOString(),
        }),
      };
    }

    const topics = await breakDownWithOpenAI(topic, rawInfo, openaiKey);
    return { statusCode: 200, headers, body: JSON.stringify({ topics }) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ topics: [], error: "Could not load topics. Try again later." }) };
  }
};
