import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parsePrice } from "../src/lib/scrapers/parse";
import { scrapeFromHtml } from "../src/lib/scrapers/generic";
import { detectSite } from "../src/lib/sites";

test("parsePrice reads a dollar amount and ignores empty text", () => {
  assert.equal(parsePrice("$1,299.00"), 1299);
  assert.equal(parsePrice("48.5"), 48.5);
  assert.equal(parsePrice(0), 0);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("free"), null);
});

test("scrapeFromHtml prefers JSON-LD over other dollar amounts", async () => {
  const html = await readFile(
    path.join(process.cwd(), "tests/fixtures/trail-wool-shirt.html"),
    "utf8"
  );
  const product = scrapeFromHtml(html, "https://example.com/products/trail-wool-shirt");

  assert.equal(product.title, "Trail Wool Shirt");
  assert.equal(product.price, 48);
  assert.equal(product.currency, "USD");
  assert.equal(product.inStock, true);
  assert.equal(product.image, "https://example.com/shirt.jpg");
  assert.equal(product.error, undefined);
});

test("scrapeFromHtml reads a meta price when JSON-LD is missing", () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Camp Mug" />
      <meta property="product:price:amount" content="12.50" />
    </head><body><p>Was $40</p></body></html>
  `;
  const product = scrapeFromHtml(html, "https://example.com/products/camp-mug");
  assert.equal(product.title, "Camp Mug");
  assert.equal(product.price, 12.5);
  assert.equal(product.error, undefined);
});

test("scrapeFromHtml ignores a dollar amount that has no cents", () => {
  const html = "<html><head><title>Notebook</title></head><body><p>Model $12</p></body></html>";
  const product = scrapeFromHtml(html, "https://example.com/products/notebook");
  assert.equal(product.price, null);
  assert.match(product.error ?? "", /Could not extract a price/);
});

test("scrapeFromHtml skips a broken JSON-LD block and still reads the title", () => {
  const html = `
    <html><head>
      <script type="application/ld+json">{ not json</script>
      <title>Field Cap</title>
    </head><body><p>$19.00</p></body></html>
  `;
  const product = scrapeFromHtml(html, "https://example.com/products/field-cap");
  assert.equal(product.title, "Field Cap");
  assert.equal(product.price, 19);
});

test("detectSite only matches the real store hosts", () => {
  assert.equal(detectSite("https://www.duluthtrading.com/mens-pants-30479.html"), "duluth");
  assert.equal(detectSite("https://store.bambulab.com/products/pla"), "bambu");
  assert.equal(detectSite("https://example.com/products/trail-wool-shirt"), "generic");
  assert.equal(detectSite("https://notduluthtrading.com/sale"), "generic");
  assert.equal(detectSite("not a url"), "generic");
});
