import type { Page } from "playwright";
import { withPage } from "./browser";
import { scrapeFromHtml } from "./generic";
import { normalizeSize, sizesMatch } from "./parse";
import type { ScrapeContext, ScrapeResult } from "./types";

type ShopperProduct = {
  id?: string;
  name?: string;
  price?: number;
  currency?: string;
  inventory?: { orderable?: boolean; stockLevel?: number };
  imageGroups?: { images?: { link?: string; disBaseLink?: string }[] }[];
  variants?: {
    name?: string;
    orderable?: boolean;
    price?: number;
    productId?: string;
    variationValues?: Record<string, string>;
  }[];
  variationAttributes?: {
    id?: string;
    name?: string;
    values?: { name?: string; value?: string; orderable?: boolean }[];
  }[];
  slugUrl?: string;
  c_slugUrl?: string;
};

const STOP_WORDS = new Set([
  "mens",
  "men",
  "womens",
  "women",
  "the",
  "and",
  "for",
  "fit",
  "pants",
  "pant",
  "shorts",
  "shirt",
  "shirts",
  "jacket",
  "with",
  "from",
  "size",
  "standard",
  "relaxed",
  "regular",
  "slim",
  "cargo",
  "work",
  "trading",
  "duluth",
  "co",
]);

export async function scrapeDuluth(ctx: ScrapeContext): Promise<ScrapeResult> {
  return withPage(async (page) => {
    const productId = extractProductId(ctx.url);
    const slugHint = extractSlugHint(ctx.url);
    const nameHint = cleanHint(ctx.nameHint);

    await page.goto("https://www.duluthtrading.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(2500);

    const bearer = await captureBearer(page);
    let product: ShopperProduct | null = null;
    let resolvedId = productId;
    let matchScore = 0;

    if (bearer && productId) {
      const direct = await fetchShopperProduct(page, bearer, productId);
      if (direct?.price != null) {
        const score = scoreProduct(direct, { slugHint, nameHint, productId });
        if (!nameHint && !slugHint) {
          product = direct;
          matchScore = score;
        } else if (score >= minAcceptScore(slugHint, nameHint) || score >= 8) {
          product = direct;
          matchScore = score;
        } else {
          product = null;
        }
      }
    }

    if (!product && bearer) {
      const searchQuery =
        nameHint ||
        (slugHint ? slugHint.replace(/-/g, " ") : null) ||
        null;

      if (searchQuery) {
        const found = await resolveProductBySearch(page, bearer, {
          query: searchQuery,
          slugHint,
          nameHint,
          preferId: productId,
        });
        if (found) {
          product = found.product;
          resolvedId = found.id;
          matchScore = found.score;
        }
      }
    }

    if (product && (nameHint || slugHint)) {
      const score =
        matchScore || scoreProduct(product, { slugHint, nameHint, productId });
      if (score < minAcceptScore(slugHint, nameHint)) {
        return {
          title: nameHint || (slugHint ? humanizeSlug(slugHint) : null),
          price: null,
          currency: "USD",
          inStock: null,
          sizeAvailable: null,
          image: null,
          raw: {
            source: "duluth-api",
            requestedId: productId,
            rejectedName: product.name,
            rejectedId: product.id,
            matchScore: score,
            nameHint,
            slugHint,
          },
          error:
            `Could not confidently match "${nameHint || slugHint}" on Duluth. ` +
            `Got "${product.name}" instead. Use a direct product URL ending in the item number (e.g. …-30479.html).`,
        };
      }
    }

    if (product?.price != null) {
      const sizeInfo = checkPreferredSize(product, ctx.preferredSize);
      const image =
        product.imageGroups?.[0]?.images?.[0]?.link ||
        product.imageGroups?.[0]?.images?.[0]?.disBaseLink ||
        null;
      const price = sizeInfo.variantPrice ?? product.price;

      return {
        title: product.name ?? null,
        price,
        currency: (product.currency || "USD").toUpperCase(),
        inStock:
          sizeInfo.sizeAvailable != null
            ? sizeInfo.sizeAvailable
            : Boolean(product.inventory?.orderable),
        sizeAvailable: sizeInfo.sizeAvailable,
        image,
        raw: {
          source: "duluth-api",
          requestedId: productId,
          resolvedId: resolvedId ?? product.id,
          matchScore,
          preferredSize: ctx.preferredSize ?? null,
          sizeNote: sizeInfo.note,
          inventory: product.inventory ?? null,
        },
      };
    }

    await page.goto(ctx.url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(4000);

    const html = await page.content();
    const text = await page.locator("body").innerText().catch(() => "");

    if (/access denied/i.test(text) || /access denied/i.test(html)) {
      return {
        title: nameHint || (slugHint ? humanizeSlug(slugHint) : null),
        price: null,
        currency: "USD",
        inStock: null,
        sizeAvailable: null,
        image: null,
        raw: { source: "duluth", blocked: true },
        error:
          "Duluth blocked the automated browser (Access Denied). Try Check now again, or set a manual price on the card.",
      };
    }

    if (isListingUrl(ctx.url) || isListingPage(text, html)) {
      return {
        title: nameHint || null,
        price: null,
        currency: "USD",
        inStock: null,
        sizeAvailable: null,
        image: null,
        raw: { source: "duluth", listing: true, url: ctx.url },
        error:
          "That looks like a category or search page, not a single product. " +
          "Open the exact Free Rein (or other) product page and paste that URL, " +
          "or put the full product name in Notes and use a product URL.",
      };
    }

    const base = scrapeFromHtml(html, ctx.url);
    base.raw = { ...base.raw, source: "duluth-dom" };

    if (!base.title && (nameHint || slugHint)) {
      base.title = nameHint || humanizeSlug(slugHint!);
    }

    if (
      base.price != null &&
      nameHint &&
      scoreText(base.title || "", nameHint) < 4
    ) {
      return {
        title: nameHint,
        price: null,
        currency: "USD",
        inStock: null,
        sizeAvailable: null,
        image: base.image,
        raw: {
          source: "duluth-dom",
          rejectedTitle: base.title,
          rejectedPrice: base.price,
        },
        error: `Page shows "${base.title}", not "${nameHint}". Paste the exact product URL.`,
      };
    }

    if (ctx.preferredSize) {
      base.sizeAvailable = await checkSizeAvailableDom(page, ctx.preferredSize);
    }

    if (base.price == null) {
      base.error =
        base.error ||
        "Could not extract a price from Duluth. Use a direct product URL or Manual price.";
    }

    return base;
  });
}

function cleanHint(hint?: string | null): string | null {
  if (!hint) return null;
  const t = hint.trim();
  if (!t || /^access denied$/i.test(t)) return null;
  return t;
}

function isListingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path.includes("/search")) return true;
    if (u.searchParams.has("feature") && !/-\d{4,}\.html?$/i.test(path)) {
      return true;
    }
    if (!/-\d{4,}\.html?$/i.test(path) && !path.includes("/product")) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2 && !path.endsWith(".html")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isListingPage(text: string, html: string): boolean {
  if (/items?\s+\d+[-–]\d+\s+of\s+\d+/i.test(text)) return true;
  if ((html.match(/product-tile|product-card|plp-/gi) || []).length > 3) {
    return true;
  }
  return false;
}

function extractProductId(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m =
      path.match(/-(\d{4,})\.html?$/i) ||
      path.match(/\/products?\/(\d{4,})/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractSlugHint(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const file = path.split("/").filter(Boolean).pop() || "";
    if (!file.includes(".html")) return null;
    const slug = file.replace(/\.html?$/i, "").replace(/-\d+$/, "");
    if (slug.split("-").length < 3) return null;
    return slug || null;
  } catch {
    return null;
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function distinctiveTokens(slugHint: string | null, nameHint: string | null) {
  const fromName = nameHint ? tokenize(nameHint) : [];
  const fromSlug = slugHint ? tokenize(slugHint.replace(/-/g, " ")) : [];
  const merged = fromName.length ? fromName : fromSlug;
  return [...new Set(merged)];
}

function scoreText(candidate: string, hint: string): number {
  const cTokens = tokenize(candidate);
  const hTokens = tokenize(hint);
  if (!hTokens.length) return 0;
  let score = 0;
  for (const t of hTokens) {
    if (cTokens.includes(t) || candidate.toLowerCase().includes(t)) {
      score += t.length >= 5 ? 3 : 2;
    }
  }
  const h = hint.toLowerCase();
  const c = candidate.toLowerCase();
  if (h.includes("free rein") && c.includes("free rein")) score += 10;
  if (h.includes("akhg") && c.includes("akhg")) score += 6;
  if (h.includes("dry on the fly") && c.includes("dry on the fly")) score += 10;
  return score;
}

function scoreProduct(
  product: ShopperProduct,
  opts: {
    slugHint: string | null;
    nameHint: string | null;
    productId?: string | null;
  }
): number {
  const blob = `${product.name || ""} ${product.slugUrl || ""} ${product.c_slugUrl || ""} ${product.id || ""}`;
  let score = 0;
  if (opts.nameHint) score += scoreText(blob, opts.nameHint);
  if (opts.slugHint) {
    score += scoreText(blob, opts.slugHint.replace(/-/g, " "));
    if (blob.toLowerCase().includes(opts.slugHint.toLowerCase())) score += 8;
  }
  if (opts.productId && product.id === opts.productId) score += 5;
  return score;
}

function minAcceptScore(
  slugHint: string | null,
  nameHint: string | null
): number {
  const tokens = distinctiveTokens(slugHint, nameHint);
  if (nameHint && /free\s*rein/i.test(nameHint)) return 10;
  if (slugHint && /free-rein/i.test(slugHint)) return 10;
  return Math.max(6, Math.min(12, tokens.length * 2));
}

async function captureBearer(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies("https://www.duluthtrading.com");
  const tokenCookie = cookies.find((c) => c.name === "token");
  if (tokenCookie?.value) {
    const decoded = decodeURIComponent(tokenCookie.value);
    if (decoded.startsWith("Bearer ")) return decoded.slice(7);
    if (decoded.length > 40) return decoded;
  }

  let bearer: string | null = null;
  const onReq = (req: { url: () => string; postData: () => string | null }) => {
    if (!req.url().includes("getProducts")) return;
    const post = req.postData();
    if (!post) return;
    try {
      const data = JSON.parse(post);
      const auth = data?.[0]?.headers?.Authorization as string | undefined;
      if (auth?.startsWith("Bearer ")) bearer = auth.slice(7);
    } catch {
    }
  };
  page.on("request", onReq);

  await page.goto("https://www.duluthtrading.com/search?q=pants", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(4000);
  page.off("request", onReq);

  if (bearer) return bearer;

  const cookies2 = await page.context().cookies("https://www.duluthtrading.com");
  const t2 = cookies2.find((c) => c.name === "token");
  if (t2?.value) {
    const decoded = decodeURIComponent(t2.value);
    if (decoded.startsWith("Bearer ")) return decoded.slice(7);
  }
  return null;
}

async function fetchShopperProduct(
  page: Page,
  bearer: string,
  productId: string
): Promise<ShopperProduct | null> {
  const result = await page.evaluate(
    async (args) => {
      const res = await fetch("/api/ShopperProducts/getProducts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            parameters: {
              locale: "default",
              ids: args.productId,
              allImages: true,
              perPricebook: true,
            },
            headers: { Authorization: `Bearer ${args.bearer}` },
          },
        ]),
      });
      return (await res.json()) as {
        total?: number;
        data?: ShopperProduct[];
      };
    },
    { bearer, productId }
  );

  if (result?.data?.[0]) return result.data[0];
  return null;
}

