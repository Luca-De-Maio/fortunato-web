import { randomUUID } from "node:crypto";
import { getAllCombinations } from "./combinations";
import { getDb, saveDb } from "./db";
import { getAllProducts } from "./products";

const CART_ITEM_LIMIT = 24;
const CART_QTY_LIMIT = 12;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cleanText = (value: unknown, max = 120) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
const normalizeVariantValue = (value: unknown, max: number) => cleanText(value, max);
const normalizeId = (value: unknown) => cleanText(value, 120);
const normalizeQty = (value: unknown) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return clamp(Math.trunc(next), 1, CART_QTY_LIMIT);
};
const makeLineKey = (id: string, color = "", size = "") =>
  `${normalizeId(id)}__${normalizeVariantValue(color, 40).toLowerCase()}__${normalizeVariantValue(size, 20).toLowerCase()}`;
const variantKey = (color = "", size = "") =>
  `${normalizeVariantValue(color, 40).toLowerCase()}__${normalizeVariantValue(size, 20).toLowerCase()}`;
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
const equalsText = (left: unknown, right: unknown) =>
  cleanText(left, 120).toLowerCase() === cleanText(right, 120).toLowerCase();

type NormalizedCartItem = {
  id: string;
  qty: number;
  color: string;
  size: string;
};

type StockLock = {
  productId: string;
  color: string;
  size: string;
  qty: number;
};

type ReservationRecord = {
  id: string;
  status: string;
  cartSnapshot: NormalizedCartItem[];
  locks: StockLock[];
  expiresAt: number | null;
  paymentId: string;
  preferenceId: string;
  createdAt: number;
  updatedAt: number;
};

const normalizeIncomingCart = (value: unknown): NormalizedCartItem[] => {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, NormalizedCartItem>();
  for (const entry of value.slice(0, CART_ITEM_LIMIT)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = normalizeId((entry as { id?: unknown }).id);
    if (!id) continue;
    const color = normalizeVariantValue((entry as { color?: unknown }).color, 40);
    const size = normalizeVariantValue((entry as { size?: unknown }).size, 20);
    const qty = normalizeQty((entry as { qty?: unknown }).qty);
    const key = makeLineKey(id, color, size);
    const current = merged.get(key);
    if (current) {
      current.qty = clamp(current.qty + qty, 1, CART_QTY_LIMIT);
      continue;
    }
    merged.set(key, { id, qty, color, size });
  }
  return Array.from(merged.values());
};

const getProductStockEntries = (product: any) =>
  Array.isArray(product?.stock)
    ? product.stock.map((entry: any) => ({
        color: normalizeVariantValue(entry?.color, 40),
        size: normalizeVariantValue(entry?.size, 20),
        quantity: clamp(Number(entry?.quantity || 0), 0, 999999)
      }))
    : [];
const getProductRequiresColor = (product: any) => Array.isArray(product?.colors) && product.colors.length > 0;
const getProductRequiresSize = (product: any) => Array.isArray(product?.sizes) && product.sizes.length > 0;
const isValidOption = (options: unknown[], value: string) =>
  !Array.isArray(options) || !options.length || options.some((entry) => equalsText(entry, value));
const getHeldQuantityForSelection = (productId: string, color: string, size: string, locks: StockLock[]) =>
  locks.reduce((sum, lock) => {
    if (!equalsText(lock.productId, productId)) return sum;
    if (!cleanText(lock.color, 40) && !cleanText(lock.size, 20)) {
      return sum + normalizeQty(lock.qty);
    }
    if (equalsText(lock.color, color) && equalsText(lock.size, size)) {
      return sum + normalizeQty(lock.qty);
    }
    return sum;
  }, 0);
const getHeldQuantityForProduct = (productId: string, locks: StockLock[]) =>
  locks.reduce((sum, lock) => {
    if (!equalsText(lock.productId, productId)) return sum;
    return sum + normalizeQty(lock.qty);
  }, 0);
