import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

function defaultDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data");
}

export function openDatabase(dataDir: string): {
  db: AppDatabase;
  close: () => void;
} {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqlite = new Database(path.join(dataDir, "price-watcher.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS watched_items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      notes TEXT,
      preferred_size TEXT,
      target_price REAL,
      active INTEGER NOT NULL DEFAULT 1,
      last_checked INTEGER,
      last_price REAL,
      last_currency TEXT,
      last_in_stock INTEGER,
      last_size_available INTEGER,
      last_image TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES watched_items(id) ON DELETE CASCADE,
      price REAL,
      currency TEXT,
      in_stock INTEGER,
      size_available INTEGER,
      checked_at INTEGER NOT NULL,
      raw_data TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES watched_items(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      price REAL
    );

    CREATE INDEX IF NOT EXISTS idx_history_item ON price_history(item_id, checked_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_item ON notifications(item_id, sent_at);
  `);

  const columns: unknown = sqlite
    .prepare("PRAGMA table_info(notifications)")
    .all();
  const names = Array.isArray(columns)
    ? columns.flatMap((column) => {
        if (
          column &&
          typeof column === "object" &&
          "name" in column &&
          typeof column.name === "string"
        ) {
          return [column.name];
        }
        return [];
      })
    : [];
  if (!names.includes("price")) {
    sqlite.exec("ALTER TABLE notifications ADD COLUMN price REAL");
  }

  const db = drizzle(sqlite, { schema });
  return { db, close: () => sqlite.close() };
}

const globalForDb = globalThis as typeof globalThis & {
  __priceWatcherDb?: AppDatabase;
};

export function getDb(): AppDatabase {
  if (!globalForDb.__priceWatcherDb) {
    globalForDb.__priceWatcherDb = openDatabase(defaultDataDir()).db;
  }
  return globalForDb.__priceWatcherDb;
}
