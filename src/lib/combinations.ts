import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllProducts } from "./products";

const combinationsPath = join(process.cwd(), "data", "combinations.json");

const toArray = (value) => (Array.isArray(value) ? value : []);
const isPresent = (value) => value !== null && value !== undefined;
const cleanText = (value) => String(value ?? "").trim();

const readCombinationSeed = () => {
  try {
    const raw = readFileSync(combinationsPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getSeedItems = (combo) => {
  if (Array.isArray(combo?.items) && combo.items.length) {
    return combo.items
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const productId = cleanText(entry.productId ?? entry.id);
        if (!productId) return null;
        return {
          productId,
          color: cleanText(entry.color)
        };
      })
      .filter(isPresent);
  }

  return toArray(combo?.productIds)
    .map((value) => cleanText(value))
    .filter(Boolean)
    .map((productId) => ({ productId, color: "" }));
};

const resolveCombinations = async () => {
  const products = await getAllProducts();
  const productById = new Map(products.map((product) => [product.id, product]));
  const seed = readCombinationSeed();

  return seed
    .map((combo) => {
      const seedItems = getSeedItems(combo);
      const items = seedItems
        .map((entry) => {
          const product = productById.get(entry.productId);
          if (!product) return null;
          return {
            id: product.id,
            productId: product.id,
            slug: product.slug,
            name: product.name,
            price: Number(product.price || 0),
            currency: product.currency || "ARS",
            image: product.gridImage || product.images?.[0] || "/placeholder.svg",
            microcopy: String(product.microcopy || ""),
            materials: toArray(product.materials).map((value) => String(value)),
            color: entry.color,
            sizes: toArray(product.sizes).map((value) => String(value))
          };
        })
        .filter(isPresent);

      if (!items.length) return null;

      const regularPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const fallbackBundlePrice = regularPrice;
      const bundlePrice = Number(combo?.bundlePrice || 0) || fallbackBundlePrice;
      const savingsAmount = Math.max(regularPrice - bundlePrice, 0);
      const savingsPercent = regularPrice > 0 && savingsAmount > 0
        ? Math.round((savingsAmount / regularPrice) * 100)
        : 0;

      return {
        id: String(combo?.id || ""),
        slug: String(combo?.slug || combo?.id || ""),
        title: String(combo?.title || "Set Fortunato"),
        notes: String(combo?.notes || ""),
        currency: String(combo?.currency || items[0]?.currency || "ARS"),
        image: String(combo?.image || items[0]?.image || "/placeholder.svg"),
        bundlePrice,
        regularPrice,
        savingsAmount,
        savingsPercent,
        items
      };
    })
    .filter(isPresent);
};

export const getAllCombinations = async () => {
  return resolveCombinations();
};

export const getCombinationBySlug = async (slug: string | undefined) => {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return null;
  const combinations = await resolveCombinations();
  return combinations.find((combo) => String(combo.slug || "").trim().toLowerCase() === key) || null;
};
