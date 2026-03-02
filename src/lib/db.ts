import initSqlJs from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let dbPromise;

const getDbPath = () => {
  const envPath = process.env.DB_PATH;
  if (envPath && envPath.trim()) return envPath;
  return join(process.cwd(), "data", "fortunato.db");
};

const ensureDir = (filePath) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const getSqlJs = async () => {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const wasmDir = dirname(wasmPath);
  return initSqlJs({
    locateFile: (file) => join(wasmDir, file)
  });
};

export const getDb = async () => {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const SQL = await getSqlJs();
    const dbPath = getDbPath();
    ensureDir(dbPath);
    const fileExists = existsSync(dbPath);
    const db = fileExists ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE,
        name TEXT NOT NULL,
        category TEXT,
        price INTEGER,
        compareAt INTEGER,
        currency TEXT,
        description TEXT,
        materials TEXT,
        fit TEXT,
        colors TEXT,
        sizes TEXT,
        images TEXT,
        highlights TEXT,
        combinations TEXT,
        badge TEXT,
        microcopy TEXT
      );
    `);

    // Lightweight migration for compareAt/badge/microcopy columns
    const columns = db.exec("PRAGMA table_info(products);")?.[0]?.values ?? [];
    const hasCompareAt = columns.some((row) => row[1] === "compareAt");
    if (!hasCompareAt) {
      db.run("ALTER TABLE products ADD COLUMN compareAt INTEGER;");
    }
    const hasMaterials = columns.some((row) => row[1] === "materials");
    if (!hasMaterials) {
      db.run("ALTER TABLE products ADD COLUMN materials TEXT;");
    }
    const hasFit = columns.some((row) => row[1] === "fit");
    if (!hasFit) {
      db.run("ALTER TABLE products ADD COLUMN fit TEXT;");
    }
    const hasColors = columns.some((row) => row[1] === "colors");
    if (!hasColors) {
      db.run("ALTER TABLE products ADD COLUMN colors TEXT;");
    }
    const hasSizes = columns.some((row) => row[1] === "sizes");
    if (!hasSizes) {
      db.run("ALTER TABLE products ADD COLUMN sizes TEXT;");
    }
    const hasImages = columns.some((row) => row[1] === "images");
    if (!hasImages) {
      db.run("ALTER TABLE products ADD COLUMN images TEXT;");
    }
    const hasHighlights = columns.some((row) => row[1] === "highlights");
    if (!hasHighlights) {
      db.run("ALTER TABLE products ADD COLUMN highlights TEXT;");
    }
    const hasCombinations = columns.some((row) => row[1] === "combinations");
    if (!hasCombinations) {
      db.run("ALTER TABLE products ADD COLUMN combinations TEXT;");
    }
    const hasBadge = columns.some((row) => row[1] === "badge");
    if (!hasBadge) {
      db.run("ALTER TABLE products ADD COLUMN badge TEXT;");
    }
    const hasMicrocopy = columns.some((row) => row[1] === "microcopy");
    if (!hasMicrocopy) {
      db.run("ALTER TABLE products ADD COLUMN microcopy TEXT;");
    }

    return { db, dbPath };
  })();

  return dbPromise;
};

export const saveDb = async () => {
  const { db, dbPath } = await getDb();
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
};
