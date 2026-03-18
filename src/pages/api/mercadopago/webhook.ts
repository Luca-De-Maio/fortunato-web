import type { APIRoute } from "astro";
import { confirmStockReservation, releaseStockReservation } from "../../../lib/commerce";
import {
  fetchMercadoPagoPayment,
  getMercadoPagoWebhookSecret,
  validateMercadoPagoWebhookSignature
} from "../../../lib/mercadopago";

export const prerender = false;

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });

export const GET: APIRoute = async () => {
  return json({ ok: true });
};

export const POST: APIRoute = async ({ request }) => {
  let requiresSignature = true;
  try {
    getMercadoPagoWebhookSecret();
  } catch (error) {
    requiresSignature = false;
  }

  if (requiresSignature && !validateMercadoPagoWebhookSignature(request)) {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }

  const url = new URL(request.url);
  const body = await request.json().catch(() => null) as any;
  const type = String(body?.type || url.searchParams.get("type") || url.searchParams.get("topic") || "").trim().toLowerCase();
  const paymentId = String(body?.data?.id || body?.id || url.searchParams.get("data.id") || "").trim();

  if (type && type !== "payment") {
    return json({ ok: true, ignored: true, reason: "Unsupported topic" });
  }
  if (!paymentId) {
    return json({ ok: true, ignored: true, reason: "Missing payment id" });
  }

  let payment: any;
  try {
    payment = await fetchMercadoPagoPayment(paymentId);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Mercado Pago payment lookup failed", {
      status: 502
    });
  }

  const reservationId = String(payment?.external_reference || payment?.metadata?.reservation_id || "").trim();
  if (!reservationId) {
    return json({ ok: true, ignored: true, reason: "Payment has no reservation reference" });
  }

  const status = String(payment?.status || "").trim().toLowerCase();
  if (status === "approved") {
    await confirmStockReservation({ id: reservationId, paymentId: String(payment?.id || paymentId) });
    return json({ ok: true, status: "confirmed" });
  }

  if (status === "rejected" || status === "cancelled") {
    await releaseStockReservation(reservationId);
    return json({ ok: true, status: "released" });
  }

  return json({ ok: true, status: "ignored" });
};
