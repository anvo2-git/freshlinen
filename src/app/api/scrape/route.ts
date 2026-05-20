import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import fs from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Scrape a Fragrantica perfume page using a headless browser.
 * Cloudflare blocks plain fetch, so we need a real browser to pass the JS challenge.
 *
 * - On Vercel: uses @sparticuz/chromium + puppeteer-core
 * - Locally: uses Playwright's managed Chromium (npx playwright install)
 *
 * Caching layer: before scraping we check the `scraped_perfumes` table in
 * Supabase. On cache miss we scrape, then upsert the result so future calls
 * (by any user) skip the ~10s scrape. Insert requires a signed-in user per
 * RLS; anonymous callers still benefit from reads of what others have scraped.
 *
 * Usage: GET /api/scrape?url=https://www.fragrantica.com/perfume/Brand/Name-123.html
 */

export const maxDuration = 30;
const LOCAL_CACHE_PATH = path.join(process.cwd(), "data", "rag", "scraped-perfumes.jsonl");

// Strip protocol + trailing slash/query so the same perfume normalizes to one key
function normalizeSourceKey(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("?")[0]
    .replace(/\/+$/, "");
}

function appendLocalCacheRow(row: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_CACHE_PATH), { recursive: true });
    fs.appendFileSync(LOCAL_CACHE_PATH, `${JSON.stringify(row)}\n`, "utf8");
  } catch (error) {
    console.warn("Failed to append local scrape cache:", error instanceof Error ? error.message : String(error));
  }
}

function isFragranticaBlocked(title: string, text: string) {
  const combined = `${title}\n${text}`.toLowerCase();
  return /just a moment|performing security verification|security service|cloudflare|are you human|verify you are not a bot|bot detection|unusual traffic/.test(
    combined
  );
}

async function scrapeWithPlaywright(url: string) {
  const { firefox } = await import("playwright");
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Wait a bit for dynamic content (accord bars) to render
    await page.waitForTimeout(3000);
    const title = await page.title().catch(() => "");
    const text = await page.evaluate(() => document.body.textContent ?? "").catch(() => "");
    if (isFragranticaBlocked(title, text)) {
      throw new Error("Fragrantica blocked automated scraping for this page.");
    }
    return await extractData(page);
  } finally {
    await browser.close();
  }
}

