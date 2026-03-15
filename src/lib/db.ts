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
        gridImage TEXT,
        images TEXT,
        stock TEXT,
        highlights TEXT,
        combinations TEXT,
        badge TEXT,
        microcopy TEXT,
        cardVariant TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        cartSnapshot TEXT,
        locks TEXT NOT NULL,
        expiresAt INTEGER,
        paymentId TEXT,
        preferenceId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        sessionId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        path TEXT NOT NULL,
        referrerPath TEXT,
        sectionKey TEXT,
        targetKind TEXT,
        targetKey TEXT,
        dwellMs INTEGER,
        scrollDepth INTEGER
      );
    `);

    db.run("CREATE INDEX IF NOT EXISTS analytics_events_createdAt_idx ON analytics_events(createdAt);");
    db.run("CREATE INDEX IF NOT EXISTS analytics_events_eventType_idx ON analytics_events(eventType);");
    db.run("CREATE INDEX IF NOT EXISTS analytics_events_path_idx ON analytics_events(path);");

    // Lightweight migration for compareAt/badge/microcopy/cardVariant columns
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
    const hasGridImage = columns.some((row) => row[1] === "gridImage");
    if (!hasGridImage) {
      db.run("ALTER TABLE products ADD COLUMN gridImage TEXT;");
    }
    const hasStock = columns.some((row) => row[1] === "stock");
    if (!hasStock) {
      db.run("ALTER TABLE products ADD COLUMN stock TEXT;");
    }
    const hasCardVariant = columns.some((row) => row[1] === "cardVariant");
    if (!hasCardVariant) {
      db.run("ALTER TABLE products ADD COLUMN cardVariant TEXT;");
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
