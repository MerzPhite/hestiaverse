#!/usr/bin/env node
/**
 * Local dashboard to view and accept/reject queued articles from your phone.
 * Run: npm run queue-dashboard
 * Then on your phone (same WiFi): open http://<your-laptop-ip>:3847
 *
 * Your laptop must be on and this process running. Find laptop IP: ifconfig | grep "inet " or System Settings → Network.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "queue", "pending");
const PORT = 3847;

const {
  appendToArticlesJs,
  appendToResearchOutputs,
  maybeAppendToAppsReferenced,
} = require("./lib/article-io");

function getQueue() {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs.readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const filepath = path.join(QUEUE_DIR, f);
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
      const stat = fs.statSync(filepath);
      return { slug: data.slug || f.replace(/\.json$/, ""), title: data.title, excerpt: data.excerpt, sourceTitle: data.sourceTitle, sourceUrl: data.sourceUrl, queuedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.queuedAt) - new Date(a.queuedAt));
}

function acceptSlug(slug) {
  const filepath = path.join(QUEUE_DIR, `${slug}.json`);
  if (!fs.existsSync(filepath)) return { ok: false, error: "Not found" };
  const article = JSON.parse(fs.readFileSync(filepath, "utf8"));
  delete article.queuedAt;
  appendToArticlesJs(article);
  appendToResearchOutputs(article);
  maybeAppendToAppsReferenced(article);
  fs.unlinkSync(filepath);
  return { ok: true, slug };
}

function rejectSlug(slug) {
  const filepath = path.join(QUEUE_DIR, `${slug}.json`);
  if (!fs.existsSync(filepath)) return { ok: false, error: "Not found" };
  fs.unlinkSync(filepath);
  return { ok: true, slug };
}

const HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hestiaverse queue</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; background: #0f1419; color: #e7e9ea; min-height: 100vh; }
    h1 { font-size: 1.25rem; margin-bottom: 1rem; }
    .empty { color: #8b98a5; }
    .card { background: #1a2332; border: 1px solid #2f3542; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .card h2 { font-size: 1rem; margin: 0 0 0.25rem 0; }
    .card p { font-size: 0.875rem; color: #8b98a5; margin: 0 0 0.75rem 0; line-height: 1.4; }
    .card .meta { font-size: 0.75rem; color: #6e7a87; margin-bottom: 0.75rem; }
    .actions { display: flex; gap: 0.5rem; }
    button { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; border: none; cursor: pointer; }
    .accept { background: #1d9bf0; color: #fff; }
    .reject { background: transparent; color: #8b98a5; border: 1px solid #2f3542; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .toast { position: fixed; bottom: 1rem; left: 1rem; right: 1rem; background: #1d9bf0; color: #fff; padding: 0.75rem; border-radius: 8px; text-align: center; display: none; }
  </style>
</head>
<body>
  <h1>Queued articles</h1>
  <div id="list"></div>
  <div id="toast" class="toast"></div>
  <script>
    function render(items) {
      const el = document.getElementById("list");
      if (items.length === 0) { el.innerHTML = "<p class=\"empty\">No articles in queue.</p>"; return; }
      el.innerHTML = items.map(function (a) {
        var src = (a.sourceUrl && a.sourceTitle) ? "<p class=\"text-xs mt-1\"><a href=\"" + escapeHtml(a.sourceUrl) + "\" target=\"_blank\" rel=\"noopener\" class=\"text-accent\">" + escapeHtml(a.sourceTitle) + "</a></p>" : (a.sourceUrl ? "<p class=\"text-xs mt-1\"><a href=\"" + escapeHtml(a.sourceUrl) + "\" target=\"_blank\" rel=\"noopener\" class=\"text-accent\">Verify source</a></p>" : "");
        return "<div class=\"card\" data-slug=\"" + a.slug + "\"><h2>" + escapeHtml(a.title) + "</h2><p>" + escapeHtml(a.excerpt || "") + "</p>" + src + "<div class=\"meta\">" + a.queuedAt + "</div><div class=\"actions\"><button class=\"accept\" data-slug=\"" + a.slug + "\">Accept</button><button class=\"reject\" data-slug=\"" + a.slug + "\">Reject</button></div></div>";
      }).join("");
      el.querySelectorAll("button.accept").forEach(function (b) { b.onclick = function () { act("accept", b.dataset.slug, b); }; });
      el.querySelectorAll("button.reject").forEach(function (b) { b.onclick = function () { act("reject", b.dataset.slug, b); }; });
    }
    function escapeHtml(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    function showToast(msg) { var t = document.getElementById("toast"); t.textContent = msg; t.style.display = "block"; setTimeout(function () { t.style.display = "none"; }, 2500); }
    function act(op, slug, btn) {
      btn.disabled = true;
      fetch("/" + op + "/" + encodeURIComponent(slug), { method: "POST" }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { var card = document.querySelector(".card[data-slug=\"" + slug + "\"]"); if (card) card.remove(); showToast(op === "accept" ? "Accepted: " + slug : "Rejected: " + slug); } else { showToast(d.error || "Failed"); btn.disabled = false; }
      }).catch(function () { showToast("Request failed"); btn.disabled = false; });
    }
    fetch("/queue").then(function (r) { return r.json(); }).then(render).catch(function () { document.getElementById("list").innerHTML = "<p class=\"empty\">Could not load queue.</p>"; });
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathParts = url.split("?")[0].split("/").filter(Boolean);

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
    return;
  }

  if (req.method === "GET" && pathParts[0] === "queue") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getQueue()));
    return;
  }

  if (req.method === "POST" && pathParts[0] === "accept" && pathParts[1]) {
    const slug = decodeURIComponent(pathParts[1]);
    const result = acceptSlug(slug);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === "POST" && pathParts[0] === "reject" && pathParts[1]) {
    const slug = decodeURIComponent(pathParts[1]);
    const result = rejectSlug(slug);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Queue dashboard: http://localhost:" + PORT);
  console.log("On your phone (same WiFi): http://<this-machine-ip>:" + PORT);
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name]) {
      if (n.family === "IPv4" && !n.internal) console.log("  Try: http://" + n.address + ":" + PORT);
    }
  }
});
