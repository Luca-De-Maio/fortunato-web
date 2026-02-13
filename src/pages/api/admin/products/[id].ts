import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { deleteProduct, upsertProduct } from "../../../../lib/products";

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies, params }) => {
  if (!requireAdmin(cookies)) return new Response("Unauthorized", { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!payload) return new Response("Invalid payload", { status: 400 });
  if (params.id !== payload.id) return new Response("Mismatched id", { status: 400 });
  await upsertProduct(payload);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!requireAdmin(cookies)) return new Response("Unauthorized", { status: 401 });
  if (!params.id) return new Response("Missing id", { status: 400 });
  await deleteProduct(params.id);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
