import type { APIRoute } from "astro";
import { quoteCart } from "../../../lib/commerce";
import { consumeRateLimit, getRequestIdentifier } from "../../../lib/rate-limit";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const rate = consumeRateLimit({
    namespace: "cart-quote",
    key: getRequestIdentifier(request),
    limit: 90,
    windowMs: 5 * 60 * 1000
  });
  if (!rate.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) }
    });
  }

  const body = await request.json().catch(() => null) as any;
  const quote = await quoteCart(body?.cart);
  return new Response(JSON.stringify(quote), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
