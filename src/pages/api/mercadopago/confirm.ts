import type { APIRoute } from "astro";
import { confirmStockReservation, getOrderByReservationId, getStockReservation } from "../../../lib/commerce";
import { fetchMercadoPagoPayment, getMercadoPagoAccessToken } from "../../../lib/mercadopago";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as any;
  const reservationId = String(body?.reservationId || body?.reservation_id || "").trim();
  const paymentId = String(body?.paymentId || body?.payment_id || "").trim();

  if (!reservationId || !paymentId) {
    return new Response("Missing reservationId or paymentId", { status: 400 });
  }

  const reservation = await getStockReservation(reservationId);
  if (!reservation) {
    return new Response("Reservation not found", { status: 404 });
  }
  if (reservation.status === "confirmed") {
    return new Response(JSON.stringify({ ok: true, reservation }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    getMercadoPagoAccessToken();
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Missing MERCADOPAGO_ACCESS_TOKEN", {
      status: 500
    });
  }

  let payment: any;
  try {
    payment = await fetchMercadoPagoPayment(paymentId);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Mercado Pago payment lookup failed", {
      status: 502
    });
  }

  if (String(payment?.status || "").toLowerCase() !== "approved") {
    return new Response("Payment is not approved", { status: 409 });
  }
  if (payment?.external_reference && String(payment.external_reference) !== reservationId) {
    return new Response("Payment does not match reservation", { status: 409 });
  }

  const updated = await confirmStockReservation({ id: reservationId, paymentId });
  const order = await getOrderByReservationId(reservationId);
  return new Response(JSON.stringify({ ok: true, reservation: updated, order }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
