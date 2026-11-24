import {
  extractJsonLdProducts,
  metaContent,
  parsePrice,
  priceFromJsonLd,
  titleFromHtml,
} from "./parse";
import type { ScrapeResult } from "./types";

export function scrapeFromHtml(html: string, url: string): ScrapeResult {
  const products = extractJsonLdProducts(html);
  const product = products[0];

  let title: string | null = null;
  let price: number | null = null;
  let currency = "USD";
  let inStock: boolean | null = null;
  let image: string | null = null;

  if (product) {
    title =
      (typeof product.name === "string" && product.name) ||
      (typeof product.title === "string" && product.title) ||
      null;
    const offerInfo = priceFromJsonLd(product);
    price = offerInfo.price;
    currency = offerInfo.currency || "USD";
    inStock = offerInfo.inStock;
    if (typeof product.image === "string") image = product.image;
    else if (Array.isArray(product.image) && typeof product.image[0] === "string")
      image = product.image[0];
  }

  if (!title) {
    title =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      titleFromHtml(html);
  }

  if (price == null) {
    price =
      parsePrice(metaContent(html, "product:price:amount")) ??
      parsePrice(metaContent(html, "og:price:amount")) ??
      parsePrice(metaContent(html, "twitter:data1"));
  }

  if (!image) {
    image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  }

  if (price == null) {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const bodyMatch = text.match(/\$\s*([0-9]{1,5}\.[0-9]{2})/);
    if (bodyMatch) price = parsePrice(bodyMatch[1]);
  }

  const ok = price != null;
  return {
    title: title?.slice(0, 300) ?? null,
    price,
    currency: currency.toUpperCase() === "USD" ? "USD" : currency,
    inStock,
    sizeAvailable: null,
    image,
    raw: {
      source: "generic",
      url,
      jsonLdCount: products.length,
    },
    error: ok ? undefined : "Could not extract a price from this page",
  };
}
