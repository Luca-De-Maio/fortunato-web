import { createHmac, timingSafeEqual } from "node:crypto";

const cleanText = (value: unknown, max = 240) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

const readServerEnv = (key: string, max = 400) => {
  const runtimeValue = typeof process !== "undefined" ? process.env?.[key] : "";
  if (runtimeValue) return cleanText(runtimeValue, max);
  return cleanText(import.meta.env?.[key], max);
};

const parseSignatureHeader = (value: string) => {
  const parsed = new Map<string, string>();
  for (const part of String(value || "").split(",")) {
    const [key, ...rest] = part.split("=");
    if (!key || !rest.length) continue;
    parsed.set(key.trim().toLowerCase(), rest.join("=").trim());
  }
  return {
    ts: parsed.get("ts") || "",
    v1: parsed.get("v1") || ""
  };
};

export const getMercadoPagoAccessToken = () => {
  const token = readServerEnv("MERCADOPAGO_ACCESS_TOKEN", 400);
  if (!token) {
    throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN");
  }
  return token;
};

export const getMercadoPagoWebhookSecret = () => {
  const secret = readServerEnv("MERCADOPAGO_WEBHOOK_SECRET", 400);
  if (!secret) {
    throw new Error("Missing MERCADOPAGO_WEBHOOK_SECRET");
  }
  return secret;
};

export const getMercadoPagoMode = () => {
  const mode = readServerEnv("MERCADOPAGO_ENV", 20).toLowerCase();
  return mode === "sandbox" ? "sandbox" : "prod";
};

export const getPublicSiteUrl = () => {
  const env = readServerEnv("PUBLIC_SITE_URL", 240) || readServerEnv("SITE_URL", 240);
  return env ? env.replace(/\/+$/, "") : "";
};

export const fetchMercadoPagoPayment = async (paymentId: string) => {
  const token = getMercadoPagoAccessToken();
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!paymentRes.ok) {
    const text = await paymentRes.text().catch(() => "");
    throw new Error(text || "Mercado Pago payment lookup failed");
  }

  return paymentRes.json().catch(() => ({} as any));
};

export const validateMercadoPagoWebhookSignature = (request: Request) => {
  const secret = getMercadoPagoWebhookSecret();
  const url = new URL(request.url);
  const dataId = cleanText(url.searchParams.get("data.id") || url.searchParams.get("id"), 120).toLowerCase();
  const requestId = cleanText(request.headers.get("x-request-id"), 240);
  const signature = parseSignatureHeader(request.headers.get("x-signature") || "");

  if (!dataId || !requestId || !signature.ts || !signature.v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  if (expected.length !== signature.v1.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature.v1, "utf8")
  );
};
