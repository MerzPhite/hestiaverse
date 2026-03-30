#!/usr/bin/env node
/**
 * List, accept, or reject queued articles.
 *
 *   node scripts/accept-article.js --list          List queued articles
 *   node scripts/accept-article.js <slug>         Accept one article (add to site, remove from queue)
 *   node scripts/accept-article.js --latest       Accept the most recently queued article
 *   node scripts/accept-article.js --reject <slug>  Remove from queue without publishing
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "queue", "pending");

const {
  appendToArticlesJs,
  appendToResearchOutputs,
  maybeAppendToAppsReferenced,
} = require("./lib/article-io");

function getQueueFiles() {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs.readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: path.join(QUEUE_DIR, f),
      slug: f.replace(/\.json$/, ""),
    }))
    .filter((e) => fs.statSync(e.path).isFile());
}

function listQueue() {
  const files = getQueueFiles();
  if (files.length === 0) {
    console.log("No articles in queue.");
    return;
  }
  const withMeta = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(f.path, "utf8"));
    const stat = fs.statSync(f.path);
    return { ...f, title: data.title, mtime: stat.mtime };
  });
  withMeta.sort((a, b) => b.mtime - a.mtime);
  console.log("Queued articles:\n");
  withMeta.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.slug}`);
    console.log(`     ${e.title}`);
    console.log(`     queued: ${e.mtime.toISOString()}\n`);
  });
  console.log("Accept one: npm run accept-article <slug>");
  console.log("Accept latest: npm run accept-article -- --latest");
  console.log("Reject one: npm run accept-article -- --reject <slug>");
}

function acceptBySlug(slug) {
  const filepath = path.join(QUEUE_DIR, `${slug}.json`);
  if (!fs.existsSync(filepath)) {
    console.error("Not found in queue:", slug);
    process.exit(1);
  }
  const article = JSON.parse(fs.readFileSync(filepath, "utf8"));
  article.createdAt = article.queuedAt || new Date().toISOString();
  delete article.queuedAt;
  appendToArticlesJs(article);
  appendToResearchOutputs(article);
  maybeAppendToAppsReferenced(article);
  fs.unlinkSync(filepath);
  console.log("Accepted and published:", slug, "-", article.title);
}

function acceptLatest() {
  const files = getQueueFiles();
  if (files.length === 0) {
    console.error("No articles in queue.");
    process.exit(1);
  }
  const withStat = files.map((f) => ({ ...f, mtime: fs.statSync(f.path).mtime }));
  withStat.sort((a, b) => b.mtime - a.mtime);
  acceptBySlug(withStat[0].slug);
}

function rejectBySlug(slug) {
  const filepath = path.join(QUEUE_DIR, `${slug}.json`);
  if (!fs.existsSync(filepath)) {
    console.error("Not found in queue:", slug);
    process.exit(1);
  }
  fs.unlinkSync(filepath);
  console.log("Rejected (removed from queue):", slug);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--list" || args[0] === "-l") {
    listQueue();
    return;
  }
  if (args[0] === "--latest") {
    acceptLatest();
    return;
  }
  if (args[0] === "--reject" || args[0] === "-r") {
    const slug = args[1];
    if (!slug) {
      console.error("Usage: node scripts/accept-article.js --reject <slug>");
      process.exit(1);
    }
    rejectBySlug(slug);
    return;
  }
  acceptBySlug(args[0]);
}

main();
