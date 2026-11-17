export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

export async function apiGet(
  url: string,
  options: { cookies?: string; headers?: Record<string, string> } = {}
): Promise<ApiResponse> {
  const start = Date.now();
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      ...(options.cookies ? { Cookie: options.cookies } : {}),
      ...(options.headers ?? {}),
    },
  });

  let body: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else if (contentType.includes("text/")) {
    body = await res.text().catch(() => null);
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body,
    durationMs: Date.now() - start,
  };
}

export async function apiPost(
  url: string,
  payload: unknown,
  options: { cookies?: string } = {}
): Promise<ApiResponse> {
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(options.cookies ? { Cookie: options.cookies } : {}),
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await res.json().catch(() => null);
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body,
    durationMs: Date.now() - start,
  };
}
