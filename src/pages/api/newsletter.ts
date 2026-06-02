import type { APIRoute } from "astro";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { consumeRateLimit, getRequestIdentifier } from "../../lib/rate-limit";

const SUBSCRIBERS_PATH = join(process.cwd(), "data", "subscribers.json");

function readSubscribers(): string[] {
  try {
    return JSON.parse(readFileSync(SUBSCRIBERS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rate = consumeRateLimit({
    namespace: "newsletter",
    key: getRequestIdentifier(request),
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "too_many_requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) }
    });
  }

  const body = await request.json().catch(() => null) as any;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "invalid_email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const subscribers = readSubscribers();
  if (subscribers.includes(email)) {
    return new Response(JSON.stringify({ ok: true, already: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  subscribers.push(email);
  writeFileSync(SUBSCRIBERS_PATH, JSON.stringify(subscribers, null, 2));

  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" }
  });
};
