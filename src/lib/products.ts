import { readFileSync } from "node:fs";
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
  images: parseJson(row.images, []),
  highlights: parseJson(row.highlights, []),
  combinations: parseJson(row.combinations, []),
  badge: row.badge || "",
  microcopy: row.microcopy || ""
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
    const seed = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const stmt = db.prepare("UPDATE products SET badge = ?, microcopy = ? WHERE id = ? AND ((badge IS NULL OR badge = '') OR (microcopy IS NULL OR microcopy = ''));");
    const sizeStmt = db.prepare("UPDATE products SET sizes = ? WHERE id = ?;");

    const resAll = db.exec("SELECT id, category, sizes FROM products;");
    const rows = resAll?.[0]?.values ?? [];
    const cols = resAll?.[0]?.columns ?? [];
    const idIndex = cols.indexOf("id");
    const categoryIndex = cols.indexOf("category");
    const sizesIndex = cols.indexOf("sizes");

    db.run("BEGIN;");
    try {
      for (const product of seed) {
        if (product.badge || product.microcopy) {
          stmt.run([
            product.badge ?? "",
            product.microcopy ?? "",
            product.id
          ]);
        }
      }

      // Normalize apparel sizes to S/M and L/XL (keeps calzado numeric sizes intact).
      for (const row of rows) {
        const id = String(row[idIndex] ?? "");
        const category = row[categoryIndex] ?? "";
        const current = parseJson(row[sizesIndex], []);
        const next = normalizeSizes(category, current);
        const nextSerialized = serialize(next);
        const currentSerialized = serialize(current);
        if (nextSerialized !== currentSerialized) {
          sizeStmt.run([nextSerialized, id]);
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

  const seed = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const stmt = db.prepare(`
    INSERT INTO products
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, images, highlights, combinations, badge, microcopy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
        serialize(product.images),
        serialize(product.highlights),
        serialize(product.combinations),
        product.badge ?? "",
        product.microcopy ?? ""
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
  const stmt = db.prepare(`
    INSERT INTO products
    (id, slug, name, category, price, compareAt, currency, description, materials, fit, colors, sizes, images, highlights, combinations, badge, microcopy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      images=excluded.images,
      highlights=excluded.highlights,
      combinations=excluded.combinations,
      badge=excluded.badge,
      microcopy=excluded.microcopy;
  `);

  stmt.run([
    payload.id,
    payload.slug,
    payload.name,
    payload.category,
    payload.price,
    payload.compareAt ?? null,
    payload.currency,
    payload.description,
    serialize(payload.materials),
    payload.fit ?? "",
    serialize(payload.colors),
    serialize(payload.sizes),
    serialize(payload.images),
    serialize(payload.highlights),
    serialize(payload.combinations),
    payload.badge ?? "",
    payload.microcopy ?? ""
  ]);

  await saveDb();
  return payload;
};

export const deleteProduct = async (id) => {
  await ensureSeeded();
  const { db } = await getDb();
  const stmt = db.prepare("DELETE FROM products WHERE id = ?;");
  stmt.run([id]);
  await saveDb();
};