const getAvailableForSelection = (product: any, color: string, size: string, locks: StockLock[]) => {
  const stock = getProductStockEntries(product);
  const match = stock.find((entry) => variantKey(entry.color, entry.size) === variantKey(color, size));
  const base = Number(match?.quantity || 0);
  return Math.max(0, base - getHeldQuantityForSelection(product.id, color, size, locks));
};
const getTotalAvailableForProduct = (product: any, locks: StockLock[]) => {
  const base = getProductStockEntries(product).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  return Math.max(0, base - getHeldQuantityForProduct(product.id, locks));
};

const toReservationRecord = (row: Record<string, unknown>): ReservationRecord => ({
  id: cleanText(row.id, 120),
  status: cleanText(row.status, 32),
  cartSnapshot: normalizeIncomingCart(parseJson(row.cartSnapshot, [] as NormalizedCartItem[])),
  locks: normalizeIncomingCart(
    parseJson(row.locks, [] as Array<{ productId?: unknown; color?: unknown; size?: unknown; qty?: unknown }>)
      .map((entry) => ({
        id: cleanText(entry.productId, 120),
        color: normalizeVariantValue(entry.color, 40),
        size: normalizeVariantValue(entry.size, 20),
        qty: normalizeQty(entry.qty)
      }))
  ).map((entry) => ({
    productId: entry.id,
    color: entry.color,
    size: entry.size,
    qty: entry.qty
  })),
  expiresAt: Number.isFinite(Number(row.expiresAt)) ? Number(row.expiresAt) : null,
  paymentId: cleanText(row.paymentId, 120),
  preferenceId: cleanText(row.preferenceId, 120),
  createdAt: Number(row.createdAt || 0),
  updatedAt: Number(row.updatedAt || 0)
});

const readReservations = async () => {
  const { db } = await getDb();
  const res = db.exec("SELECT * FROM stock_reservations ORDER BY createdAt DESC;");
  const rows = res?.[0]?.values ?? [];
  const columns = res?.[0]?.columns ?? [];
  return rows.map((row) => toReservationRecord(Object.fromEntries(columns.map((column, index) => [column, row[index]]))));
};

export const cleanupExpiredReservations = async () => {
  const { db } = await getDb();
  const now = Date.now();
  const reservations = await readReservations();
  const expired = reservations.filter((reservation) => reservation.status === "pending" && Number(reservation.expiresAt || 0) > 0 && Number(reservation.expiresAt || 0) <= now);
  if (!expired.length) return 0;
  const stmt = db.prepare("UPDATE stock_reservations SET status = ?, updatedAt = ? WHERE id = ?;");
  for (const reservation of expired) {
    stmt.run(["expired", now, reservation.id]);
  }
  await saveDb();
  return expired.length;
};

const getActiveLocks = async () => {
  await cleanupExpiredReservations();
  const now = Date.now();
  const reservations = await readReservations();
  return reservations
    .filter((reservation) => reservation.status === "confirmed" || (reservation.status === "pending" && Number(reservation.expiresAt || 0) > now))
    .flatMap((reservation) => reservation.locks);
};

export const getProductAvailabilitySnapshot = async (product: any) => {
  const locks = await getActiveLocks();
  const stock = getProductStockEntries(product).map((entry) => ({
    color: entry.color,
    size: entry.size,
    quantity: Number(entry.quantity || 0),
    available: getAvailableForSelection(product, entry.color, entry.size, locks)
  }));
  const totalAvailable = stock.reduce((sum, entry) => sum + Number(entry.available || 0), 0);
  return {
    stock,
    totalAvailable,
    inStock: totalAvailable > 0
  };
};

