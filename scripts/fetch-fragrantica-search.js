#!/usr/bin/env node
const { chromium } = require("playwright");

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: node scripts/fetch-fragrantica-search.js <query>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  try {
    const url = `https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const results = await page.$$eval('a[href*="/perfume/"]', (links) => {
      const seen = new Set();
      const items = [];
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        if (!href || seen.has(href)) continue;
        seen.add(href);
        items.push({
          href,
          text: (link.textContent || "").replace(/\s+/g, " ").trim(),
        });
      }
      return items;
    });
    process.stdout.write(JSON.stringify(results));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  if (error && error.code === "EPIPE") {
    process.exit(0);
  }
  const message = String(error && error.stack ? error.stack : error);
  if (/bootstrap_check_in|MachPortRendezvousServer|permission denied/i.test(message)) {
    console.error(`LAUNCH_FAILURE: ${message}`);
    process.exit(2);
  }
  console.error(message);
  process.exit(1);
});
