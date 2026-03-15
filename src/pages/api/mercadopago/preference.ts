import type { APIRoute } from "astro";
import {
  createStockReservation,
  quoteCart,
  releaseStockReservation,
  setReservationPreferenceId
} from "../../../lib/commerce";
import { consumeRateLimit, getRequestIdentifier } from "../../../lib/rate-limit";

export const prerender = false;

const getBaseUrl = (requestUrl: string) => {
  const env =
    (process.env.PUBLIC_SITE_URL || "").trim() ||
    (process.env.SITE_URL || "").trim();
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(requestUrl).origin;
  } catch {
    return "http://localhost:4321";
  }
};

export const POST: APIRoute = async ({ request }) => {
  const rate = consumeRateLimit({
    namespace: "mercadopago-preference",
    key: getRequestIdentifier(request),
    limit: 30,
    windowMs: 5 * 60 * 1000
  });
  if (!rate.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) }
    });
  }

  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) {
    return new Response("Missing MERCADOPAGO_ACCESS_TOKEN", { status: 500 });
  }

  const body = await request.json().catch(() => null) as any;
  const cart = Array.isArray(body?.cart) ? body.cart : null;
  if (!cart || !cart.length) {
    return new Response("Invalid cart", { status: 400 });
  }

  const quote = await quoteCart(cart);
  if (!quote.items.length) {
    return new Response("No valid items", { status: 400 });
  }
  if (quote.issues.length) {
    return new Response(JSON.stringify({
      error: "Cart requires review",
      quote
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    });
  }

  const baseUrl = getBaseUrl(request.url);
  const reservation = await createStockReservation({
    cart: quote.cart,
    locks: quote.reservationLocks
  });
  const withReservationParam = (path: string) => {
    const url = new URL(path, `${baseUrl}/`);
    url.searchParams.set("reservation_id", reservation.id);
    return url.toString();
  };
  const preference = {
    items: quote.items.map((item: any) => ({
      title: String(item.title || item.name || "Producto Fortunato"),
      quantity: Number(item.qty || 1),
      unit_price: Number(item.unitPrice || 0),
      currency_id: String(item.currency || "ARS") === "ARS" ? "ARS" : String(item.currency || "ARS")
    })),
    back_urls: {
      success: withReservationParam("/checkout/success"),
      pending: withReservationParam("/checkout/pending"),
      failure: withReservationParam("/checkout/failure")
    },
    auto_return: "approved",
    external_reference: reservation.id,
    metadata: {
      reservation_id: reservation.id
    },
    expires: true,
    expiration_date_to: new Date(reservation.expiresAt).toISOString()
  };

  let mpRes: Response;
  try {
    mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(preference)
    });
  } catch (error) {
    await releaseStockReservation(reservation.id);
    throw error;
  }

  if (!mpRes.ok) {
    const text = await mpRes.text().catch(() => "");
    await releaseStockReservation(reservation.id);
    return new Response(text || "Mercado Pago error", { status: 502 });
  }

  const data = await mpRes.json().catch(() => ({} as any));
  const mode = (process.env.MERCADOPAGO_ENV || "prod").toLowerCase();
  const checkoutUrl =
    mode === "sandbox" ? data.sandbox_init_point : data.init_point;

  if (!checkoutUrl) {
    await releaseStockReservation(reservation.id);
    return new Response("Mercado Pago response missing init_point", { status: 502 });
  }

  if (data.id) {
    await setReservationPreferenceId(reservation.id, String(data.id));
  }

  return new Response(JSON.stringify({
    checkoutUrl,
    reservationId: reservation.id,
    expiresAt: reservation.expiresAt
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
