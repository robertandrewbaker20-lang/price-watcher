export type ScrapeResult = {
  title: string | null;
  price: number | null;
  currency: string;
  inStock: boolean | null;
  sizeAvailable: boolean | null;
  image: string | null;
  raw: Record<string, unknown>;
  error?: string;
};

export type ScrapeContext = {
  url: string;
  preferredSize?: string | null;
  nameHint?: string | null;
};
