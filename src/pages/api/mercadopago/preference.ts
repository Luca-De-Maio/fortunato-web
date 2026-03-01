import type { APIRoute } from "astro";
import { getAllProducts } from "../../../lib/products";

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {})
    }
  });

type CartItemPayload = {
  id: string;
  qty: number;
  color?: string;
  size?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return json({ error: "Missing MERCADOPAGO_ACCESS_TOKEN" }, { status: 500 });
  }

  let body: { items?: CartItemPayload[] } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payloadItems = Array.isArray(body.items) ? body.items : [];
  if (!payloadItems.length) {
    return json({ error: "Empty cart" }, { status: 400 });
  }

  const products = await getAllProducts();
  const byId = new Map(products.map((p) => [p.id, p]));

  const items = [];
  for (const raw of payloadItems) {
    const id = (raw?.id ?? "").toString();
    const qty = Number(raw?.qty ?? 0);
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    const product = byId.get(id);
    if (!product) continue;

    const color = (raw?.color ?? "").toString().trim();
    const size = (raw?.size ?? "").toString().trim();
    const descriptionParts = [];
    if (color) descriptionParts.push(`Color: ${color}`);
    if (size) descriptionParts.push(`Talle: ${size}`);

    items.push({
      id: product.id,
      title: product.name,
      description: descriptionParts.join(" · "),
      quantity: qty,
      unit_price: Number(product.price ?? 0),
      currency_id: product.currency || "ARS",
      picture_url: product.images?.[0]
        ? new URL(product.images[0], new URL(request.url).origin).toString()
        : undefined
    });
  }

  if (!items.length) {
    return json({ error: "No valid items" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const preferenceBody = {
    items,
    back_urls: {
      success: `${origin}/checkout/success`,
      failure: `${origin}/checkout/failure`,
      pending: `${origin}/checkout/pending`
    },
    auto_return: "approved"
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preferenceBody)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(
      {
        error: "Mercado Pago error",
        status: res.status,
        details: data
      },
      { status: 502 }
    );
  }

  const env = (process.env.MERCADOPAGO_ENV || "prod").toLowerCase();
  const checkoutUrl = env === "sandbox" ? data.sandbox_init_point : data.init_point;

  return json({
    id: data.id,
    checkoutUrl,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point
  });
};