async function resolveProductBySearch(
  page: Page,
  bearer: string,
  opts: {
    query: string;
    slugHint: string | null;
    nameHint: string | null;
    preferId: string | null;
  }
): Promise<{ product: ShopperProduct; id: string; score: number } | null> {
  const foundIds: string[] = [];

  const onRes = async (res: {
    url: () => string;
    json: () => Promise<unknown>;
  }) => {
    try {
      if (!res.url().includes("getProducts")) return;
      const body = (await res.json()) as {
        data?: { id?: string; slugUrl?: string; name?: string }[];
      };
      for (const p of body.data || []) {
        if (p.id) foundIds.push(p.id);
        const slug = p.slugUrl || "";
        const m = slug.match(/-(\d{4,})\.html?/i);
        if (m) foundIds.push(m[1]);
      }
    } catch {
    }
  };
  page.on("response", onRes);

  await page.goto(
    `https://www.duluthtrading.com/search?q=${encodeURIComponent(opts.query)}`,
    { waitUntil: "domcontentloaded", timeout: 45_000 }
  );
  await page.waitForTimeout(5000);
  page.off("response", onRes);

  const hrefCandidates = await page.evaluate(() => {
    const out: { id: string; href: string; text: string }[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") || "";
      const match = href.match(/-(\d{4,})\.html?/i);
      if (!match) continue;
      const text = (a.textContent || "").trim().slice(0, 120);
      out.push({ id: match[1], href, text });
    }
    return out;
  });

  for (const c of hrefCandidates) foundIds.push(c.id);

  const unique = [...new Set(foundIds)];
  let best: { product: ShopperProduct; id: string; score: number } | null =
    null;

  for (const id of unique.slice(0, 15)) {
    const p = await fetchShopperProduct(page, bearer, id);
    if (!p?.name || p.price == null) continue;
    let score = scoreProduct(p, {
      slugHint: opts.slugHint,
      nameHint: opts.nameHint,
      productId: opts.preferId,
    });
    const link = hrefCandidates.find((h) => h.id === id);
    if (link && opts.nameHint) {
      score += Math.min(
        scoreText(`${link.text} ${link.href}`, opts.nameHint),
        6
      );
    }
    if (!best || score > best.score) {
      best = { product: p, id, score };
    }
  }

  if (!best) return null;
  if (best.score < minAcceptScore(opts.slugHint, opts.nameHint)) return null;
  return best;
}

