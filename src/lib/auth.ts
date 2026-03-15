import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";

const getSecret = () => {
  const configured = (process.env.SESSION_SECRET || "").trim();
  if (configured) return configured;
  return import.meta.env.PROD ? null : "dev-secret";
};
const allowDevAdminFallback = () =>
  !import.meta.env.PROD && /^(1|true|yes)$/i.test((process.env.ALLOW_DEV_ADMIN_FALLBACK || "").trim());
const COOKIE_NAME = "admin_session";

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "utf-8");
  const rightBuffer = Buffer.from(String(right || ""), "utf-8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const sign = (value) => {
  const secret = getSecret();
  if (!secret) return null;
  const hmac = createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${hmac}`;
};

const verify = (token) => {
  const secret = getSecret();
  if (!secret) return null;
  const [value, signature] = token.split(".");
  if (!value || !signature) return null;
  const expected = createHmac("sha256", secret).update(value).digest("base64url");
  if (!safeEqual(expected, signature)) return null;
  return value;
};

export const hasSessionSecret = () => Boolean(getSecret());

export const verifyCredentials = async (username, password) => {
  const envUser = (process.env.ADMIN_USER || "").trim();
  const envPass = (process.env.ADMIN_PASSWORD || "").trim();
  const envHash = process.env.ADMIN_PASSWORD_HASH || "";

  const user = (username || "").trim();
  const pass = (password || "").trim();

  if (envUser && !safeEqual(user, envUser)) return false;

  // Explicit opt-in fallback for local-only recovery.
  if (allowDevAdminFallback() && !envUser && user === "sofihermosa" && pass === "sofihermosa") {
    return true;
  }

  // Always allow plain password match (useful for dev and recovery)
  if (envPass && safeEqual(pass, envPass)) return true;

  if (envHash) {
    return bcrypt.compare(pass, envHash);
  }

  return false;
};

export const createSession = (username) => {
  if (!hasSessionSecret()) {
    throw new Error("Missing SESSION_SECRET");
  }
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `${username}:${expires}`;
  return sign(payload);
};

export const getSession = (cookies) => {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const value = verify(token);
  if (!value) return null;
  const [user, exp] = value.split(":");
  if (!user || !exp) return null;
  if (Date.now() > Number(exp)) return null;
  return { user };
};

export const clearSession = (cookies) => {
  cookies.set(COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 0
  });
};

export const setSession = (cookies, token) => {
  cookies.set(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 7
  });
};

export const requireAdmin = (cookies) => Boolean(getSession(cookies));
