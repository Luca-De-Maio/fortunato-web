import type { APIRoute } from "astro";
import {
  createStockReservation,
  quoteCart,
  releaseStockReservation,
  setReservationPreferenceId
} from "../../../lib/commerce";
import {
  getCheckoutIssues,
  normalizeCheckoutDetails,
  splitFullName
} from "../../../lib/checkout";
import {
  getMercadoPagoAccessToken,
  getMercadoPagoMode,
  getPublicSiteUrl
} from "../../../lib/mercadopago";
import { consumeRateLimit, getRequestIdentifier } from "../../../lib/rate-limit";

export const prerender = false;

const getBaseUrl = (requestUrl: string) => {
  const env = getPublicSiteUrl();
  if (env) return env.replace(/\/+$/, "");
  try {
    return new URL(requestUrl).origin;
  } catch {
    return "http://localhost:4321";
  }
};

const supportsPublicCallbacks = (baseUrl: string) => {
  try {
    const { hostname, protocol } = new URL(baseUrl);
    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return false;
    }
    return !(
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
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

  let token = "";
  try {
    token = getMercadoPagoAccessToken();
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Missing MERCADOPAGO_ACCESS_TOKEN", {
      status: 500
    });
  }

  const body = await request.json().catch(() => null) as any;
  const cart = Array.isArray(body?.cart) ? body.cart : null;
  if (!cart || !cart.length) {
    return new Response("Invalid cart", { status: 400 });
  }

  const quote = await quoteCart(cart);
  const checkout = normalizeCheckoutDetails(body?.checkout);
  const checkoutIssues = getCheckoutIssues(checkout, { requireComplete: true });
  const total = Number(quote.subtotal || 0);
  const enrichedQuote = {
    ...quote,
    checkout,
    checkoutIssues,
    checkoutReady: !checkoutIssues.length,
    shipping: null,
    shippingMode: "manual_quote",
    shippingNotice: "El costo de envio se confirma despues de la compra segun la direccion cargada.",
    total,
    amountDueToday: total
  };

  if (!quote.items.length) {
    return new Response("No valid items", { status: 400 });
  }
  if (quote.issues.length) {
    return new Response(JSON.stringify({
      error: "Cart requires review",
      quote: enrichedQuote
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (checkoutIssues.length) {
    return new Response(JSON.stringify({
      error: "Checkout requires review",
      quote: enrichedQuote
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    });
  }

  const baseUrl = getBaseUrl(request.url);
  const checkoutSnapshot = {
    customer: checkout.customer,
    shippingAddress: checkout.shippingAddress,
    shippingAmount: 0,
    shipping: null,
    shippingMode: "manual_quote",
    shippingQuotePending: true,
    shippingNotice: "El costo de envio se confirma despues de la compra segun la direccion cargada.",
    items: quote.items,
    subtotal: Number(quote.subtotal || 0),
    total,
    currency: String(quote.currency || "ARS")
  };
  const reservation = await createStockReservation({
    cart: quote.cart,
    locks: quote.reservationLocks,
    checkoutSnapshot
  });
  const withReservationParam = (path: string) => {
    const url = new URL(path, `${baseUrl}/`);
    url.searchParams.set("reservation_id", reservation.id);
    return url.toString();
  };
  const allowCallbacks = supportsPublicCallbacks(baseUrl);
  const webhookUrl = allowCallbacks ? new URL("/api/mercadopago/webhook", `${baseUrl}/`) : null;
  webhookUrl?.searchParams.set("source_news", "webhooks");
  const payerName = splitFullName(checkout.customer.fullName);
  const preference: Record<string, unknown> = {
    items: quote.items.map((item: any) => ({
      title: String(item.title || item.name || "Producto Fortunato"),
      quantity: Number(item.qty || 1),
      unit_price: Number(item.unitPrice || 0),
      currency_id: String(item.currency || "ARS") === "ARS" ? "ARS" : String(item.currency || "ARS")
    })),
    external_reference: reservation.id,
    metadata: {
      reservation_id: reservation.id,
      shipping_mode: "manual_quote",
      customer_email: checkout.customer.email
    },
    payer: {
      name: payerName.name,
      surname: payerName.surname,
      email: checkout.customer.email,
      phone: {
        number: checkout.customer.phone
      }
    },
    expires: true,
    expiration_date_to: new Date(reservation.expiresAt).toISOString()
  };
  if (allowCallbacks) {
    preference.back_urls = {
      success: withReservationParam("/checkout/success"),
      pending: withReservationParam("/checkout/pending"),
      failure: withReservationParam("/checkout/failure")
    };
    preference.auto_return = "approved";
    preference.notification_url = webhookUrl?.toString();
  }

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
    return new Response(JSON.stringify({
      error: text || "Mercado Pago error"
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }

  const data = await mpRes.json().catch(() => ({} as any));
  const preferenceId = String(data?.id || "").trim();
  const mode = getMercadoPagoMode();
  const checkoutUrl =
    mode === "sandbox" ? data.sandbox_init_point : data.init_point;

  if (!checkoutUrl || !preferenceId) {
    await releaseStockReservation(reservation.id);
    return new Response(JSON.stringify({
      error: "Mercado Pago response missing init_point or preference id"
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }

  await setReservationPreferenceId(reservation.id, preferenceId);

  return new Response(JSON.stringify({
    checkoutUrl,
    preferenceId,
    reservationId: reservation.id,
    expiresAt: reservation.expiresAt
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
