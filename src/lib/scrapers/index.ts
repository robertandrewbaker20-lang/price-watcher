import { scrapeBambu } from "./bambu";
import { fetchRenderedHtml, isTransientScrapeError } from "./browser";
import { scrapeDuluth } from "./duluth";
import { scrapeFromHtml } from "./generic";
import { detectSite } from "../sites";
import type { ScrapeContext, ScrapeResult } from "./types";

export type { ScrapeResult, ScrapeContext };
export { detectSite };

async function scrapeOnce(ctx: ScrapeContext): Promise<ScrapeResult> {
  const site = detectSite(ctx.url);
  try {
    if (site === "duluth") return await scrapeDuluth(ctx);
    if (site === "bambu") return await scrapeBambu(ctx);

    const { html } = await fetchRenderedHtml(ctx.url);
    const result = scrapeFromHtml(html, ctx.url);
    result.raw = { ...result.raw, source: "generic" };
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      title: null,
      price: null,
      currency: "USD",
      inStock: null,
      sizeAvailable: null,
      image: null,
      raw: { source: site, url: ctx.url },
      error: message,
    };
  }
}

export async function scrapeProduct(ctx: ScrapeContext): Promise<ScrapeResult> {
  const first = await scrapeOnce(ctx);
  if (!first.error || !isTransientScrapeError(first.error)) return first;
  return scrapeOnce(ctx);
}
