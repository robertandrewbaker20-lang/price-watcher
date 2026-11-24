import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { openDatabase, type AppDatabase } from "../src/lib/db";
import { notifications, priceHistory, watchedItems, type WatchedItem } from "../src/lib/db/schema";
import { recordCheck, type SendEmail } from "../src/lib/record";
import { runChecks } from "../src/lib/check";
import type { ScrapeResult } from "../src/lib/scrapers/types";

function reading(price: number | null, error?: string): ScrapeResult {
  return {
    title: "Trail Wool Shirt",
    price,
    currency: "USD",
    inStock: true,
    sizeAvailable: null,
    image: null,
    raw: { source: "test" },
    error,
  };
}

async function withDb(
  run: (database: AppDatabase) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "price-watcher-"));
  const opened = openDatabase(dir);
  try {
    await run(opened.db);
  } finally {
    opened.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function addProduct(
  database: AppDatabase,
  targetPrice: number | null = null
): Promise<WatchedItem> {
  await database.insert(watchedItems).values({
    id: "shirt",
    url: "https://example.com/products/trail-wool-shirt",
    title: "Trail Wool Shirt",
    notes: null,
    preferredSize: null,
    targetPrice,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  const rows = await database
    .select()
    .from(watchedItems)
    .where(eq(watchedItems.id, "shirt"));
  const item = rows[0];
  if (!item) throw new Error("product insert failed");
  return item;
}

test("the same reading is stored once and alerts once", async () => {
  await withDb(async (database) => {
    const item = await addProduct(database);
    const sent: string[] = [];
    const sendEmail: SendEmail = async ({ subject }) => {
      sent.push(subject);
      return { ok: true, delivered: false, error: "dry-run" };
    };

    const first = await recordCheck(database, item, reading(48), {
      now: new Date("2026-02-01T00:00:00Z"),
      sendEmail,
    });
    const second = await recordCheck(database, item, reading(48), {
      now: new Date("2026-02-02T00:00:00Z"),
      sendEmail,
    });
    const dropped = await recordCheck(database, item, reading(36), {
      now: new Date("2026-02-03T00:00:00Z"),
      sendEmail,
    });
    const repeat = await recordCheck(database, item, reading(36), {
      now: new Date("2026-02-04T00:00:00Z"),
      sendEmail,
    });

    const history = await database.select().from(priceHistory);
    const notes = await database.select().from(notifications);

    assert.equal(first.recorded, true);
    assert.equal(first.alerted, false);
    assert.equal(second.recorded, false);
    assert.equal(second.alerted, false);
    assert.equal(dropped.recorded, true);
    assert.equal(dropped.alerted, true);
    assert.match(dropped.alertReason ?? "", /Dropped 25\.0%/);
    assert.equal(repeat.recorded, false);
    assert.equal(repeat.alerted, false);
    assert.equal(history.length, 2);
    assert.equal(notes.length, 1);
    assert.equal(sent.length, 1);
    assert.equal(notes[0]?.success, true);
  });
});

test("a failed alert is retried once and does not add another row", async () => {
  await withDb(async (database) => {
    const item = await addProduct(database, 40);
    let attempts = 0;
    const sendEmail: SendEmail = async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, delivered: false, error: "mailbox unavailable" };
      }
      return { ok: true, delivered: true };
    };

    await recordCheck(database, item, reading(36), {
      now: new Date("2026-03-01T00:00:00Z"),
      sendEmail,
    });
    await recordCheck(database, item, reading(36), {
      now: new Date("2026-03-02T00:00:00Z"),
      sendEmail,
    });
    await recordCheck(database, item, reading(36), {
      now: new Date("2026-03-03T00:00:00Z"),
      sendEmail,
    });

    const history = await database.select().from(priceHistory);
    const notes = await database.select().from(notifications);
    assert.equal(history.length, 1);
    assert.equal(notes.length, 1);
    assert.equal(attempts, 2);
    assert.equal(notes[0]?.success, true);
    assert.equal(notes[0]?.price, 36);
  });
});

