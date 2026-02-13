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
