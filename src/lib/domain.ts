export const DROP_THRESHOLD_PCT = 20;

export type Site = "duluth" | "bambu" | "generic";

export type PriceObservation = {
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
  sizeAvailable: boolean | null;
  error: string | null;
};

export type AlertRule = {
  dropThresholdPct: number;
  targetPrice: number | null;
  preferredSize: string | null;
};