function parsePreferredWaistInseam(
  preferredSize: string
): { waist: string; inseam: string } | null {
  const n = normalizeSize(preferredSize);
  const m = n.match(/^(\d{2,3})[x/-](\d{2,3})$/);
  if (!m) return null;
  return {
    waist: m[1].padStart(3, "0"),
    inseam: m[2].padStart(3, "0"),
  };
}

function checkPreferredSize(
  product: ShopperProduct,
  preferredSize?: string | null
): {
  sizeAvailable: boolean | null;
  variantPrice: number | null;
  note: string | null;
} {
  if (!preferredSize) {
    return { sizeAvailable: null, variantPrice: null, note: null };
  }

  const parsed = parsePreferredWaistInseam(preferredSize);
  const variants = product.variants || [];

  if (parsed && variants.length) {
    const matches = variants.filter((v) => {
      const w = v.variationValues?.waist;
      const i = v.variationValues?.inseam;
      if (!w || !i) return false;
      return (
        w.replace(/^0+/, "") === parsed.waist.replace(/^0+/, "") &&
        i.replace(/^0+/, "") === parsed.inseam.replace(/^0+/, "")
      );
    });

    if (matches.length === 0) {
      return {
        sizeAvailable: false,
        variantPrice: null,
        note: `Size ${preferredSize} not listed (waist/inseam)`,
      };
    }

    const orderable = matches.some((m) => m.orderable);
    const price =
      matches.find((m) => m.orderable && m.price != null)?.price ??
      matches.find((m) => m.price != null)?.price ??
      null;

    return {
      sizeAvailable: orderable,
      variantPrice: price,
      note: orderable
        ? `Size ${preferredSize} available`
        : `Size ${preferredSize} out of stock`,
    };
  }

  if (variants.length) {
    const matches = variants.filter((v) =>
      sizesMatch(v.name || JSON.stringify(v.variationValues || {}), preferredSize)
    );
    if (matches.length) {
      const orderable = matches.some((m) => m.orderable);
      return {
        sizeAvailable: orderable,
        variantPrice:
          matches.find((m) => m.orderable)?.price ?? matches[0]?.price ?? null,
        note: orderable
          ? `Size ${preferredSize} available`
          : `Size ${preferredSize} out of stock`,
      };
    }
  }

  return {
    sizeAvailable: null,
    variantPrice: null,
    note: `Could not map size ${preferredSize} to variants`,
  };
}

async function checkSizeAvailableDom(
  page: Page,
  preferredSize: string
): Promise<boolean | null> {
  try {
    const candidates = await page.evaluate(() => {
      const out: { text: string; disabled: boolean }[] = [];
      const nodes = document.querySelectorAll(
        'button, [role="option"], [role="radio"], label, option, [class*="size"] button'
      );
      nodes.forEach((el) => {
        const text = (el.textContent || "").trim();
        if (!text || text.length > 40) return;
        if (/add to|cart|wishlist|share|zoom|review/i.test(text)) return;
        const disabled =
          el.hasAttribute("disabled") ||
          el.getAttribute("aria-disabled") === "true" ||
          /unavailable|out.?of.?stock|disabled|sold.?out/i.test(
            el.className + " " + (el.getAttribute("title") || "")
          );
        out.push({ text, disabled });
      });
      return out;
    });

    const matches = candidates.filter((c) => sizesMatch(c.text, preferredSize));
    if (!matches.length) return null;
    return matches.some((m) => !m.disabled);
  } catch {
    return null;
  }
}
