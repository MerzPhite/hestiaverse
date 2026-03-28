/**
 * Netlify serverless function: GET /.netlify/functions/topics-for-interest?interest=...
 * Fetches up to 3 recent news/topics for a given interest (e.g. band, team) and returns
 * them with suggested conversation starters for parents.
 * Set GNEWS_API_KEY in Netlify env (get a free key at https://gnews.io/).
 */

const GNEWS_BASE = "https://gnews.io/api/v4/search";

function conversationStarterFromTitle(title) {
  if (!title || typeof title !== "string") return "Ask what they think about it.";
  const t = title.trim();
  if (t.length > 80) {
    return `"I saw something about ${t.slice(0, 77)}… — have you seen that?"`;
  }
  return `"I saw something about ${t} — what do you think?"`;
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const interest = event.queryStringParameters?.interest?.trim();
  if (!interest) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing query parameter: interest", topics: [] }),
    };
  }
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        topics: [],
        error: "Conversation starters are not configured. Add GNEWS_API_KEY in site settings.",
      }),
    };
  }
  try {
    const url = `${GNEWS_BASE}?q=${encodeURIComponent(interest)}&token=${encodeURIComponent(apiKey)}&lang=en&max=3`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.message || data?.errors?.[0] || "News service error.";
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ topics: [], error: msg }),
      };
    }
    const articles = Array.isArray(data?.articles) ? data.articles : [];
    const topics = articles.slice(0, 3).map((a) => ({
      title: a.title || "Recent news",
      description: a.description || "",
      url: a.url || "",
      conversationStarter: conversationStarterFromTitle(a.title),
    }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ topics }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        topics: [],
        error: "Could not load topics. Try again later.",
      }),
    };
  }
};
