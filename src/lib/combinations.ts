import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllProducts } from "./products";

const combinationsPath = join(process.cwd(), "data", "combinations.json");

const toArray = (value) => (Array.isArray(value) ? value : []);
const isPresent = (value) => value !== null && value !== undefined;

const readCombinationSeed = () => {
  try {
    const raw = readFileSync(combinationsPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getAllCombinations = async () => {
  const products = await getAllProducts();
  const productById = new Map(products.map((product) => [product.id, product]));
  const seed = readCombinationSeed();

  return seed
    .map((combo) => {
      const productIds = toArray(combo?.productIds).map((value) => String(value));
      const items = productIds
        .map((id) => productById.get(id))
        .filter(isPresent)
        .map((product) => ({
          id: product.id,
          slug: product.slug,
          name: product.name,
          price: Number(product.price || 0),
          currency: product.currency || "ARS",
          image: product.gridImage || product.images?.[0] || "/placeholder.svg"
        }));

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
