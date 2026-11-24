import { desc, eq } from "drizzle-orm";
import { readConfig } from "./config";
import { getDb } from "./db";
import { priceHistory, watchedItems, type WatchedItem } from "./db/schema";
import { recordCheck, type CheckResult } from "./record";
import { scrapeProduct } from "./scrapers";

export type { CheckResult };

function errorResult(item: WatchedItem, err: unknown): CheckResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    itemId: item.id,
    title: item.title,
    price: null,
    error: message,
    alerted: false,
    emailed: false,
    emailNote: null,
    recorded: false,
    alertReason: null,
  };
}

export async function runChecks(
  items: WatchedItem[],
  run: (item: WatchedItem) => Promise<CheckResult>
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const item of items) {
    try {
      results.push(await run(item));
    } catch (err) {
      results.push(errorResult(item, err));
    }
  }
  return results;
}

export async function checkItem(item: WatchedItem): Promise<CheckResult> {
  try {
    const scraped = await scrapeProduct({
      url: item.url,
      preferredSize: item.preferredSize,
      nameHint:
        item.notes ||
        (item.title && !/^access denied$/i.test(item.title)
          ? item.title
          : null),
    });
    return await recordCheck(getDb(), item, scraped);
  } catch (err) {
    const result = errorResult(item, err);
    await getDb()
      .update(watchedItems)
      .set({ lastError: result.error ?? null, lastChecked: new Date() })
      .where(eq(watchedItems.id, item.id));
    return result;
  }
}

export async function checkAllActive(): Promise<CheckResult[]> {
  readConfig(process.env);
  const items = await getDb()
    .select()
    .from(watchedItems)
    .where(eq(watchedItems.active, true));

  return runChecks(items, checkItem);
}

export async function getItemHistory(itemId: string, limit = 60) {
  return getDb()
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.itemId, itemId))
    .orderBy(desc(priceHistory.checkedAt))
    .limit(limit);
}
