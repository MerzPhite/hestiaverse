#!/usr/bin/env node
/**
 * Fetches Connection 2 mind-map data: central hub + category clouds (music, films, passions, etc.)
 * Each cloud has a short title/teaser; points hold headline + detail for expand view.
 * Uses Perplexity + OpenAI. Needs both API keys in .env.
 * Run: npm run fetch-connection-pop-girls
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
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
  "Rihanna: latest music, performances, tours or one-off shows, awards and chart moments; Fenty Beauty, Savage X Fenty, and other business or brand moves; film, TV, or soundtrack work; philanthropy and causes; fashion and cultural influence; viral social moments or notable fan press coverage. Be concrete with names, titles, and dates.";

function perplexityPrompt() {
  return `Search for the LATEST developments about: ${PERPLEXITY_QUERY}

Cover multiple lanes: music releases and shows, film/TV/streaming tie-ins, personal passions (sports, art, activism), style and brands, and what fans argue about online. Include controversies or viral incidents if reported. Concrete names, titles, and dates. One thorough summary. No generic fluff.`;
}

const MIND_MAP_SCHEMA = `{"hubTitle":"...","hubSubtitle":"one short line under the hub (optional, can be empty string)","clouds":[{"id":"music","title":"Music & live shows","teaser":"Max ~120 chars: what this cloud covers","points":[{"headline":"Short label","detail":"2-4 sentences with specifics"},{"headline":"...","detail":"..."}]},...]}`;

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

async function fetchRawWithPerplexity(apiKey) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: perplexityPrompt() }],
      max_tokens: 2048,
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

async function main() {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!perplexityKey || !openaiKey) {
    console.error("Add PERPLEXITY_API_KEY and OPENAI_API_KEY to .env");
    process.exit(1);
  }

  console.log("Step 1: Fetching Rihanna-focused context with Perplexity...");
  const rawInfo = await fetchRawWithPerplexity(perplexityKey);
  if (!rawInfo) throw new Error("Perplexity returned no content.");

  console.log("Step 2: Building mind map (hub + clouds + points) with OpenAI...");
  const mm = await breakDownWithOpenAI(rawInfo, openaiKey);

  const out = {
    hubTitle: mm.hubTitle,
    hubSubtitle: mm.hubSubtitle,
    clouds: mm.clouds,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Wrote", OUT_PATH, "hub:", mm.hubTitle, "| clouds:", mm.clouds.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
