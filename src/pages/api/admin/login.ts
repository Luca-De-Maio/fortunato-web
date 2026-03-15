import type { APIRoute } from "astro";
import { createSession, hasSessionSecret, setSession, verifyCredentials } from "../../../lib/auth";
import { consumeRateLimit, getRequestIdentifier } from "../../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const rate = consumeRateLimit({
    namespace: "admin-login",
    key: getRequestIdentifier(request),
    limit: 8,
    windowMs: 15 * 60 * 1000
  });
  if (!rate.allowed) {
    return new Response("Too many attempts", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) }
    });
  }

  if (import.meta.env.PROD && !hasSessionSecret()) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return new Response("Invalid request", { status: 400 });

  const { username, password } = body;
  const ok = await verifyCredentials(username, password);
  if (!ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = createSession(username);
  setSession(cookies, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
