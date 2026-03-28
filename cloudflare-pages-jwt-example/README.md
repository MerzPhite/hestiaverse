# Cloudflare Pages + JWT + Edge Functions (HTML, TypeScript, Tailwind)

Minimal example: static frontend (HTML, TypeScript, Tailwind) on Cloudflare Pages with **Edge Functions** for **login** (issue JWT) and **protected API** (verify JWT).

## Is it easy?

- **Edge Functions:** Yes. Put `.ts` files in `/functions`; they become serverless endpoints (e.g. `functions/api/login.ts` → `/api/login`). TypeScript is supported.
- **JWT:** Straightforward with the `jose` library (sign with `SignJWT`, verify with `jwtVerify`). You need a secret in env.

## Setup

1. **Install and build**
   ```bash
   cd cloudflare-pages-jwt-example
   npm install
   npm run build
   ```

2. **Local secret (for `wrangler pages dev`)**
   - Copy `.dev.vars.example` to `.dev.vars`.
   - Set `JWT_SECRET` to a long random string (e.g. 32+ chars).

3. **Run locally**
   ```bash
   npm run dev
   ```
   Open the URL shown (e.g. `http://localhost:8788`). Log in (any email/password in this demo), then click "Call protected API" to see the JWT-verified response.

## Project layout

| Path | Purpose |
|------|--------|
| `index.html` | Static page (Tailwind via CDN). |
| `src/main.ts` | Frontend TypeScript; compiled to `dist/main.js`. |
| `functions/api/login.ts` | **Edge Function:** POST body → issue JWT (HS256). |
| `functions/api/protected.ts` | **Edge Function:** `Authorization: Bearer <token>` → verify JWT, return JSON. |
| `functions/types.d.ts` | Env type (e.g. `JWT_SECRET`). |
| `.dev.vars` | Local env (gitignored). Set `JWT_SECRET` here. |

## Deploy to Cloudflare Pages

1. Create a Pages project in the [Cloudflare dashboard](https://dash.cloudflare.com/) (or use `wrangler pages project create`).
2. Set the **secret** for production:
   ```bash
   npx wrangler pages secret put JWT_SECRET --project-name=YOUR_PROJECT_NAME
   ```
   Enter a long random string when prompted.
3. Deploy:
   ```bash
   npm run deploy
   ```
   Update `--project-name` in `package.json` to match your project.

## Production notes

- **Login:** This demo accepts any email/password. Replace with real auth (e.g. Supabase Auth, or validate credentials against D1/your DB) and then issue the JWT the same way.
- **CORS:** The example uses `*` for demo. Restrict `Access-Control-Allow-Origin` to your frontend origin in production.
- **JWT_SECRET:** Use a strong random value (e.g. `openssl rand -base64 32`) and never commit it.

## Summary

You can use **HTML, TypeScript, and Tailwind** on Cloudflare Pages and add **JWT + Edge Functions** without a separate backend. Edge Functions run in TypeScript; JWTs are handled with `jose` and a secret in env. Setting it up is a small amount of config and a few files.
