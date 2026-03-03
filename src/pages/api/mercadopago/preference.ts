import type { APIRoute } from "astro";
import { getAllProducts } from "../../../lib/products";

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
  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) {
    return new Response("Missing MERCADOPAGO_ACCESS_TOKEN", { status: 500 });
  }

  const body = await request.json().catch(() => null) as any;
  const cart = Array.isArray(body?.cart) ? body.cart : null;
  if (!cart || !cart.length) {
    return new Response("Invalid cart", { status: 400 });
  }

  const products = await getAllProducts();
  const byId = new Map(products.map((p: any) => [p.id, p]));

  const items = cart
    .map((row: any) => {
      const id = String(row?.id || "");
      const qty = Math.max(1, Math.min(99, Number(row?.qty || 1)));
      const color = String(row?.color || "").trim();
      const size = String(row?.size || "").trim();

      const product = byId.get(id);
      if (!product) return null;

      const unitPrice = Number(product.price || 0);
      const currency = String(product.currency || "ARS");
      const titleParts = [String(product.name || "Producto")];
      if (color) titleParts.push(color);
      if (size) titleParts.push(`Talle ${size}`);
      const title = titleParts.join(" · ");

      return {
        title,
        quantity: qty,
        unit_price: unitPrice,
        currency_id: currency === "ARS" ? "ARS" : currency
      };
    })
    .filter(Boolean);

  if (!items.length) {
    return new Response("No valid items", { status: 400 });
  }

  const baseUrl = getBaseUrl(request.url);
  const preference = {
    items,
    back_urls: {
      success: `${baseUrl}/checkout/success`,
      pending: `${baseUrl}/checkout/pending`,
      failure: `${baseUrl}/checkout/failure`
    },
    auto_return: "approved"
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preference)
  });

  if (!mpRes.ok) {
    const text = await mpRes.text().catch(() => "");
    return new Response(text || "Mercado Pago error", { status: 502 });
  }

  const data = await mpRes.json().catch(() => ({} as any));
  const mode = (process.env.MERCADOPAGO_ENV || "prod").toLowerCase();
  const checkoutUrl =
    mode === "sandbox" ? data.sandbox_init_point : data.init_point;

  if (!checkoutUrl) {
    return new Response("Mercado Pago response missing init_point", { status: 502 });
  }

  return new Response(JSON.stringify({ checkoutUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

