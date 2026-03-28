# Automating article creation (e.g. every hour)

The script `scripts/create-article.js` generates **one** new article using the rules in `PROMPT-RESEARCH-NEW-RISKS.md`. By default it puts the article in a **queue** (`queue/pending/`) for review; use `scripts/accept-article.js` to list, accept, or reject queued articles. It uses the OpenAI API.

## 1. Prerequisites

- **Node.js** 18+ (for `fetch`).
- **OpenAI API key.** Create one at [platform.openai.com](https://platform.openai.com/api-keys).

## 2. Run once (manual)

**Recommended: use a `.env` file** so the key never appears in the terminal or history.

1. Copy `.env.example` to `.env` in the project root.
2. Add your key: `OPENAI_API_KEY=sk-your-key-here`
3. Run:

```bash
node scripts/create-article.js
# or
npm run create-article
```

The script loads `OPENAI_API_KEY` from `.env` automatically. Do not commit `.env` (it is in `.gitignore`).

By default the script **queues** the new article (saves it to `queue/pending/<slug>.json`) so you can review before publishing. To publish straight to the site instead, run:

```bash
npm run create-article -- --publish
```

**Queue workflow:**

1. **Generate into queue:** `npm run create-article` (no `--publish`). New articles go to `queue/pending/`.
2. **List queued articles:** `npm run accept-article -- --list`
3. **Accept one (publish to site):** `npm run accept-article -- <slug>` or `npm run accept-article -- --latest`
4. **Reject one (remove from queue):** `npm run accept-article -- --reject <slug>`

When you **accept** an article, it is appended to `src/_data/articles.js`, a block is added to `src/RESEARCH-OUTPUTS.md`, and optionally `src/APPS-REFERENCED.md` is updated. Then run `npm run build` to regenerate the site.

**View and accept from your phone (same WiFi):** Run the queue dashboard on your laptop, then open the URL it prints on your phone:

```bash
npm run queue-dashboard
```

It will show your laptop's IP and port (e.g. `http://192.168.1.5:3847`). Open that in your phone's browser to see queued articles and tap Accept or Reject. Your laptop must be on and the dashboard must be running.

## 3. Run every hour

**Note:** Cron only runs when your Mac is **awake**. If the laptop is asleep or closed, the hourly job will not run. To run without the laptop, use GitHub Actions (Option B below).

**Google Trends chart:** To show "Search interest over time" for parent-relevant terms, run:

```bash
npm run fetch-trends
```

This writes to `src/_data/trends.json`. Run on a schedule (e.g. daily) and rebuild so the chart updates.

**TikTok trends (New Engen):** To refresh the homepage “TikTok trends” section from [New Engen Insights](https://newengen.com/insights/) (URLs whose slug contains `tiktok`), run:

```bash
npm run fetch-tiktok-trends
```

This writes to `src/_data/tiktokTrends.json`. It **replaces** scraped New Engen entries each run but **keeps** curated rows that do not use a `sourceUrl` on `newengen.com/insights/`. Then rebuild (`npm run build`) or let your host rebuild.

### Option A: Cron (macOS / Linux)

1. Put your key in a `.env` file in the project root (see above). Do not put the key on the command line.
2. Open crontab: `crontab -e`
3. Add a line (replace the path):

```cron
0 * * * * cd /full/path/to/Hestiaverse && node scripts/create-article.js >> /tmp/hestiaverse-create-article.log 2>&1
```

The script reads `OPENAI_API_KEY` from `.env`, so the key never appears in cron or process lists. To run every 6 hours instead:

```cron
0 */6 * * * cd /full/path/to/Hestiaverse && node scripts/create-article.js >> /tmp/hestiaverse-create-article.log 2>&1
```

### Option B: GitHub Actions (hourly workflow)

1. In your GitHub repo: **Settings → Secrets and variables → Actions**. Add a secret named `OPENAI_API_KEY` with your key.

2. Create the workflow file:

`.github/workflows/create-article-hourly.yml`:

```yaml
name: Create article hourly

on:
  schedule:
    - cron: '0 * * * *'   # every hour at :00
  workflow_dispatch:       # allow manual run

jobs:
  create:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Create article
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: node scripts/create-article.js

      - name: Build site
        run: npm run build

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/_data/articles.js src/RESEARCH-OUTPUTS.md src/APPS-REFERENCED.md
          git diff --staged --quiet || (git commit -m "chore: add automated article" && git push)
```

This runs every hour, creates an article, builds the site, and commits and pushes the changed files. If you deploy from the same repo (e.g. Netlify/Vercel on push), the new article will go live after the next deploy.

## 4. Optional: npm script

In `package.json` add:

```json
"scripts": {
  "create-article": "node scripts/create-article.js"
}
```

Then: `OPENAI_API_KEY=sk-... npm run create-article`.

## 5. Notes

- The script uses the **gpt-4o-mini** model by default (cheaper, fast). To change it, edit the `model` field in `scripts/create-article.js`.
- If the AI returns something we already have (same slug), the script exits without changing files.
- After automation adds articles, run `npm run build` locally or rely on your CI/deploy to build.
