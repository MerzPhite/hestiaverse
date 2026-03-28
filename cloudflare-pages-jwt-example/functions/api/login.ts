/**
 * POST /api/login
 * Body: { "email": string, "password": string }
 * Returns: { "token": string } or 401.
 *
 * In production, validate credentials against your DB (e.g. Supabase/D1).
 * Here we accept any body for demo and issue a JWT.
 */
import { SignJWT } from "jose";

const encoder = new TextEncoder();

export async function onRequestPost(context: { env: Env; request: Request }) {
  const { env } = context;
  const secret = env.JWT_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: "Server missing JWT_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { email?: string; password?: string };
  try {
    body = (await context.request.json()) as { email?: string; password?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Demo: accept any email. In production, verify password against your DB.
  const email = body.email ?? "demo@example.com";
  const secretKey = encoder.encode(secret);

  const token = await new SignJWT({ sub: email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Allow CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
