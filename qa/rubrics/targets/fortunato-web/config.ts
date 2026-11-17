import type { TargetConfig } from "../../rubrics/types.ts";

export const fortunatoConfig = {
  name: "fortunato-web",
  baseUrl: process.env.TARGET_URL ?? "http://localhost:4321",
  adminRoutes: ["/admin", "/admin/products", "/admin/analytics"],
  apiRoutes: {
    cartQuote: "/api/cart/quote",
    adminProducts: "/api/admin/products",
    adminLogin: "/api/admin/login",
    mpPreference: "/api/mercadopago/preference",
    analyticsCollect: "/api/analytics/collect",
  },
  validCategories: ["top", "bottom", "calzado"],
  requiredProductFields: ["id", "slug", "name", "category", "price", "currency", "description", "images", "sizes", "colors"],
  minPriceVsCategoryMedian: 0.25,
  internalMarkers: ["prueba", "test", "interno", "internal", "placeholder"],
  thresholds: {
    productAlignment: 0.9,
    adminAccessControl: 1.0,
    shoppingScenarios: 0.8,
  },
} satisfies TargetConfig & Record<string, unknown>;
