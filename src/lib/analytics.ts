import { randomUUID } from "node:crypto";
import { getDb, saveDb } from "./db";

const MAX_SESSION_ID = 80;
const MAX_EVENTS_PER_BATCH = 20;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ALLOWED_EVENT_TYPES = new Set(["pageview", "page_engagement", "section_view", "cta_click"]);
const ALLOWED_TARGET_KINDS = new Set(["link", "button", "external", "nav"]);

const cleanText = (value: unknown, max = 120) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

const toToken = (value: unknown, max = 120) =>
  cleanText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9/_:.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^[-./:]+|[-./:]+$)/g, "");

const normalizeSessionId = (value: unknown) => {
  const sessionId = cleanText(value, MAX_SESSION_ID);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(sessionId)) return "";
  return sessionId;
};

const normalizePath = (value: unknown, { allowBlank = false } = {}) => {
  const raw = cleanText(value, 240);
  if (!raw) return allowBlank ? "" : "/";
  try {
    const url = raw.startsWith("/") ? new URL(raw, "https://fortunato.local") : new URL(raw);
    const path = `${url.pathname || "/"}`.replace(/\/{2,}/g, "/");
    if (!path.startsWith("/")) return allowBlank ? "" : "/";
    return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
  } catch {
    if (!raw.startsWith("/")) return allowBlank ? "" : "/";
    return raw.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  }
};

const normalizeSectionKey = (value: unknown) => toToken(value, 80);
const normalizeTargetKey = (value: unknown) => {
  const token = toToken(value, 160);
  return token.slice(0, 160);
};

const normalizePositiveInt = (value: unknown, max: number) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(Math.round(next), max));
};

type AnalyticsEventInput = {
  type?: unknown;
  path?: unknown;
  referrerPath?: unknown;
  sectionKey?: unknown;
  targetKind?: unknown;
  targetKey?: unknown;
  dwellMs?: unknown;
  scrollDepth?: unknown;
};

type StoredAnalyticsEvent = {
  id: string;
  createdAt: number;
  sessionId: string;
  eventType: string;
  path: string;
  referrerPath: string;
  sectionKey: string;
  targetKind: string;
  targetKey: string;
  dwellMs: number;
  scrollDepth: number;
};

const normalizeEvent = (sessionId: string, input: AnalyticsEventInput, createdAt: number): StoredAnalyticsEvent | null => {
  const eventType = cleanText(input?.type, 32).toLowerCase();
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return null;

  const path = normalizePath(input?.path);
  const referrerPath = normalizePath(input?.referrerPath, { allowBlank: true });
  const sectionKey = normalizeSectionKey(input?.sectionKey);
  const targetKind = cleanText(input?.targetKind, 24).toLowerCase();
  const targetKey = normalizeTargetKey(input?.targetKey);
  const dwellMs = normalizePositiveInt(input?.dwellMs, 30 * 60 * 1000);
  const scrollDepth = normalizePositiveInt(input?.scrollDepth, 100);

  if (eventType === "cta_click") {
    if (!ALLOWED_TARGET_KINDS.has(targetKind) || !targetKey) return null;
  }
  if (eventType === "section_view" && !sectionKey) return null;
  if (eventType === "page_engagement" && !dwellMs) return null;

  return {
    id: randomUUID(),
    createdAt,
    sessionId,
    eventType,
    path,
    referrerPath: referrerPath === path ? "" : referrerPath,
    sectionKey,
    targetKind: ALLOWED_TARGET_KINDS.has(targetKind) ? targetKind : "",
    targetKey,
    dwellMs,
    scrollDepth
  };
};

const readEventsSince = async (since: number) => {
  const { db } = await getDb();
  const stmt = db.prepare(`
    SELECT createdAt, sessionId, eventType, path, referrerPath, sectionKey, targetKind, targetKey, dwellMs, scrollDepth
    FROM analytics_events
    WHERE createdAt >= ?
    ORDER BY createdAt DESC;
  `);
  stmt.bind([since]);
  const rows: Array<Record<string, unknown>> = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
};

