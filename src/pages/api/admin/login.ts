import type { APIRoute } from "astro";
import { createSession, setSession, verifyCredentials } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  if (!body) return new Response("Invalid request", { status: 400 });

  const { username, password } = body;
  const ok = await verifyCredentials(username, password);
  if (!ok) {
    if (!import.meta.env.PROD) {
      const envUser = (process.env.ADMIN_USER || "").trim();
      const envPass = (process.env.ADMIN_PASSWORD || "").trim();
      const envHash = process.env.ADMIN_PASSWORD_HASH || "";
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "invalid_credentials",
          envUserSet: Boolean(envUser),
          envPassSet: Boolean(envPass),
          envHashSet: Boolean(envHash)
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("Unauthorized", { status: 401 });
  }

  const token = createSession(username);
  setSession(cookies, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
