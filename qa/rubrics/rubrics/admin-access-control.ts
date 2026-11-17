import type { Rubric, RubricResult, RunContext } from "./types.ts";
import { finalize } from "./scoring.ts";
import { evaluate } from "../evaluators/deterministic.ts";
import { apiGet, apiPost } from "../runners/api-runner.ts";
import { fortunatoConfig } from "../targets/fortunato-web/config.ts";

const criteria = [
  {
    id: "admin-login-page-safe",
    description: "GET /admin without auth returns 200 with login form — not admin panel content",
    weight: 0.25,
    evaluationType: "deterministic" as const,
  },
  {
    id: "admin-products-redirect",
    description: "GET /admin/products without auth returns 302 redirect or 401 — never 200",
    weight: 0.2,
    evaluationType: "deterministic" as const,
  },
  {
    id: "admin-analytics-redirect",
    description: "GET /admin/analytics without auth returns 302 redirect or 401 — never 200",
    weight: 0.2,
    evaluationType: "deterministic" as const,
  },
  {
    id: "api-admin-products-unauthorized",
    description: "GET /api/admin/products without session cookie returns 401 or 403",
    weight: 0.2,
    evaluationType: "deterministic" as const,
  },
  {
    id: "api-admin-forged-cookie",
    description: "GET /api/admin/products with a forged/empty session cookie returns 401 or 403",
    weight: 0.15,
    evaluationType: "deterministic" as const,
  },
];

const THRESHOLD = fortunatoConfig.thresholds.adminAccessControl;
const PROTECTED_STATUSES = new Set([301, 302, 303, 307, 308, 401, 403]);

export const adminAccessControlRubric: Rubric = {
  id: "admin-access-control",
  name: "Admin Access Control",
  description:
    "Security rubric: verifies all admin routes and API endpoints reject unauthenticated requests. A score below 1.0 signals an access control vulnerability.",
  criteria,
  async run(ctx: RunContext): Promise<RubricResult> {
    const start = Date.now();
    const base = ctx.baseUrl;

    const [adminRoot, adminProducts, adminAnalytics, apiProducts, apiForged] = await Promise.all([
      apiGet(`${base}/admin`),
      apiGet(`${base}/admin/products`),
      apiGet(`${base}/admin/analytics`),
      apiGet(`${base}${fortunatoConfig.apiRoutes.adminProducts}`),
      apiGet(`${base}${fortunatoConfig.apiRoutes.adminProducts}`, {
        cookies: "session=forged-token-attempt; Path=/",
      }),
    ]);

    const criteriaResults = [
      evaluate(criteria[0], () => {
        // /admin is the login page — 200 is correct when unauthenticated.
        // Validate: status is 200 AND body has login form, NOT admin panel content.
        const body = String(adminRoot.body ?? "").toLowerCase();
        const hasLoginForm =
          body.includes('type="password"') || body.includes("type='password'") || body.includes("admin-login");
        const hasAdminPanel =
          body.includes("admin-products") || body.includes("data-delete") || body.includes("/api/admin/products");
        const isLoginPage = adminRoot.status === 200 && hasLoginForm && !hasAdminPanel;
        const isRedirectToLogin = PROTECTED_STATUSES.has(adminRoot.status);
        const passed = isLoginPage || isRedirectToLogin;
        return {
          passed,
          details: passed
            ? `GET /admin returned ${adminRoot.status} with login form (safe — no admin panel content exposed).`
            : `GET /admin returned ${adminRoot.status} — body does not look like a login form or shows admin content.`,
          evidence: { status: adminRoot.status, hasLoginForm, hasAdminPanel },
        };
      }),

      evaluate(criteria[1], () => ({
        passed: PROTECTED_STATUSES.has(adminProducts.status),
        details: `GET /admin/products returned ${adminProducts.status}.`,
        evidence: { status: adminProducts.status },
      })),

      evaluate(criteria[2], () => ({
        passed: PROTECTED_STATUSES.has(adminAnalytics.status),
        details: `GET /admin/analytics returned ${adminAnalytics.status}.`,
        evidence: { status: adminAnalytics.status },
      })),

      evaluate(criteria[3], () => ({
        passed: apiProducts.status === 401 || apiProducts.status === 403,
        details: `GET /api/admin/products (no cookie) returned ${apiProducts.status}. Expected 401 or 403.`,
        evidence: { status: apiProducts.status, body: apiProducts.body },
      })),

      evaluate(criteria[4], () => ({
        passed: apiForged.status === 401 || apiForged.status === 403,
        details: `GET /api/admin/products (forged cookie) returned ${apiForged.status}. Expected 401 or 403.`,
        evidence: { status: apiForged.status, body: apiForged.body },
      })),
    ];

    return finalize(
      { rubricId: "admin-access-control", rubricName: "Admin Access Control", threshold: THRESHOLD, start },
      criteria,
      criteriaResults
    );
  },
};
