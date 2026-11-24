import { desc, eq } from "drizzle-orm";
import { buildAlertContent, shouldAlertPriceDrop } from "./alerts";
import { DROP_THRESHOLD_PCT } from "./domain";
import {
  priceCents,
  shouldRecordObservation,
  shouldSendAlert,
  toObservation,
} from "./decide";
import type { AppDatabase } from "./db";
import {
  notifications,
  priceHistory,
  watchedItems,
  type WatchedItem,
} from "./db/schema";
import { sendPriceDropEmail, type EmailSendResult } from "./email";
import type { ScrapeResult } from "./scrapers/types";
import { newId } from "./utils";

function noteTime(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export type CheckResult = {
  itemId: string;
  title: string | null;
  price: number | null;
  error?: string;
  alerted: boolean;
  emailed: boolean;
  emailNote: string | null;
  recorded: boolean;
  alertReason: string | null;
};

export type SendEmail = (params: {
  subject: string;
  text: string;
}) => Promise<EmailSendResult>;

export async function recordCheck(
  database: AppDatabase,
  item: WatchedItem,
  scraped: ScrapeResult,
  options?: { now?: Date; sendEmail?: SendEmail }
): Promise<CheckResult> {
  const now = options?.now ?? new Date();
  const sendEmail = options?.sendEmail ?? sendPriceDropEmail;

  const rows = await database
    .select()
    .from(watchedItems)
    .where(eq(watchedItems.id, item.id));
  const current = rows[0];
  if (!current) {
    throw new Error(`Watched product ${item.id} was not found`);
  }

  const history = await database
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.itemId, current.id))
    .orderBy(desc(priceHistory.checkedAt))
    .limit(1);
  const latestRow = history[0] ?? null;
  const latest = latestRow
    ? toObservation({
        price: latestRow.price,
        currency: latestRow.currency,
        inStock: latestRow.inStock,
        sizeAvailable: latestRow.sizeAvailable,
        error: latestRow.error,
      })
    : null;
  const next = toObservation(scraped);
  const recorded = shouldRecordObservation(latest, next);

  const title =
    scraped.title && !/^access denied$/i.test(scraped.title)
      ? scraped.title.slice(0, 300)
      : current.title;

  if (recorded) {
    await database.insert(priceHistory).values({
      id: newId(),
      itemId: current.id,
      price: next.price,
      currency: next.currency,
      inStock: next.inStock,
      sizeAvailable: next.sizeAvailable,
      checkedAt: now,
      rawData: JSON.stringify(scraped.raw ?? {}),
      error: next.error,
    });
  }

  await database
    .update(watchedItems)
    .set({
      title,
      lastChecked: now,
      lastPrice: next.price != null ? next.price : current.lastPrice,
      lastCurrency: next.price != null ? next.currency : current.lastCurrency,
      lastInStock: next.inStock != null ? next.inStock : current.lastInStock,
      lastSizeAvailable:
        next.sizeAvailable != null
          ? next.sizeAvailable
          : current.lastSizeAvailable,
      lastImage: scraped.image ?? current.lastImage,
      lastError: next.error,
    })
    .where(eq(watchedItems.id, current.id));

  const decision =
    next.price != null && next.error == null
      ? shouldAlertPriceDrop({
          currentPrice: next.price,
          previousPrice: current.lastPrice,
          rule: {
            dropThresholdPct: DROP_THRESHOLD_PCT,
            targetPrice: current.targetPrice,
            preferredSize: current.preferredSize,
          },
          sizeAvailable: next.sizeAvailable,
        })
      : { shouldAlert: false, reason: null, dropPct: null };

  const priorNotes = await database
    .select()
    .from(notifications)
    .where(eq(notifications.itemId, current.id));
  const priorAtPrice =
    next.price == null
      ? undefined
      : priorNotes
          .filter((note) => priceCents(note.price) === priceCents(next.price))
          .sort((a, b) => noteTime(b.sentAt) - noteTime(a.sentAt))[0];

  let alerted = false;
  let emailed = false;
  let emailNote: string | null = null;
  const retryFailed = priorAtPrice?.success === false;
  const freshAlert =
    next.price != null &&
    shouldSendAlert({
      shouldAlert: decision.shouldAlert,
      currentPrice: next.price,
      priorSucceeded: priorAtPrice ? priorAtPrice.success : null,
    });

  if (next.price != null && (retryFailed || freshAlert)) {
    const sizeNote =
      current.preferredSize && next.sizeAvailable === true
        ? `${current.preferredSize} in stock`
        : current.preferredSize;
    const built = buildAlertContent({
      title: title ?? current.notes ?? "Watched product",
      url: current.url,
      currentPrice: next.price,
      previousPrice: current.lastPrice,
      reason: decision.reason ?? "Price drop",
      sizeNote,
    });
    const subject = retryFailed && priorAtPrice ? priorAtPrice.subject : built.subject;
    const text =
      retryFailed && priorAtPrice ? alertBody(priorAtPrice.message) : built.text;

    const retryId =
      priorAtPrice && priorAtPrice.success === false ? priorAtPrice.id : null;
    const noteId = retryId ?? newId();

    if (!retryId) {
      await database.insert(notifications).values({
        id: noteId,
        itemId: current.id,
        type: "price_drop",
        subject,
        message: text,
        sentAt: now,
        success: false,
        price: next.price,
      });
    }

    let send: EmailSendResult;
    try {
      send = await sendEmail({ subject, text });
    } catch (err) {
      send = {
        ok: false,
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const message = send.delivered
      ? text
      : `${text}\n\n[${send.error ?? "email not sent"}]`;
    await database
      .update(notifications)
      .set({
        subject,
        message,
        sentAt: now,
        success: send.ok,
        price: next.price,
      })
      .where(eq(notifications.id, noteId));

    alerted = true;
    emailed = send.delivered;
    emailNote = send.delivered ? null : (send.error ?? "email not sent");
  }

  const alertReason =
    decision.reason ??
    (retryFailed && priorAtPrice ? reasonFromMessage(priorAtPrice.message) : null);

  return {
    itemId: current.id,
    title,
    price: next.price,
    error: next.error ?? undefined,
    alerted,
    emailed,
    emailNote,
    recorded,
    alertReason,
  };
}

function alertBody(message: string): string {
  const cut = message.lastIndexOf("\n\n[");
  return cut === -1 ? message : message.slice(0, cut);
}

function reasonFromMessage(message: string): string | null {
  const line = message.split("\n").find((row) => row.startsWith("Why: "));
  return line ? line.slice("Why: ".length) : null;
}
