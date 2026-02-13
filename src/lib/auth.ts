import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";

const getSecret = () => process.env.SESSION_SECRET || "dev-secret";
const COOKIE_NAME = "admin_session";

const base64Url = (input) =>
  Buffer.from(input, "utf-8").toString("base64url");

const sign = (value) => {
  const hmac = createHmac("sha256", getSecret()).update(value).digest("base64url");
  return `${value}.${hmac}`;
};

const verify = (token) => {
  const [value, signature] = token.split(".");
  if (!value || !signature) return null;
  const expected = createHmac("sha256", getSecret()).update(value).digest("base64url");
  if (expected !== signature) return null;
  return value;
};

export const verifyCredentials = async (username, password) => {
  const envUser = (process.env.ADMIN_USER || "").trim();
  const envPass = (process.env.ADMIN_PASSWORD || "").trim();
  const envHash = process.env.ADMIN_PASSWORD_HASH || "";

  const user = (username || "").trim();
  const pass = (password || "").trim();

  if (envUser && user !== envUser) return false;

  // Dev fallback if env vars are missing
  if (!import.meta.env.PROD && !envUser && user === "sofihermosa" && pass === "sofihermosa") {
    return true;
  }

  // Always allow plain password match (useful for dev and recovery)
  if (envPass && pass === envPass) return true;

  if (envHash) {
    return bcrypt.compare(pass, envHash);
  }

  return false;
};

export const createSession = (username) => {
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