async function scrapeWithPuppeteer(url: string) {
  const puppeteer = (await import("puppeteer-core")).default;
  const sparticuzChromium = (await import("@sparticuz/chromium")).default;
  const browser = await puppeteer.launch({
    args: sparticuzChromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    const title = await page.title().catch(() => "");
    const text = await page.evaluate(() => document.body.textContent ?? "").catch(() => "");
    if (isFragranticaBlocked(title, text)) {
      throw new Error("Fragrantica blocked automated scraping for this page.");
    }
    return await extractData(page);
  } finally {
    await browser.close();
  }
}

// Works with both Playwright and Puppeteer page objects (both support .evaluate)
async function extractData(page: { evaluate: (fn: () => unknown) => Promise<unknown> }) {
  return (await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const fullName =
      h1?.textContent?.trim() ?? document.title.split(" - ")[0]?.trim() ?? "";

    const bodyText = document.body.textContent ?? "";
    let gender = "";
    if (bodyText.includes("for women and men")) gender = "for women and men";
    else if (bodyText.includes("for women")) gender = "for women";
    else if (bodyText.includes("for men")) gender = "for men";

    const accords: Record<string, number> = {};
    const styledDivs = document.querySelectorAll('[style*="width"]');
    for (const div of styledDivs) {
      const text = div.textContent?.trim();
      const style = div.getAttribute("style") ?? "";
      const widthMatch = style.match(/width:\s*([\d.]+)/);
      if (
        text &&
        widthMatch &&
        text.length < 30 &&
        !text.includes("\n") &&
        parseFloat(widthMatch[1]) > 5
      ) {
        accords[text.toLowerCase()] = Math.round(parseFloat(widthMatch[1]));
      }
    }

    const ratingEl = document.querySelector('[itemprop="ratingValue"]');
    const rating = ratingEl
      ? parseFloat(ratingEl.getAttribute("content") ?? ratingEl.textContent ?? "0")
      : 0;

    const ratingCountEl = document.querySelector('[itemprop="ratingCount"]');
    const ratingCount = ratingCountEl
      ? parseInt(ratingCountEl.getAttribute("content") ?? ratingCountEl.textContent ?? "0")
      : 0;

    return { fullName, gender, accords, rating, ratingCount };
  })) as { fullName: string; gender: string; accords: Record<string, number>; rating: number; ratingCount: number };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || !url.includes("fragrantica.com/perfume/")) {
    return NextResponse.json(
      { error: "Invalid URL. Must be a Fragrantica perfume page." },
      { status: 400 }
    );
  }

  const sourceKey = normalizeSourceKey(url);
  const supabase = await createServerSupabaseClient();

  // 1. Cache lookup — read-all RLS, works for anonymous and signed-in users.
  const { data: cached } = await supabase
    .from("scraped_perfumes")
    .select("name, brand, gender, rating, rating_count, accord_weights")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (cached) {
    appendLocalCacheRow({
      source_key: sourceKey,
      name: cached.name,
      brand: cached.brand ?? "",
      gender: cached.gender ?? "",
      rating: cached.rating ?? 0,
      rating_count: cached.rating_count ?? 0,
      accord_weights: cached.accord_weights ?? {},
      source_url: url,
      scraped_by: "cache-hit",
      cached: true,
    });
    return NextResponse.json({
      name: cached.name,
      brand: cached.brand ?? "",
      gender: cached.gender ?? "",
      rating: cached.rating ?? 0,
      ratingCount: cached.rating_count ?? 0,
      accords: (cached.accord_weights as Record<string, number>) ?? {},
      cached: true,
    });
  }

  // 2. Cache miss — scrape live
  try {
    const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const data = isVercel
      ? await scrapeWithPuppeteer(url)
      : await scrapeWithPlaywright(url);

    const brandMatch = url.match(/\/perfume\/([^/]+)\//);
    const brand = brandMatch?.[1]?.replace(/-/g, " ") ?? "";

    let name = data.fullName;
    if (brand) name = name.replace(new RegExp(brand, "i"), "").trim();
    if (data.gender) name = name.replace(data.gender, "").trim();

    const finalName = name || data.fullName;

    // 3. Best-effort cache write. RLS requires a Clerk `sub` claim — anonymous
    // scrapes silently fail the insert, which is fine. Race condition with
    // another concurrent scrape is handled by source_key's unique constraint
    // via ignoreDuplicates.
    const { userId } = await auth();
    if (userId) {
      const { error: insertErr } = await supabase
        .from("scraped_perfumes")
        .upsert(
          {
            source_key: sourceKey,
            name: finalName,
            brand: brand || null,
            gender: data.gender || null,
            rating: data.rating || null,
            rating_count: data.ratingCount || null,
            accord_weights: data.accords,
            source_url: url,
            scraped_by: userId,
          },
          { onConflict: "source_key", ignoreDuplicates: true }
        );
      if (insertErr) {
        console.warn("scraped_perfumes upsert failed:", insertErr.message);
      }
    }

    appendLocalCacheRow({
      source_key: sourceKey,
      name: finalName,
      brand: brand || "",
      gender: data.gender || "",
      rating: data.rating || 0,
      rating_count: data.ratingCount || 0,
      accord_weights: data.accords,
      source_url: url,
      scraped_by: userId ?? "",
      cached: false,
    });

    return NextResponse.json({
      name: finalName,
      brand,
      gender: data.gender,
      rating: data.rating,
      ratingCount: data.ratingCount,
      accords: data.accords,
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("Scrape error:", message);
    const status = message.includes("blocked automated scraping") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
