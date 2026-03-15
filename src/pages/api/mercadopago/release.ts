import type { APIRoute } from "astro";
import { releaseStockReservation } from "../../../lib/commerce";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as any;
  const reservationId = String(body?.reservationId || body?.reservation_id || "").trim();
  if (!reservationId) {
    return new Response("Missing reservationId", { status: 400 });
  }

  const released = await releaseStockReservation(reservationId);
  return new Response(JSON.stringify({ ok: true, released }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
