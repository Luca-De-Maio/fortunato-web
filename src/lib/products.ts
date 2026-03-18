import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, saveDb } from "./db";

const jsonPath = join(process.cwd(), "data", "products.json");
const MAX_TEXT = 160;
const MAX_LONG_TEXT = 4000;
const MAX_URL = 2048;
const MAX_MONEY = 999999999;
const SAFE_IMAGE_SRC = /^(\/(?!\/)|https?:\/\/)/i;
const VALID_CATEGORIES = new Set(["top", "bottom", "calzado"]);
const PLACEHOLDER_STOCK_PER_VARIANT = 4;

export class ProductValidationError extends Error {}

const parseJson = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const serialize = (value) => JSON.stringify(value ?? []);
const normalizeImageKey = (value) => String(value || "").trim().toLowerCase();
const cleanText = (value, max = MAX_TEXT) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
const normalizeList = (value, maxItems = 12, maxLength = MAX_TEXT) =>
  Array.isArray(value)
    ? value
        .map((item) => cleanText(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
const normalizeCardVariant = (value) => String(value ?? "").trim().toLowerCase() === "double" ? "double" : "standard";
const isGridVariant = (value) => /-grid\.[a-z0-9]+$/i.test(String(value || "").trim());
const toSlug = (value) =>
  cleanText(value, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
const normalizeCurrency = (value) => {
  const currency = cleanText(value, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "ARS";
};
const normalizeAmount = (value, { allowNull = false } = {}) => {
  if (allowNull && (value === null || value === undefined || value === "")) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return allowNull ? null : 0;
  }
  return Math.max(0, Math.min(MAX_MONEY, Math.round(amount)));
};
const normalizeMeasure = (value, max = 999) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.min(max, Math.round(amount)));
};
const normalizeImageSrc = (value) => {
  const src = cleanText(value, MAX_URL);
  if (!src) return "";
  return SAFE_IMAGE_SRC.test(src) ? src : "";
};
const normalizeCategory = (value) => {
  const category = cleanText(value, 24).toLowerCase();
  return VALID_CATEGORIES.has(category) ? category : "top";
};
const normalizeCombinations = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const title = cleanText(entry.title, 80);
      const image = normalizeImageSrc(entry.image);
      const items = normalizeList(entry.items, 10, 40);
      if (!title && !image && !items.length) return null;
      return { title, image, items };
    })
    .filter(Boolean);
};
const buildStockMatrix = (colors = [], sizes = []) => {
  const normalizedColors = Array.isArray(colors) && colors.length ? colors : [""];
  const normalizedSizes = Array.isArray(sizes) && sizes.length ? sizes : [""];
  const stock = [];
  for (const color of normalizedColors) {
    for (const size of normalizedSizes) {
      stock.push({
        color: cleanText(color, 40),
        size: cleanText(size, 20),
        quantity: PLACEHOLDER_STOCK_PER_VARIANT
      });
    }
  }
  return stock;
};
const normalizeStock = (value, { colors = [], sizes = [] } = {}) => {
  const colorList = Array.isArray(colors) ? colors.map((entry) => cleanText(entry, 40)) : [];
  const sizeList = Array.isArray(sizes) ? sizes.map((entry) => cleanText(entry, 20)) : [];
  const colorSet = new Set(colorList.map((entry) => entry.toLowerCase()));
  const sizeSet = new Set(sizeList.map((entry) => entry.toLowerCase()));
  if (!Array.isArray(value) || !value.length) {
    return buildStockMatrix(colorList, sizeList);
  }

  const seen = new Set();
  const out = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    let color = cleanText(entry.color, 40);
    let size = cleanText(entry.size, 20);
    if (!colorSet.size) color = "";
    if (!sizeSet.size) size = "";
    if (colorSet.size && !colorSet.has(color.toLowerCase())) continue;
    if (sizeSet.size && !sizeSet.has(size.toLowerCase())) continue;
    const key = `${color.toLowerCase()}__${size.toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      color,
      size,
      quantity: normalizeAmount(entry.quantity)
    });
  }
  return out;
};
const normalizeShippingProfile = (value, category = "") => {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    weightGrams: normalizeMeasure(input.weightGrams ?? input.weight ?? 0, 50000),
    widthCm: normalizeMeasure(input.widthCm ?? input.width ?? 0, 300),
    heightCm: normalizeMeasure(input.heightCm ?? input.height ?? 0, 300),
    depthCm: normalizeMeasure(input.depthCm ?? input.depth ?? input.length ?? 0, 300),
    carrierCategory: cleanText(input.carrierCategory ?? category, 40)
  };
};
const sanitizeProductImages = (images, gridImage = "") => {
  const list = normalizeList(images, 16, MAX_URL).map((image) => normalizeImageSrc(image)).filter(Boolean);
  const seen = new Set();
  const out = [];
  const normalizedGrid = normalizeImageKey(gridImage);
  const shouldDropExactGrid = isGridVariant(gridImage);
  for (const image of list) {
    const key = normalizeImageKey(image);
    if (!key || seen.has(key) || isGridVariant(key)) continue;
    if (shouldDropExactGrid && key === normalizedGrid) continue;
    seen.add(key);
    out.push(image);
  }
  return out;
};
const readSeedProducts = () => JSON.parse(readFileSync(jsonPath, "utf-8"));
const writeSeedProducts = (products) => {
  writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf-8");
};
const toSeedProduct = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProductValidationError("Invalid product payload.");
  }

  const name = cleanText(payload.name, 120);
  const slug = toSlug(payload.slug ?? payload.id ?? name);
  const id = toSlug(payload.id ?? slug);
  if (!name) throw new ProductValidationError("Product name is required.");
  if (!slug || !id) throw new ProductValidationError("Product id and slug are required.");

  const rawGridImage = normalizeImageSrc(payload.gridImage ?? "");
  const images = sanitizeProductImages(payload.images, rawGridImage);
  const gridImage = rawGridImage.trim() || images[0] || "";
  const colors = normalizeList(payload.colors, 12, 40);
  const sizes = normalizeList(payload.sizes, 12, 20);
  return {
    id,
    slug,
    name,
    category: normalizeCategory(payload.category ?? ""),
    price: normalizeAmount(payload.price),
    compareAt: normalizeAmount(payload.compareAt, { allowNull: true }),
    currency: normalizeCurrency(payload.currency ?? "ARS"),
    description: cleanText(payload.description, MAX_LONG_TEXT),
    materials: normalizeList(payload.materials, 12, 80),
    fit: cleanText(payload.fit, 80),
    colors,
    sizes,
    gridImage,
    images,
    stock: normalizeStock(payload.stock, { colors, sizes }),
    shippingProfile: normalizeShippingProfile(payload.shippingProfile, normalizeCategory(payload.category ?? "")),
    highlights: normalizeList(payload.highlights, 10, 120),
    combinations: normalizeCombinations(payload.combinations),
    badge: cleanText(payload.badge, 32),
    microcopy: cleanText(payload.microcopy, 120),
    cardVariant: normalizeCardVariant(payload.cardVariant)
  };
};
const normalizedImagesEqual = (left, right) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => normalizeImageKey(value) === normalizeImageKey(right[index]));
};
const hasDuplicateImages = (images) => {
  const seen = new Set();
  for (const image of Array.isArray(images) ? images : []) {
    const key = normalizeImageKey(image);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const mapRow = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  category: row.category,
  price: row.price,
  compareAt: row.compareAt ?? null,
  currency: row.currency,
  description: row.description,
  materials: parseJson(row.materials, []),
  fit: row.fit || "",
  colors: parseJson(row.colors, []),
  sizes: parseJson(row.sizes, []),
  gridImage: row.gridImage || "",
  images: sanitizeProductImages(parseJson(row.images, []), row.gridImage || ""),
  stock: normalizeStock(parseJson(row.stock, []), {
    colors: parseJson(row.colors, []),
    sizes: parseJson(row.sizes, [])
  }),
  shippingProfile: normalizeShippingProfile(parseJson(row.shippingProfile, {}), row.category),
  highlights: parseJson(row.highlights, []),
  combinations: parseJson(row.combinations, []),
  badge: row.badge || "",
  microcopy: row.microcopy || "",
  cardVariant: normalizeCardVariant(row.cardVariant)
});

const normalizeSizes = (category, raw) => {
  const sizes = Array.isArray(raw) ? raw.map((v) => String(v)) : [];
  const cat = String(category || "").toLowerCase();
  if (cat === "top" || cat === "bottom") {
    const set = new Set(sizes);
    const legacy = new Set(["S", "M", "L", "XL"]);
    if (sizes.length === 4 && Array.from(set).every((v) => legacy.has(v))) {
      return ["S/M", "L/XL"];
    }
    if (sizes.length === 2 && set.has("S/M") && set.has("L/XL")) {
      return ["S/M", "L/XL"];
    }
  }
  return sizes;
};

const INTERNAL_PRODUCT_IDS = new Set(["sku-prueba-fortunato"]);

export const isPublicProduct = (product) => {
  const id = String(product?.id || "").trim().toLowerCase();
  const slug = String(product?.slug || "").trim().toLowerCase();
  return !INTERNAL_PRODUCT_IDS.has(id) && !INTERNAL_PRODUCT_IDS.has(slug);
};

const ensureSeeded = async () => {
  const { db } = await getDb();
  const result = db.exec("SELECT COUNT(*) as count FROM products;");
  const count = result?.[0]?.values?.[0]?.[0] ?? 0;
  if (count > 0) {
    const seed = readSeedProducts();
    const seedById = new Map(seed.map((product) => [String(product.id), product]));
    const metaStmt = db.prepare("UPDATE products SET badge = ?, microcopy = ?, cardVariant = ? WHERE id = ?;");
    const sizeStmt = db.prepare("UPDATE products SET sizes = ? WHERE id = ?;");
    const gridStmt = db.prepare("UPDATE products SET gridImage = ? WHERE id = ?;");
    const imagesStmt = db.prepare("UPDATE products SET images = ? WHERE id = ?;");
    const stockStmt = db.prepare("UPDATE products SET stock = ? WHERE id = ?;");
    const shippingStmt = db.prepare("UPDATE products SET shippingProfile = ? WHERE id = ?;");
    const insertStmt = db.prepare(`
      INSERT INTO products
      (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, stock, shippingProfile, highlights, combinations, badge, microcopy, cardVariant)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const resAll = db.exec("SELECT id, slug, category, colors, sizes, gridImage, images, stock, shippingProfile, badge, microcopy, cardVariant FROM products;");
    const rows = resAll?.[0]?.values ?? [];
    const cols = resAll?.[0]?.columns ?? [];
    const idIndex = cols.indexOf("id");
    const slugIndex = cols.indexOf("slug");
    const categoryIndex = cols.indexOf("category");
    const colorsIndex = cols.indexOf("colors");
    const sizesIndex = cols.indexOf("sizes");
    const gridImageIndex = cols.indexOf("gridImage");
    const imagesIndex = cols.indexOf("images");
    const stockIndex = cols.indexOf("stock");
    const shippingProfileIndex = cols.indexOf("shippingProfile");
    const badgeIndex = cols.indexOf("badge");
    const microcopyIndex = cols.indexOf("microcopy");
    const cardVariantIndex = cols.indexOf("cardVariant");

    db.run("BEGIN;");
    try {
      const existingIds = new Set(rows.map((row) => String(row[idIndex] ?? "")));
      for (const product of seed) {
        if (existingIds.has(String(product.id))) continue;
        insertStmt.run([
          product.id,
          product.slug,
          product.name,
          product.category,
          product.price,
          product.compareAt ?? null,
          product.currency,
          product.description,
          serialize(product.materials),
          product.fit ?? "",
          serialize(product.colors),
          serialize(product.sizes),
          product.gridImage ?? "",
          serialize(product.images),
          serialize(normalizeStock(product.stock, { colors: product.colors ?? [], sizes: product.sizes ?? [] })),
          serialize(normalizeShippingProfile(product.shippingProfile, product.category)),
          serialize(product.highlights),
          serialize(product.combinations),
          product.badge ?? "",
          product.microcopy ?? "",
          product.cardVariant ?? "standard"
        ]);
      }

      // Normalize apparel sizes to S/M and L/XL (keeps calzado numeric sizes intact).
      for (const row of rows) {
        const id = String(row[idIndex] ?? "");
        const seedProduct = seedById.get(id) ?? {};
        const currentBadge = String(row[badgeIndex] ?? "");
        const currentMicrocopy = String(row[microcopyIndex] ?? "");
        const currentCardVariant = normalizeCardVariant(row[cardVariantIndex]);
        const nextBadge = String(seedProduct.badge ?? "");
        const nextMicrocopy = String(seedProduct.microcopy ?? "");
        const nextCardVariant = normalizeCardVariant(seedProduct.cardVariant);
        if (currentBadge !== nextBadge || currentMicrocopy !== nextMicrocopy || currentCardVariant !== nextCardVariant) {
          metaStmt.run([nextBadge, nextMicrocopy, nextCardVariant, id]);
        }

        const category = row[categoryIndex] ?? "";
        const current = parseJson(row[sizesIndex], []);
        const next = normalizeSizes(category, current);
        const nextSerialized = serialize(next);
        const currentSerialized = serialize(current);
        if (nextSerialized !== currentSerialized) {
          sizeStmt.run([nextSerialized, id]);
        }

        const nextColors = parseJson(row[colorsIndex], []);
        const nextSizes = next;
        const currentStock = normalizeStock(parseJson(row[stockIndex], []), {
          colors: nextColors,
          sizes: nextSizes
        });
        const seedStock = normalizeStock(seedProduct.stock, {
          colors: seedProduct.colors ?? nextColors,
          sizes: seedProduct.sizes ?? nextSizes
        });
        if (!currentStock.length || serialize(currentStock) !== serialize(seedStock)) {
          stockStmt.run([serialize(seedStock), id]);
        }

        const currentShippingProfile = normalizeShippingProfile(parseJson(row[shippingProfileIndex], {}), category);
        const seedShippingProfile = normalizeShippingProfile(seedProduct.shippingProfile, seedProduct.category ?? category);
        if (serialize(currentShippingProfile) !== serialize(seedShippingProfile)) {
          shippingStmt.run([serialize(seedShippingProfile), id]);
        }

        const currentImages = sanitizeProductImages(parseJson(row[imagesIndex], []), row[gridImageIndex] ?? "");
        const currentGridImage = String(row[gridImageIndex] ?? "");
        const slug = String(row[slugIndex] ?? seedProduct.slug ?? "");
        const seedImages = sanitizeProductImages(seedProduct.images ?? [], seedProduct.gridImage ?? "");
        const seedGridImage = seedProduct.gridImage ?? "";
        const currentFirst = normalizeImageKey(currentImages[0]);
        const seedFirst = normalizeImageKey(seedImages[0]);
        const shouldPromoteSeedHero =
          Boolean(seedFirst) &&
          seedFirst.includes("-hero.") &&
          currentFirst !== seedFirst;
        const localPrefix = normalizeImageKey(`/images/products/${slug}/`);
        const currentImagesAreLocal =
          Boolean(localPrefix) &&
          currentImages.length > 0 &&
          currentImages.every((image) => normalizeImageKey(image).startsWith(localPrefix));
        const shouldSyncSeedImages =
          seedImages.length > 0 &&
          (
            currentImages.length === 0 ||
            hasDuplicateImages(currentImages) ||
            shouldPromoteSeedHero ||
            (currentImagesAreLocal && !normalizedImagesEqual(currentImages, seedImages))
          );
        if (
          shouldSyncSeedImages
        ) {
          imagesStmt.run([serialize(seedImages), id]);
        }

        const currentGridKey = normalizeImageKey(currentGridImage);
        const seedGridKey = normalizeImageKey(seedGridImage);
        const shouldSyncSeedGrid =
          Boolean(seedGridKey) &&
          (
            !currentGridKey ||
            shouldSyncSeedImages ||
            (currentGridKey.startsWith(localPrefix) && currentGridKey !== seedGridKey)
          );
        if (shouldSyncSeedGrid) {
          gridStmt.run([seedGridImage, id]);
        }
      }

      db.run("COMMIT;");
    } catch (err) {
      db.run("ROLLBACK;");
      throw err;
    }
    await saveDb();
    return;
  }

  const seed = readSeedProducts();
  const stmt = db.prepare(`
    INSERT INTO products
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, stock, shippingProfile, highlights, combinations, badge, microcopy, cardVariant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  db.run("BEGIN;");
  try {
    for (const product of seed) {
      stmt.run([
        product.id,
        product.slug,
        product.name,
        product.category,
        product.price,
        product.compareAt ?? null,
        product.currency,
        product.description,
        serialize(product.materials),
        product.fit ?? "",
        serialize(product.colors),
        serialize(product.sizes),
        product.gridImage ?? "",
        serialize(product.images),
        serialize(normalizeStock(product.stock, { colors: product.colors ?? [], sizes: product.sizes ?? [] })),
        serialize(normalizeShippingProfile(product.shippingProfile, product.category)),
        serialize(product.highlights),
        serialize(product.combinations),
        product.badge ?? "",
        product.microcopy ?? "",
        product.cardVariant ?? "standard"
      ]);
    }
    db.run("COMMIT;");
  } catch (err) {
    db.run("ROLLBACK;");
    throw err;
  }

  await saveDb();
};

export const getAllProducts = async () => {
  await ensureSeeded();
  const { db } = await getDb();
  const res = db.exec("SELECT * FROM products ORDER BY name ASC;");
  const rows = res?.[0]?.values ?? [];
  const columns = res?.[0]?.columns ?? [];
  return rows.map((row) => {
    const obj = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
    return mapRow(obj);
  });
};

export const getProductBySlug = async (slug) => {
  await ensureSeeded();
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM products WHERE slug = ? LIMIT 1;");
  const row = stmt.getAsObject([slug]);
  if (!row || !row.id) return null;
  return mapRow(row);
};

export const upsertProduct = async (payload) => {
  await ensureSeeded();
  const { db } = await getDb();
  const nextProduct = toSeedProduct(payload);
  const stmt = db.prepare(`
    INSERT INTO products
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, stock, shippingProfile, highlights, combinations, badge, microcopy, cardVariant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug=excluded.slug,
      name=excluded.name,
      category=excluded.category,
      price=excluded.price,
      compareAt=excluded.compareAt,
      currency=excluded.currency,
      description=excluded.description,
      materials=excluded.materials,
      fit=excluded.fit,
      colors=excluded.colors,
      sizes=excluded.sizes,
      gridImage=excluded.gridImage,
      images=excluded.images,
      stock=excluded.stock,
      shippingProfile=excluded.shippingProfile,
      highlights=excluded.highlights,
      combinations=excluded.combinations,
      badge=excluded.badge,
      microcopy=excluded.microcopy,
      cardVariant=excluded.cardVariant;
  `);

  stmt.run([
    nextProduct.id,
    nextProduct.slug,
    nextProduct.name,
    nextProduct.category,
    nextProduct.price,
    nextProduct.compareAt ?? null,
    nextProduct.currency,
    nextProduct.description,
    serialize(nextProduct.materials),
    nextProduct.fit ?? "",
    serialize(nextProduct.colors),
    serialize(nextProduct.sizes),
    nextProduct.gridImage,
    serialize(nextProduct.images),
    serialize(nextProduct.stock),
    serialize(normalizeShippingProfile(nextProduct.shippingProfile, nextProduct.category)),
    serialize(nextProduct.highlights),
    serialize(nextProduct.combinations),
    nextProduct.badge ?? "",
    nextProduct.microcopy ?? "",
    nextProduct.cardVariant ?? "standard"
  ]);

  const seed = readSeedProducts();
  const index = seed.findIndex((product) => String(product.id) === nextProduct.id);
  if (index === -1) seed.push(nextProduct);
  else seed[index] = nextProduct;
  writeSeedProducts(seed);

  await saveDb();
  return nextProduct;
};

export const deleteProduct = async (id) => {
  await ensureSeeded();
  const { db } = await getDb();
  const stmt = db.prepare("DELETE FROM products WHERE id = ?;");
  stmt.run([id]);
  const seed = readSeedProducts().filter((product) => String(product.id) !== String(id));
  writeSeedProducts(seed);
  await saveDb();
};
