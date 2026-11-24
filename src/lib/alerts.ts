import type { AlertRule } from "./domain";
import { formatUsd } from "./utils";

export type AlertDecision = {
  shouldAlert: boolean;
  reason: string | null;
  dropPct: number | null;
};

export function shouldAlertPriceDrop(input: {
  currentPrice: number | null;
  previousPrice: number | null;
  rule: AlertRule;
  sizeAvailable?: boolean | null;
}): AlertDecision {
  const { currentPrice, previousPrice, rule, sizeAvailable } = input;

  if (currentPrice == null) {
    return { shouldAlert: false, reason: null, dropPct: null };
  }

  if (rule.preferredSize && sizeAvailable === false) {
    return {
      shouldAlert: false,
      reason: `Price change ignored. Size ${rule.preferredSize} is not available`,
      dropPct: null,
    };
  }

  let dropPct: number | null = null;
  if (previousPrice != null && previousPrice > 0) {
    dropPct = ((previousPrice - currentPrice) / previousPrice) * 100;
  }

  if (rule.targetPrice != null && currentPrice <= rule.targetPrice) {
    return {
      shouldAlert: true,
      reason: `Hit target ${formatUsd(rule.targetPrice)} (now ${formatUsd(currentPrice)})`,
      dropPct,
    };
  }

  if (dropPct != null && dropPct >= rule.dropThresholdPct) {
    return {
      shouldAlert: true,
      reason: `Dropped ${dropPct.toFixed(1)}% (threshold ${rule.dropThresholdPct}%)`,
      dropPct,
    };
  }

  return { shouldAlert: false, reason: null, dropPct };
}

export function buildAlertContent(params: {
  title: string;
  url: string;
  currentPrice: number;
  previousPrice: number | null;
  reason: string;
  sizeNote?: string | null;
}) {
  const name = params.title || "Watched product";
  const was =
    params.previousPrice != null
      ? ` (was ${formatUsd(params.previousPrice)})`
      : "";
  const size = params.sizeNote ? `Size: ${params.sizeNote}` : null;

  const subject = `Price drop: ${name} now ${formatUsd(params.currentPrice)}`;
  const text = [
    name,
    `Now: ${formatUsd(params.currentPrice)}${was}`,
    `Why: ${params.reason}`,
    size,
    "",
    params.url,
  ]
    .filter((line) => line != null)
    .join("\n");

  return { subject, text };
}