export const isSameOriginCollectionRequest = (request: Request) => {
  const requestUrl = new URL(request.url);
  const expectedOrigin = requestUrl.origin;
  const candidates = [request.headers.get("origin"), request.headers.get("referer")].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.origin !== expectedOrigin) return false;
    } catch {
      return false;
    }
  }
  return true;
};

export const recordAnalyticsBatch = async ({
  sessionId,
  events
}: {
  sessionId: unknown;
  events: AnalyticsEventInput[];
}) => {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) return { accepted: 0 };
  if (!Array.isArray(events) || !events.length) return { accepted: 0 };

  const createdAt = Date.now();
  const normalized = events
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map((event) => normalizeEvent(normalizedSessionId, event, createdAt))
    .filter(Boolean) as StoredAnalyticsEvent[];

  if (!normalized.length) return { accepted: 0 };

  const { db } = await getDb();
  db.run("DELETE FROM analytics_events WHERE createdAt < ?;", [createdAt - RETENTION_MS]);

  const stmt = db.prepare(`
    INSERT INTO analytics_events
    (id, createdAt, sessionId, eventType, path, referrerPath, sectionKey, targetKind, targetKey, dwellMs, scrollDepth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  db.run("BEGIN;");
  try {
    for (const event of normalized) {
      stmt.run([
        event.id,
        event.createdAt,
        event.sessionId,
        event.eventType,
        event.path,
        event.referrerPath,
        event.sectionKey,
        event.targetKind,
        event.targetKey,
        event.dwellMs,
        event.scrollDepth
      ]);
    }
    db.run("COMMIT;");
  } catch (error) {
    db.run("ROLLBACK;");
    throw error;
  } finally {
    stmt.free();
  }

  await saveDb();
  return { accepted: normalized.length };
};

export const getAnalyticsDashboard = async ({ days = 7 }: { days?: number } = {}) => {
  const safeDays = Math.max(1, Math.min(Math.round(days || 7), 30));
  const since = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const rows = await readEventsSince(since);

  const pageviews = rows.filter((row) => row.eventType === "pageview");
  const engagements = rows.filter((row) => row.eventType === "page_engagement");
  const sectionViews = rows.filter((row) => row.eventType === "section_view");
  const clicks = rows.filter((row) => row.eventType === "cta_click");

  const uniqueSessions = new Set(rows.map((row) => String(row.sessionId || ""))).size;
  const avgDwellMs = engagements.length
    ? Math.round(engagements.reduce((sum, row) => sum + Number(row.dwellMs || 0), 0) / engagements.length)
    : 0;
  const avgScrollDepth = engagements.length
    ? Math.round(engagements.reduce((sum, row) => sum + Number(row.scrollDepth || 0), 0) / engagements.length)
    : 0;

  const pageMap = new Map<string, {
    path: string;
    pageviews: number;
    clickCount: number;
    dwellTotal: number;
    dwellCount: number;
    scrollTotal: number;
    scrollCount: number;
    sessions: Set<string>;
  }>();
  for (const row of rows) {
    const path = normalizePath(row.path);
    const sessionId = String(row.sessionId || "");
    const current = pageMap.get(path) || {
      path,
      pageviews: 0,
      clickCount: 0,
      dwellTotal: 0,
      dwellCount: 0,
      scrollTotal: 0,
      scrollCount: 0,
      sessions: new Set<string>()
    };
    current.sessions.add(sessionId);
    if (row.eventType === "pageview") current.pageviews += 1;
    if (row.eventType === "cta_click") current.clickCount += 1;
    if (row.eventType === "page_engagement") {
      current.dwellTotal += Number(row.dwellMs || 0);
      current.dwellCount += 1;
      current.scrollTotal += Number(row.scrollDepth || 0);
      current.scrollCount += 1;
    }
    pageMap.set(path, current);
  }

  const topPages = Array.from(pageMap.values())
    .map((entry) => ({
      path: entry.path,
      pageviews: entry.pageviews,
      uniqueSessions: entry.sessions.size,
      clickCount: entry.clickCount,
      avgDwellMs: entry.dwellCount ? Math.round(entry.dwellTotal / entry.dwellCount) : 0,
      avgScrollDepth: entry.scrollCount ? Math.round(entry.scrollTotal / entry.scrollCount) : 0
    }))
    .sort((left, right) => right.pageviews - left.pageviews || right.uniqueSessions - left.uniqueSessions)
    .slice(0, 12);

  const sectionMap = new Map<string, { sectionKey: string; views: number; sessions: Set<string> }>();
  for (const row of sectionViews) {
    const sectionKey = normalizeSectionKey(row.sectionKey);
    if (!sectionKey) continue;
    const current = sectionMap.get(sectionKey) || {
      sectionKey,
      views: 0,
      sessions: new Set<string>()
    };
    current.views += 1;
    current.sessions.add(String(row.sessionId || ""));
    sectionMap.set(sectionKey, current);
  }
  const topSections = Array.from(sectionMap.values())
    .map((entry) => ({
      sectionKey: entry.sectionKey,
      views: entry.views,
      uniqueSessions: entry.sessions.size
    }))
    .sort((left, right) => right.views - left.views || right.uniqueSessions - left.uniqueSessions)
    .slice(0, 12);

  const clickMap = new Map<string, { targetKind: string; targetKey: string; clicks: number; sessions: Set<string>; path: string }>();
  for (const row of clicks) {
    const targetKind = cleanText(row.targetKind, 24).toLowerCase();
    const targetKey = normalizeTargetKey(row.targetKey);
    const path = normalizePath(row.path);
    if (!targetKind || !targetKey) continue;
    const key = `${targetKind}:${targetKey}`;
    const current = clickMap.get(key) || {
      targetKind,
      targetKey,
      clicks: 0,
      sessions: new Set<string>(),
      path
    };
    current.clicks += 1;
    current.sessions.add(String(row.sessionId || ""));
    clickMap.set(key, current);
  }
  const topClicks = Array.from(clickMap.values())
    .map((entry) => ({
      targetKind: entry.targetKind,
      targetKey: entry.targetKey,
      clicks: entry.clicks,
      uniqueSessions: entry.sessions.size,
      path: entry.path
    }))
    .sort((left, right) => right.clicks - left.clicks || right.uniqueSessions - left.uniqueSessions)
    .slice(0, 15);

  const dayMap = new Map<string, { date: string; pageviews: number; clicks: number; sessions: Set<string> }>();
  for (const row of rows) {
    const date = new Date(Number(row.createdAt || 0)).toISOString().slice(0, 10);
    const current = dayMap.get(date) || { date, pageviews: 0, clicks: 0, sessions: new Set<string>() };
    current.sessions.add(String(row.sessionId || ""));
    if (row.eventType === "pageview") current.pageviews += 1;
    if (row.eventType === "cta_click") current.clicks += 1;
    dayMap.set(date, current);
  }
  const daily = Array.from(dayMap.values())
    .map((entry) => ({
      date: entry.date,
      pageviews: entry.pageviews,
      clicks: entry.clicks,
      uniqueSessions: entry.sessions.size
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const recentClicks = clicks
    .slice(0, 20)
    .map((row) => ({
      createdAt: Number(row.createdAt || 0),
      path: normalizePath(row.path),
      targetKind: cleanText(row.targetKind, 24).toLowerCase(),
      targetKey: normalizeTargetKey(row.targetKey),
      sectionKey: normalizeSectionKey(row.sectionKey)
    }));

  return {
    days: safeDays,
    summary: {
      pageviews: pageviews.length,
      uniqueSessions,
      clickCount: clicks.length,
      avgDwellMs,
      avgScrollDepth
    },
    topPages,
    topSections,
    topClicks,
    daily,
    recentClicks
  };
};
