/**
 * GET /api/protected
 * Requires header: Authorization: Bearer <jwt>
 * Returns 200 + JSON if token valid, 401 otherwise.
 */
import { jwtVerify } from "jose";

const encoder = new TextEncoder();

export async function onRequestGet(context: { env: Env; request: Request }) {
  const { env, request } = context;
  const secret = env.JWT_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: "Server missing JWT_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const secretKey = encoder.encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return new Response(
      JSON.stringify({
        message: "You are authenticated",
        sub: payload.sub,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
