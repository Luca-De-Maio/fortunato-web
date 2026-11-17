import type { TargetConfig } from "../../rubrics/types.ts";

/** A made-up home & kitchen store with defects seeded on purpose (see expected-defects.json). */
export const syntheticStoreConfig: TargetConfig = {
  name: "synthetic-store",
  validCategories: ["cookware", "tableware", "textiles", "storage"],
  requiredProductFields: ["id", "slug", "name", "category", "price", "currency", "description", "images", "sizes", "colors"],
  minPriceVsCategoryMedian: 0.25,
  internalMarkers: ["prueba", "test", "interno", "internal", "placeholder"],
};
