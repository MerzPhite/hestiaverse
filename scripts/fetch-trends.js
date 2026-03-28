#!/usr/bin/env node
/**
 * Fetch Google Trends "interest over time" for parent-relevant search terms.
 * Saves to src/_data/trends.json for Eleventy. Run on a schedule (e.g. daily).
 * Requires: npm install google-trends-api
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "_data", "trends.json");

const KEYWORDS = ["sextortion", "TikTok", "Roblox", "online safety kids"];

async function main() {
  let googleTrends;
  try {
    googleTrends = require("google-trends-api");
  } catch (e) {
    console.error("Run: npm install google-trends-api");
    process.exit(1);
  }

  const endTime = new Date();
  const startTime = new Date();
  startTime.setMonth(startTime.getMonth() - 12);

  const results = await googleTrends.interestOverTime({
    keyword: KEYWORDS,
    startTime,
    endTime,
    geo: "GB",
  });

  const parsed = JSON.parse(results);
  const defaultData = parsed?.default;
  if (!defaultData?.timelineData?.length) {
    console.error("No timeline data in response");
    process.exit(1);
  }

  const timelineData = defaultData.timelineData;
  const labels = timelineData.map((d) => d.formattedTime || d.time);

  const keywordIndex = (defaultData.keywords || []).map((k) => k.query);
  const datasets = KEYWORDS.map((kw, i) => ({
    label: kw,
    data: timelineData.map((d) => {
      const v = d.value;
      return Array.isArray(v) ? Number(v[i] ?? v[0] ?? 0) : Number(v ?? 0);
    }),
  }));

  const out = {
    updatedAt: new Date().toISOString(),
    labels,
    datasets,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("Trends updated:", out.labels.length, "points,", out.datasets.length, "terms");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
