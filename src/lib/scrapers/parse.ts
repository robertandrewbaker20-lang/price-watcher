export function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function extractJsonLdProducts(html: string): Record<string, unknown>[] {
  const products: Record<string, unknown>[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const raw = match[1].trim();
      const data = JSON.parse(raw) as unknown;
      collectProducts(data, products);
    } catch {
    }
  }
  return products;
}

function collectProducts(data: unknown, out: Record<string, unknown>[]) {
  if (!data) return;
  if (Array.isArray(data)) {
    for (const item of data) collectProducts(item, out);
    return;
  }
  if (typeof data !== "object") return;
  const obj = data as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.some((t) => String(t).toLowerCase() === "product")) {
    out.push(obj);
  }
  if (obj["@graph"]) collectProducts(obj["@graph"], out);
}

export function priceFromJsonLd(
  product: Record<string, unknown>
): { price: number | null; currency: string; inStock: boolean | null } {
  let price: number | null = null;
  let currency = "USD";
  let inStock: boolean | null = null;

  const offers = product.offers;
  const offerList = Array.isArray(offers)
    ? offers
    : offers
      ? [offers]
      : [];

  for (const offer of offerList) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const p =
      parsePrice(o.price) ??
      parsePrice((o.lowPrice as string) ?? null) ??
      parsePrice(
        o.priceSpecification &&
          typeof o.priceSpecification === "object"
          ? (o.priceSpecification as Record<string, unknown>).price
          : null
      );
    if (p != null) {
      price = p;
      if (typeof o.priceCurrency === "string") currency = o.priceCurrency;
      break;
    }
  }

  for (const offer of offerList) {
    if (!offer || typeof offer !== "object") continue;
    const o = offer as Record<string, unknown>;
    const avail = String(o.availability ?? "").toLowerCase();
    if (avail.includes("instock")) inStock = true;
    else if (avail.includes("outofstock") || avail.includes("soldout"))
      inStock = false;
  }

  return { price, currency, inStock };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function metaContent(html: string, property: string): string | null {
  const key = escapeRegExp(property);
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1]);
  }
  return null;
}

export function titleFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  return decodeHtml(m[1].replace(/\s+/g, " ").trim());
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function normalizeSize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/×/g, "x")
    .replace(/[^a-z0-9x./-]/g, "");
}

export function sizesMatch(a: string, b: string): boolean {
  const na = normalizeSize(a);
  const nb = normalizeSize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
