import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, saveDb } from "./db";

const jsonPath = join(process.cwd(), "data", "products.json");

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
const normalizeList = (value) => (Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []);
const normalizeCardVariant = (value) => String(value ?? "").trim().toLowerCase() === "double" ? "double" : "standard";
const readSeedProducts = () => JSON.parse(readFileSync(jsonPath, "utf-8"));
const writeSeedProducts = (products) => {
  writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf-8");
};
const toSeedProduct = (payload) => {
  const images = normalizeList(payload.images);
  return {
    id: String(payload.id ?? payload.slug ?? ""),
    slug: String(payload.slug ?? payload.id ?? ""),
    name: String(payload.name ?? ""),
    category: String(payload.category ?? ""),
    price: Number(payload.price ?? 0),
    compareAt: payload.compareAt ?? null,
    currency: String(payload.currency ?? "ARS"),
    description: String(payload.description ?? ""),
    materials: normalizeList(payload.materials),
    fit: String(payload.fit ?? ""),
    colors: normalizeList(payload.colors),
    sizes: normalizeList(payload.sizes),
    gridImage: String(payload.gridImage ?? images[0] ?? ""),
    images,
    highlights: normalizeList(payload.highlights),
    combinations: Array.isArray(payload.combinations) ? payload.combinations : [],
    badge: String(payload.badge ?? ""),
    microcopy: String(payload.microcopy ?? ""),
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
  images: parseJson(row.images, []),
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
    const insertStmt = db.prepare(`
      INSERT INTO products
      (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, highlights, combinations, badge, microcopy, cardVariant)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const resAll = db.exec("SELECT id, slug, category, sizes, gridImage, images, badge, microcopy, cardVariant FROM products;");
    const rows = resAll?.[0]?.values ?? [];
    const cols = resAll?.[0]?.columns ?? [];
    const idIndex = cols.indexOf("id");
    const slugIndex = cols.indexOf("slug");
    const categoryIndex = cols.indexOf("category");
    const sizesIndex = cols.indexOf("sizes");
    const gridImageIndex = cols.indexOf("gridImage");
    const imagesIndex = cols.indexOf("images");
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

        const currentImages = parseJson(row[imagesIndex], []);
        const currentGridImage = String(row[gridImageIndex] ?? "");
        const slug = String(row[slugIndex] ?? seedProduct.slug ?? "");
        const seedImages = seedProduct.images ?? [];
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
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, highlights, combinations, badge, microcopy, cardVariant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, gridImage, images, highlights, combinations, badge, microcopy, cardVariant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
