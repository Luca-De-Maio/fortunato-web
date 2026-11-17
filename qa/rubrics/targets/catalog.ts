import { readFile } from "node:fs/promises";
import type { RunContext } from "../rubrics/types.ts";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number | null;
  currency: string;
  description: string;
  images: string[];
  sizes: string[];
  colors: string[];
  materials?: string[];
  fit?: string;
  badge?: string;
  sizeGuide?: string[];
  [key: string]: unknown;
}

export interface LoadedCatalog {
  products: Product[];
  source: string;
}

/** Catalog from CATALOG_FILE if given, otherwise from the target's admin API (needs ADMIN_COOKIE). */
export async function loadCatalog(ctx: RunContext): Promise<LoadedCatalog> {
  if (ctx.catalogFile) {
    const raw = JSON.parse(await readFile(ctx.catalogFile, "utf8"));
    const products = Array.isArray(raw) ? raw : raw.products;
    if (!Array.isArray(products)) throw new Error(`${ctx.catalogFile}: expected an array of products or { products: [...] }`);
    return { products, source: ctx.catalogFile };
  }
  const url = `${ctx.baseUrl}/api/admin/products`;
  const res = await fetch(url, {
    headers: process.env.ADMIN_COOKIE ? { Cookie: process.env.ADMIN_COOKIE } : {},
  }).catch((e: Error) => {
    throw new Error(`Could not reach ${url}: ${e.message}`);
  });
  if (!res.ok) {
    throw new Error(
      `${url} answered ${res.status}. Set ADMIN_COOKIE for the live catalog, or CATALOG_FILE=<path> to use a snapshot.`
    );
  }
  const json = await res.json();
  const products = Array.isArray(json) ? json : json.products;
  if (!Array.isArray(products)) throw new Error(`${url}: response has no products array`);
  return { products, source: url };
}
