# HESTIA VERSE

Static site for online safety information. Built with HTML, Tailwind, TypeScript, and [11ty](https://11ty.dev).

## Structure

- **`src/`** — Source of truth
  - **`layouts/base.njk`** — Shared layout (header, footer, nav). Edit once, applies to all pages.
  - **`index.html`** — Home page content.
  - **`about.md`** — Example second page (Markdown).
  - **`_data/articles.js`** — **Central article data.** Add new articles here; they get a page at `/articles/[slug]/` and auto-link to related articles (by shared labels).
- **`_data/site.json`** — Site-wide data (e.g. nav links). Add new links here to show them in the header.
- **`APPS-REFERENCED.md`** — **Master list of apps/platforms already covered.** Before adding a new app article, search this file to avoid duplicates.
- **`PROMPT-RESEARCH-NEW-RISKS.md`** — **Prompt for researching new risks.** Use when checking the internet for new dangers to add: excludes what we already cover, requires last-12-months recency, and uses our categories so new content can be filtered on the site.
  - **`main.ts`** — TypeScript entry (e.g. filters). Compiles to `dist/js/main.js`.
- **`dist/`** — Build output. Deploy this folder (e.g. Cloudflare Pages).

## Adding pages

1. **New page:** Add a file in `src/`, e.g. `src/resources.md` or `src/guides/gaming.html`.
2. **Front matter** (at the top of the file):

   ```yaml
   ---
   layout: base.njk
   title: Your Page Title
   permalink: /resources/   # URL path
   ---
   ```
3. **Show it in the nav:** Add an entry in `src/_data/site.json` → `nav` array, e.g. `{ "url": "/resources/", "label": "Resources" }`.

Use `.html` for full control, `.md` for Markdown. Each page is a separate HTML file at build time, so navigation is fast and cache-friendly.

## Commands

- **`npm run build`** — Build site (11ty → `dist/`, then TypeScript → `dist/js/`).
- **`npm run dev`** — Serve `dist/` with live reload (run `npm run build` once first).
- **`npm run dev:full`** — Build once, then watch both 11ty and TypeScript and serve (rebuilds on change).

## Deploy (e.g. Cloudflare Pages)

- **Build command:** `npm run build`
- **Output directory:** `dist`
