import type { APIRoute } from "astro";
import { isSameOriginCollectionRequest, recordAnalyticsBatch } from "../../../lib/analytics";
import { consumeRateLimit, getRequestIdentifier } from "../../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isSameOriginCollectionRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const bodyText = await request.text().catch(() => "");
  if (!bodyText) {
    return new Response("Invalid request", { status: 400 });
  }

  let body: { sessionId?: unknown; events?: unknown } | null = null;
  try {
    body = JSON.parse(bodyText) as { sessionId?: unknown; events?: unknown };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const sessionKey = String(body?.sessionId || "").slice(0, 80) || "unknown";
  const rate = consumeRateLimit({
    namespace: "analytics-collect",
    key: `${getRequestIdentifier(request)}:${sessionKey}`,
    limit: 240,
    windowMs: 5 * 60 * 1000
  });
  if (!rate.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) }
    });
  }

  const result = await recordAnalyticsBatch({
    sessionId: body?.sessionId,
    events: Array.isArray(body?.events) ? body.events : []
  });
  return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
    status: 202,
    headers: { "Content-Type": "application/json" }
  });
};
