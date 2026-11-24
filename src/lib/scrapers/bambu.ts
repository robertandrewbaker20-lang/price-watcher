import { parsePrice } from "./parse";
import { withPage } from "./browser";
import { scrapeFromHtml } from "./generic";
import type { ScrapeContext, ScrapeResult } from "./types";

const PRICE_SELECTORS = [
  ".product-price",
  "[data-product-price]",
  ".current-price",
];

export async function scrapeBambu(ctx: ScrapeContext): Promise<ScrapeResult> {
  return withPage(async (page) => {
    await page.goto(ctx.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(3500);

    const html = await page.content();
    const base = scrapeFromHtml(html, ctx.url);
    base.raw = { ...base.raw, source: "bambu" };

    if (base.price == null) {
      for (const selector of PRICE_SELECTORS) {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) continue;
        const priceText = await locator
          .textContent({ timeout: 4_000 })
          .catch(() => null);
        const parsed = parsePrice(priceText);
        if (parsed == null) continue;
        base.price = parsed;
        base.error = undefined;
        break;
      }
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/out of stock|sold out|unavailable/i.test(bodyText)) {
      base.inStock = false;
    } else if (/add to cart|buy now|in stock/i.test(bodyText)) {
      base.inStock = true;
    }

    if (base.price == null && !base.error) {
      base.error = "Could not extract price from Bambu Lab page";
    }

    return base;
  });
}
