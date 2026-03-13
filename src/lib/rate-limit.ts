const buckets = new Map<
  string,
  {
    count: number;
    resetAt: number;
  }
>();

const cleanupExpiredBuckets = (now: number) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

export const getRequestIdentifier = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const fromForwarded = forwarded.split(",")[0]?.trim() || "";
  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  return fromForwarded || realIp || "unknown";
};

export const consumeRateLimit = ({
  namespace,
  key,
  limit,
  windowMs
}: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}) => {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const bucketKey = `${namespace}:${key}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);
  return { allowed: true, retryAfterSeconds: 0 };
};