test("returning to a price that already alerted does not alert again", async () => {
  await withDb(async (database) => {
    const item = await addProduct(database, 40);
    const sent: number[] = [];
    const sendEmail: SendEmail = async () => {
      sent.push(sent.length + 1);
      return { ok: true, delivered: true };
    };

    await recordCheck(database, item, reading(36), {
      now: new Date("2026-05-01T00:00:00Z"),
      sendEmail,
    });
    await recordCheck(database, item, reading(30), {
      now: new Date("2026-05-02T00:00:00Z"),
      sendEmail,
    });
    const back = await recordCheck(database, item, reading(36), {
      now: new Date("2026-05-03T00:00:00Z"),
      sendEmail,
    });

    const history = await database.select().from(priceHistory);
    const notes = await database.select().from(notifications);
    assert.equal(back.recorded, true);
    assert.equal(back.alerted, false);
    assert.equal(history.length, 3);
    assert.equal(notes.length, 2);
    assert.equal(sent.length, 2);
  });
});

test("a failed percentage drop is retried without another row", async () => {
  await withDb(async (database) => {
    const item = await addProduct(database);
    let attempts = 0;
    const sendEmail: SendEmail = async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, delivered: false, error: "mailbox unavailable" };
      }
      return { ok: true, delivered: true };
    };

    await recordCheck(database, item, reading(100), {
      now: new Date("2026-06-01T00:00:00Z"),
      sendEmail,
    });
    const dropped = await recordCheck(database, item, reading(80), {
      now: new Date("2026-06-02T00:00:00Z"),
      sendEmail,
    });
    const again = await recordCheck(database, item, reading(80), {
      now: new Date("2026-06-03T00:00:00Z"),
      sendEmail,
    });

    const history = await database.select().from(priceHistory);
    const notes = await database.select().from(notifications);
    assert.equal(dropped.alerted, true);
    assert.equal(dropped.emailed, false);
    assert.equal(again.recorded, false);
    assert.equal(again.alerted, true);
    assert.equal(again.emailed, true);
    assert.equal(attempts, 2);
    assert.equal(history.length, 2);
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.success, true);
  });
});

test("the same scrape error is stored once", async () => {
  await withDb(async (database) => {
    const item = await addProduct(database);
    const sendEmail: SendEmail = async () => {
      throw new Error("email should not be called");
    };
    const blocked = reading(null, "Could not extract a price from this page");
    await recordCheck(database, item, blocked, {
      now: new Date("2026-04-01T00:00:00Z"),
      sendEmail,
    });
    const again = await recordCheck(database, item, blocked, {
      now: new Date("2026-04-02T00:00:00Z"),
      sendEmail,
    });
    const history = await database.select().from(priceHistory);
    assert.equal(again.recorded, false);
    assert.equal(again.alerted, false);
    assert.equal(history.length, 1);
  });
});

function stub(id: string, title: string): WatchedItem {
  return {
    id,
    url: "https://example.com/products/trail-wool-shirt",
    title,
    notes: null,
    preferredSize: null,
    targetPrice: null,
    active: true,
    lastChecked: null,
    lastPrice: null,
    lastCurrency: null,
    lastInStock: null,
    lastSizeAvailable: null,
    lastImage: null,
    lastError: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

test("one failing product does not drop the rest of the run", async () => {
  const items = [stub("a", "First"), stub("b", "Second")];

  const results = await runChecks(items, async (item) => {
    if (item.id === "a") throw new Error("page timed out");
    return {
      itemId: item.id,
      title: item.title,
      price: 10,
      alerted: false,
      emailed: false,
      emailNote: null,
      recorded: true,
      alertReason: null,
    };
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]?.error, "page timed out");
  assert.equal(results[1]?.price, 10);
  assert.equal(results[1]?.recorded, true);
});
