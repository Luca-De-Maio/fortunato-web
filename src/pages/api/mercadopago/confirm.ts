import type { APIRoute } from "astro";
import { confirmStockReservation, getStockReservation } from "../../../lib/commerce";

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

  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) {
    return new Response("Missing MERCADOPAGO_ACCESS_TOKEN", { status: 500 });
  }

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!paymentRes.ok) {
    const text = await paymentRes.text().catch(() => "");
    return new Response(text || "Mercado Pago payment lookup failed", { status: 502 });
  }

  const payment = await paymentRes.json().catch(() => ({} as any));
  if (String(payment?.status || "").toLowerCase() !== "approved") {
    return new Response("Payment is not approved", { status: 409 });
  }
  if (payment?.external_reference && String(payment.external_reference) !== reservationId) {
    return new Response("Payment does not match reservation", { status: 409 });
  }

  const updated = await confirmStockReservation({ id: reservationId, paymentId });
  return new Response(JSON.stringify({ ok: true, reservation: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
