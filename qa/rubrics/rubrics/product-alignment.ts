import type { Rubric, RunContext } from "./types.ts";
import { evaluateAll } from "../evaluators/deterministic.ts";
import { finalize } from "./scoring.ts";
import { loadCatalog, type Product } from "../targets/catalog.ts";

const SAFE_IMAGE = /^(\/(?!\/)|https:\/\/)/i;
const MIN_DESCRIPTION_LENGTH = 50;
const THRESHOLD = 0.9;

const criteria = [
  { id: "required-fields", description: "Every product has all required fields", weight: 0.2, evaluationType: "deterministic" as const },
  { id: "unique-ids", description: "No two products share an id or a slug", weight: 0.1, evaluationType: "deterministic" as const, critical: true },
  { id: "valid-category", description: "Category is one of the store's declared categories", weight: 0.1, evaluationType: "deterministic" as const },
  { id: "positive-price", description: "Price is a positive finite number", weight: 0.1, evaluationType: "deterministic" as const, critical: true },
  { id: "price-plausible", description: "Price is not far below its category median (test SKUs, missing zeros)", weight: 0.1, evaluationType: "deterministic" as const },
  { id: "discount-consistent", description: "compareAt is empty or higher than price (a 'discount' never raises the price)", weight: 0.1, evaluationType: "deterministic" as const, critical: true },
  { id: "no-internal-skus", description: "No internal, test or placeholder product is exposed", weight: 0.1, evaluationType: "deterministic" as const, critical: true },
  { id: "variants-defined", description: "Sizes and colors are non-empty lists with no duplicates", weight: 0.1, evaluationType: "deterministic" as const },
  { id: "valid-images", description: "At least one image, every URL is site-relative or https://", weight: 0.05, evaluationType: "deterministic" as const },
  { id: "description-length", description: `Description has at least ${MIN_DESCRIPTION_LENGTH} characters`, weight: 0.05, evaluationType: "deterministic" as const },
];

const ok = { passed: true, reason: "" };
const fail = (reason: string) => ({ passed: false, reason });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const productAlignmentRubric: Rubric = {
  id: "product-alignment",
  name: "Product Catalog Alignment",
  description: "Schema, consistency and data-quality checks over the whole catalog.",
  criteria,
  async run(ctx: RunContext) {
    const start = Date.now();
    const { products, source } = await loadCatalog(ctx);
    const t = ctx.target;
    const categories = new Set(t.validCategories);
    const p = (x: unknown) => x as Product;

    const seenIds = new Map<string, number>();
    const seenSlugs = new Map<string, number>();
    for (const x of products) {
      seenIds.set(String(x.id), (seenIds.get(String(x.id)) ?? 0) + 1);
      seenSlugs.set(String(x.slug), (seenSlugs.get(String(x.slug)) ?? 0) + 1);
    }

    const medianByCategory = new Map<string, number>();
    for (const c of categories) {
      const prices = products.filter((x) => x.category === c && Number(x.price) > 0).map((x) => Number(x.price));
      if (prices.length >= 2) medianByCategory.set(c, median(prices));
    }

    const results = [
      evaluateAll(products, criteria[0], (x) => {
        const missing = t.requiredProductFields.filter((f) => {
          const v = p(x)[f];
          return v === undefined || v === null || v === "";
        });
        return missing.length ? fail(`${p(x).id ?? "?"}: missing ${missing.join(", ")}`) : ok;
      }),
      evaluateAll(products, criteria[1], (x) => {
        const dupId = (seenIds.get(String(p(x).id)) ?? 0) > 1;
        const dupSlug = (seenSlugs.get(String(p(x).slug)) ?? 0) > 1;
        return dupId || dupSlug ? fail(`${p(x).id}: duplicated ${[dupId && "id", dupSlug && "slug"].filter(Boolean).join(" and ")}`) : ok;
      }),
      evaluateAll(products, criteria[2], (x) =>
        categories.has(p(x).category) ? ok : fail(`${p(x).id}: invalid category "${p(x).category}"`)
      ),
      evaluateAll(products, criteria[3], (x) => {
        const price = Number(p(x).price);
        return Number.isFinite(price) && price > 0 ? ok : fail(`${p(x).id}: invalid price "${p(x).price}"`);
      }),
      evaluateAll(products, criteria[4], (x) => {
        const m = medianByCategory.get(p(x).category);
        const price = Number(p(x).price);
        if (!m || !(price > 0)) return ok; // nothing to compare against; other criteria cover it
        return price >= m * t.minPriceVsCategoryMedian
          ? ok
          : fail(`${p(x).id}: ${price} is ${((price / m) * 100).toFixed(1)}% of the ${p(x).category} median (${m})`);
      }),
      evaluateAll(products, criteria[5], (x) => {
        const c = p(x).compareAt;
        if (c === undefined || c === null) return ok;
        return Number(c) > Number(p(x).price) ? ok : fail(`${p(x).id}: compareAt ${c} is not above price ${p(x).price}`);
      }),
      evaluateAll(products, criteria[6], (x) => {
        const text = `${p(x).id} ${p(x).slug} ${p(x).name} ${p(x).badge ?? ""}`.toLowerCase();
        const hit = t.internalMarkers.find((m) => new RegExp(`\\b${m}\\b`).test(text));
        return hit ? fail(`${p(x).id}: looks internal ("${hit}")`) : ok;
      }),
      evaluateAll(products, criteria[7], (x) => {
        const bad = (["sizes", "colors"] as const).filter((k) => {
          const v = p(x)[k];
          return !Array.isArray(v) || v.length === 0 || new Set(v).size !== v.length;
        });
        return bad.length ? fail(`${p(x).id}: empty or duplicated ${bad.join(", ")}`) : ok;
      }),
      evaluateAll(products, criteria[8], (x) => {
        const images = Array.isArray(p(x).images) ? p(x).images : [];
        const bad = images.filter((img) => !SAFE_IMAGE.test(img));
        if (images.length === 0) return fail(`${p(x).id}: no images`);
        return bad.length ? fail(`${p(x).id}: unsafe image URLs: ${bad.join(", ")}`) : ok;
      }),
      evaluateAll(products, criteria[9], (x) => {
        const len = String(p(x).description ?? "").length;
        return len >= MIN_DESCRIPTION_LENGTH ? ok : fail(`${p(x).id}: description too short (${len} chars)`);
      }),
    ];
    results[0].details += ` Source: ${source} (${products.length} products).`;

    return finalize({ rubricId: "product-alignment", rubricName: "Product Catalog Alignment", threshold: THRESHOLD, start }, criteria, results);
  },
};
