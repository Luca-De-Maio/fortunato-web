import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/auth";
import { getAllProducts, upsertProduct } from "../../../lib/products";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  if (!requireAdmin(cookies)) return new Response("Unauthorized", { status: 401 });
  const products = await getAllProducts();
  return new Response(JSON.stringify(products), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!requireAdmin(cookies)) return new Response("Unauthorized", { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!payload) return new Response("Invalid payload", { status: 400 });
  await upsertProduct(payload);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
