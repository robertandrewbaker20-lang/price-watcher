import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const watchedItems = sqliteTable("watched_items", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  notes: text("notes"),
  preferredSize: text("preferred_size"),
  targetPrice: real("target_price"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastChecked: integer("last_checked", { mode: "timestamp_ms" }),
  lastPrice: real("last_price"),
  lastCurrency: text("last_currency"),
  lastInStock: integer("last_in_stock", { mode: "boolean" }),
  lastSizeAvailable: integer("last_size_available", { mode: "boolean" }),
  lastImage: text("last_image"),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const priceHistory = sqliteTable("price_history", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => watchedItems.id, { onDelete: "cascade" }),
  price: real("price"),
  currency: text("currency"),
  inStock: integer("in_stock", { mode: "boolean" }),
  sizeAvailable: integer("size_available", { mode: "boolean" }),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  rawData: text("raw_data"),
  error: text("error"),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => watchedItems.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
  success: integer("success", { mode: "boolean" }).notNull().default(true),
  price: real("price"),
});

export type WatchedItem = typeof watchedItems.$inferSelect;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
