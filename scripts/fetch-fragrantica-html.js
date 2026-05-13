#!/usr/bin/env node
const { chromium } = require("playwright");

process.stdout.on("error", (error) => {
  if (error && error.code === "EPIPE") {
    process.exit(0);
  }
});

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node scripts/fetch-fragrantica-html.js <url>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    process.stdout.write(await page.content());
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