export const quoteCart = async (value: unknown) => {
  const cart = normalizeIncomingCart(value);
  const [products, combinations, locks] = await Promise.all([
    getAllProducts(),
    getAllCombinations(),
    getActiveLocks()
  ]);

  const productById = new Map(products.map((product: any) => [String(product.id || ""), product]));
  const comboById = new Map<string, any>();
  for (const combo of combinations) {
    comboById.set(String(combo.id || ""), combo);
    comboById.set(`combo-${String(combo.id || "")}`, combo);
  }

  const issues: Array<{
    key: string;
    id: string;
    code: string;
    message: string;
    requestedQty: number;
    availableQty: number;
  }> = [];
  const items: Array<Record<string, unknown>> = [];
  const normalizedCart: NormalizedCartItem[] = [];
  const reservationLocks: StockLock[] = [];
  const draftLocks = [...locks];

  for (const entry of cart) {
    const key = makeLineKey(entry.id, entry.color, entry.size);
    const product = productById.get(entry.id);
    if (product) {
      if (getProductRequiresColor(product) && !entry.color) {
        issues.push({
          key,
          id: entry.id,
          code: "missing_color",
          message: `${product.name}: elegí un color antes de avanzar al pago.`,
          requestedQty: entry.qty,
          availableQty: 0
        });
        continue;
      }
      if (getProductRequiresSize(product) && !entry.size) {
        issues.push({
          key,
          id: entry.id,
          code: "missing_size",
          message: `${product.name}: elegí un talle antes de avanzar al pago.`,
          requestedQty: entry.qty,
          availableQty: 0
        });
        continue;
      }
      if (!isValidOption(product.colors, entry.color) || !isValidOption(product.sizes, entry.size)) {
        issues.push({
          key,
          id: entry.id,
          code: "invalid_variant",
          message: `${product.name}: la variante seleccionada ya no está disponible.`,
          requestedQty: entry.qty,
          availableQty: 0
        });
        continue;
      }

      const availableQty = getAvailableForSelection(product, entry.color, entry.size, draftLocks);
      const acceptedQty = Math.min(entry.qty, availableQty);
      if (acceptedQty <= 0) {
        issues.push({
          key,
          id: entry.id,
          code: "out_of_stock",
          message: `${product.name}: sin stock para la variante seleccionada.`,
          requestedQty: entry.qty,
          availableQty
        });
        continue;
      }
      if (acceptedQty < entry.qty) {
        issues.push({
          key,
          id: entry.id,
          code: "qty_adjusted",
          message: `${product.name}: ajustamos la cantidad a ${acceptedQty} por stock disponible.`,
          requestedQty: entry.qty,
          availableQty
        });
      }

      const titleParts = [String(product.name || "Producto Fortunato")];
      if (entry.color) titleParts.push(entry.color);
      if (entry.size) titleParts.push(`Talle ${entry.size}`);
      const unitPrice = Number(product.price || 0);
      normalizedCart.push({
        id: product.id,
        qty: acceptedQty,
        color: entry.color,
        size: entry.size
      });
      reservationLocks.push({
        productId: product.id,
        color: entry.color,
        size: entry.size,
        qty: acceptedQty
      });
      draftLocks.push({
        productId: product.id,
        color: entry.color,
        size: entry.size,
        qty: acceptedQty
      });
      items.push({
        kind: "product",
        key,
        id: product.id,
        slug: product.slug,
        name: product.name,
        title: titleParts.join(" · "),
        image: product.gridImage || product.images?.[0] || "/placeholder.svg",
        color: entry.color,
        size: entry.size,
        currency: product.currency || "ARS",
        unitPrice,
        qty: acceptedQty,
        lineTotal: unitPrice * acceptedQty,
        availableQty,
        stockLabel: availableQty <= 2 ? `Quedan ${availableQty}` : "Disponible",
        isLowStock: availableQty <= 2
      });
      continue;
    }

    const combo = comboById.get(entry.id);
    if (!combo) {
      issues.push({
        key,
        id: entry.id,
        code: "missing_item",
        message: "Uno de los productos del carrito ya no existe en el catálogo.",
        requestedQty: entry.qty,
        availableQty: 0
      });
      continue;
    }

    const componentAvailability = combo.items
      .map((item: any) => productById.get(String(item.id || "")))
      .filter(Boolean)
      .map((product: any) => getTotalAvailableForProduct(product, draftLocks));
    const availableQty = componentAvailability.length ? Math.min(...componentAvailability) : 0;
    const acceptedQty = Math.min(entry.qty, availableQty);

    if (acceptedQty <= 0) {
      issues.push({
        key,
        id: entry.id,
        code: "combo_out_of_stock",
        message: `${combo.title}: no hay stock suficiente para armar este conjunto.`,
        requestedQty: entry.qty,
        availableQty
      });
      continue;
    }
    if (acceptedQty < entry.qty) {
      issues.push({
        key,
        id: entry.id,
        code: "qty_adjusted",
        message: `${combo.title}: ajustamos la cantidad del conjunto a ${acceptedQty}.`,
        requestedQty: entry.qty,
        availableQty
      });
    }

    normalizedCart.push({
      id: `combo-${combo.id}`,
      qty: acceptedQty,
      color: "",
      size: ""
    });
    for (const item of combo.items) {
      reservationLocks.push({
        productId: String(item.id || ""),
        color: "",
        size: "",
        qty: acceptedQty
      });
      draftLocks.push({
        productId: String(item.id || ""),
        color: "",
        size: "",
        qty: acceptedQty
      });
    }
    items.push({
      kind: "combo",
      key,
      id: `combo-${combo.id}`,
      slug: combo.slug,
      name: combo.title,
      title: combo.title,
      image: combo.image || "/placeholder.svg",
      color: "",
      size: "",
      currency: combo.currency || "ARS",
      unitPrice: Number(combo.bundlePrice || 0),
      qty: acceptedQty,
      lineTotal: Number(combo.bundlePrice || 0) * acceptedQty,
      availableQty,
      stockLabel: availableQty <= 2 ? `Quedan ${availableQty} sets` : "Disponible",
      isLowStock: availableQty <= 2
    });
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  return {
    cart: normalizedCart,
    items,
    issues,
    subtotal,
    currency: String(items[0]?.currency || "ARS"),
    reservationLocks,
    reservationTtlMs: RESERVATION_TTL_MS
  };
};

export const createStockReservation = async ({
  cart,
  locks
}: {
  cart: NormalizedCartItem[];
  locks: StockLock[];
}) => {
  const { db } = await getDb();
  const id = randomUUID();
  const now = Date.now();
  const expiresAt = now + RESERVATION_TTL_MS;
  const stmt = db.prepare(`
    INSERT INTO stock_reservations
    (id, status, cartSnapshot, locks, expiresAt, paymentId, preferenceId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  stmt.run([
    id,
    "pending",
    JSON.stringify(cart),
    JSON.stringify(locks),
    expiresAt,
    "",
    "",
    now,
    now
  ]);
  await saveDb();
  return { id, expiresAt };
};

export const getStockReservation = async (id: string) => {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM stock_reservations WHERE id = ? LIMIT 1;");
  const row = stmt.getAsObject([id]);
  if (!row || !row.id) return null;
  return toReservationRecord(row as Record<string, unknown>);
};

export const setReservationPreferenceId = async (id: string, preferenceId: string) => {
  const { db } = await getDb();
  const stmt = db.prepare("UPDATE stock_reservations SET preferenceId = ?, updatedAt = ? WHERE id = ?;");
  stmt.run([cleanText(preferenceId, 120), Date.now(), cleanText(id, 120)]);
  await saveDb();
};

export const releaseStockReservation = async (id: string) => {
  const reservation = await getStockReservation(id);
  if (!reservation || reservation.status !== "pending") return false;
  const { db } = await getDb();
  const stmt = db.prepare("UPDATE stock_reservations SET status = ?, updatedAt = ? WHERE id = ?;");
  stmt.run(["released", Date.now(), reservation.id]);
  await saveDb();
  return true;
};

export const confirmStockReservation = async ({
  id,
  paymentId
}: {
  id: string;
  paymentId?: string;
}) => {
  const reservation = await getStockReservation(id);
  if (!reservation) return null;
  if (reservation.status === "confirmed") return reservation;
  if (reservation.status !== "pending") return reservation;
  const { db } = await getDb();
  const stmt = db.prepare("UPDATE stock_reservations SET status = ?, paymentId = ?, updatedAt = ? WHERE id = ?;");
  stmt.run(["confirmed", cleanText(paymentId, 120), Date.now(), reservation.id]);
  await saveDb();
  return getStockReservation(reservation.id);
};
