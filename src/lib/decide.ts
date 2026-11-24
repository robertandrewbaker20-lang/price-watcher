import type { PriceObservation } from "./domain";

export function toObservation(input: {
  price: number | null;
  currency?: string | null;
  inStock?: boolean | null;
  sizeAvailable?: boolean | null;
  error?: string | null;
}): PriceObservation {
  const error = input.error?.trim() ?? "";
  let price: number | null = null;
  if (input.price != null && Number.isFinite(input.price)) {
    price = Math.round(input.price * 100) / 100;
  }
  const currency = input.currency?.trim() ?? "";
  return {
    price,
    currency: currency.length > 0 ? currency.toUpperCase() : null,
    inStock: input.inStock ?? null,
    sizeAvailable: input.sizeAvailable ?? null,
    error: error.length > 0 ? error : null,
  };
}

export function priceCents(price: number | null): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  return Math.round(price * 100);
}

export function shouldRecordObservation(
  latest: PriceObservation | null,
  next: PriceObservation
): boolean {
  if (latest == null) return true;
  return !sameObservation(latest, next);
}

function sameObservation(a: PriceObservation, b: PriceObservation): boolean {
  return (
    priceCents(a.price) === priceCents(b.price) &&
    a.currency === b.currency &&
    a.inStock === b.inStock &&
    a.sizeAvailable === b.sizeAvailable &&
    a.error === b.error
  );
}

export function shouldSendAlert(input: {
  shouldAlert: boolean;
  currentPrice: number | null;
  priorSucceeded: boolean | null;
}): boolean {
  if (!input.shouldAlert) return false;
  if (priceCents(input.currentPrice) == null) return false;
  if (input.priorSucceeded == null) return true;
  return !input.priorSucceeded;
}
