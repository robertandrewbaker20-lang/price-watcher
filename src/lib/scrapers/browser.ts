import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readConfig } from "../config";

let browserPromise: Promise<Browser> | null = null;

const launchArgs = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
];

export function isTransientScrapeError(message: string): boolean {
  return /timeout|timed out|net::|ECONNRESET|ECONNREFUSED|ENOTFOUND|Target (page|closed)|Navigation|ERR_/i.test(
    message
  );
}

async function launchBrowser(): Promise<Browser> {
  const { pwChannel } = readConfig(process.env);
  const tryChrome =
    pwChannel === "chrome" ||
    (pwChannel == null && process.env.NODE_ENV !== "production");

  const browser = await launchChannel(tryChrome, pwChannel === "chrome");
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

async function launchChannel(tryChrome: boolean, chromeOnly: boolean): Promise<Browser> {
  if (tryChrome) {
    try {
      return await chromium.launch({
        channel: "chrome",
        headless: true,
        args: launchArgs,
      });
    } catch (err) {
      if (chromeOnly) throw err;
    }
  }

  return chromium.launch({
    headless: true,
    args: launchArgs,
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const pending = launchBrowser().then(
      (browser) => browser,
      (err: unknown) => {
        if (browserPromise === pending) browserPromise = null;
        throw err;
      }
    );
    browserPromise = pending;
  }
  return browserPromise;
}

export async function newStealthContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  context.setDefaultNavigationTimeout(45_000);
  context.setDefaultTimeout(15_000);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await newStealthContext();
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}

export async function fetchRenderedHtml(
  url: string,
  waitMs = 2500
): Promise<{ html: string; finalUrl: string }> {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(waitMs);
    const html = await page.content();
    return { html, finalUrl: page.url() };
  });
}

export async function closeBrowser() {
  const pending = browserPromise;
  if (!pending) return;
  browserPromise = null;
  const browser = await pending;
  await browser.close();
}
