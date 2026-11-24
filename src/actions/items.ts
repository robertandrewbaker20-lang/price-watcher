"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkAllActive, checkItem, getItemHistory } from "@/lib/check";
import { getDb } from "@/lib/db";
import { watchedItems } from "@/lib/db/schema";
import { recordCheck } from "@/lib/record";
import { detectSite } from "@/lib/sites";
import { formatUsd, newId } from "@/lib/utils";

function deliveryNote(result: {
  emailed: boolean;
  emailNote: string | null;
}): string {
  if (result.emailed) return "Email sent.";
  if (
    result.emailNote === "dry-run" ||
    result.emailNote === "RESEND_API_KEY not set"
  ) {
    return "Logged. Email not sent.";
  }
  return `Email failed. ${result.emailNote ?? "Unknown email error."}`;
}

const addSchema = z.object({
  url: z.string().url("Enter a valid product URL"),
  notes: z.string().max(500).optional().or(z.literal("")),
  preferredSize: z.string().max(40).optional().or(z.literal("")),
  targetPrice: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => {
      if (!v) return null;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }),
});

export type ActionState = {
  ok: boolean;
  message: string;
};

export async function addItem(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const parsed = addSchema.safeParse({
    url: formData.get("url"),
    notes: formData.get("notes") ?? "",
    preferredSize: formData.get("preferredSize") ?? "",
    targetPrice: formData.get("targetPrice") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { url, notes, preferredSize, targetPrice } = parsed.data;
  const id = newId();

  await getDb().insert(watchedItems).values({
    id,
    url,
    notes: notes || null,
    preferredSize: preferredSize || null,
    targetPrice,
    active: true,
    createdAt: new Date(),
    title: null,
  });

  const item = (
    await getDb().select().from(watchedItems).where(eq(watchedItems.id, id))
  )[0];

  let detail = "First price check complete.";
  try {
    const result = await checkItem(item);
    if (result.error) {
      detail = `Saved. First check failed: ${result.error}`;
    } else if (result.alerted) {
      detail = `${result.alertReason ?? "Alert logged."} ${deliveryNote(result)}`;
    } else if (result.price != null) {
      detail = `Price is ${formatUsd(result.price)}.`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await getDb()
      .update(watchedItems)
      .set({ lastError: message })
      .where(eq(watchedItems.id, id));
    detail = `Saved. First check failed: ${message}`;
  }

  revalidatePath("/");
  const site = detectSite(url);
  const siteNote = site === "generic" ? "" : ` (${site})`;
  return {
    ok: true,
    message: `Added${siteNote}. ${detail}`,
  };
}

export async function deleteItem(itemId: string): Promise<ActionState> {
  await getDb().delete(watchedItems).where(eq(watchedItems.id, itemId));
  revalidatePath("/");
  return { ok: true, message: "Removed" };
}

export async function toggleItem(
  itemId: string,
  active: boolean
): Promise<ActionState> {
  await getDb()
    .update(watchedItems)
    .set({ active })
    .where(eq(watchedItems.id, itemId));
  revalidatePath("/");
  return { ok: true, message: active ? "Resumed" : "Paused" };
}

export async function checkItemNow(itemId: string): Promise<ActionState> {
  const item = (
    await getDb().select().from(watchedItems).where(eq(watchedItems.id, itemId))
  )[0];
  if (!item) return { ok: false, message: "Item not found" };

  const result = await checkItem(item);
  revalidatePath("/");

  if (result.error) {
    return { ok: false, message: result.error };
  }
  if (result.alerted) {
    return {
      ok: true,
      message: `Checked. ${result.alertReason ?? "Alert"}. ${deliveryNote(result)}`,
    };
  }
  if (!result.recorded && result.price != null) {
    return {
      ok: true,
      message: `Checked. Price unchanged at ${formatUsd(result.price)}.`,
    };
  }
  return {
    ok: true,
    message: `Checked. ${result.title ?? "Item"} is ${formatUsd(result.price)}.`,
  };
}

export async function checkAllNow(): Promise<ActionState> {
  try {
    const results = await checkAllActive();
    revalidatePath("/");
    const errors = results.filter((r) => r.error).length;
    const alerts = results.filter((r) => r.alerted).length;
    return {
      ok: errors === 0,
      message: `Checked ${results.length} item(s). Alerts: ${alerts}. Errors: ${errors}.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

export async function setManualPrice(
  itemId: string,
  priceRaw: string
): Promise<ActionState> {
  const price = Number.parseFloat(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: "Enter a valid price" };
  }

  const item = (
    await getDb().select().from(watchedItems).where(eq(watchedItems.id, itemId))
  )[0];
  if (!item) return { ok: false, message: "Item not found" };

  const result = await recordCheck(getDb(), item, {
    title: item.title,
    price,
    currency: "USD",
    inStock: item.lastInStock,
    sizeAvailable: item.lastSizeAvailable,
    image: item.lastImage,
    raw: { source: "manual" },
  });

  revalidatePath("/");
  if (result.alerted) {
    return {
      ok: true,
      message: `Manual price ${formatUsd(price)} saved. ${result.alertReason ?? "Alert"}. ${deliveryNote(result)}`,
    };
  }
  return {
    ok: true,
    message: result.recorded
      ? `Manual price ${formatUsd(price)} saved.`
      : `Manual price ${formatUsd(price)} already recorded.`,
  };
}

export async function listItemsWithHistory() {
  const items = await getDb()
    .select()
    .from(watchedItems)
    .orderBy(desc(watchedItems.createdAt));
  const withHistory = await Promise.all(
    items.map(async (item) => {
      const history = await getItemHistory(item.id, 40);
      return { item, history: history.reverse() };
    })
  );
  return withHistory;
}
