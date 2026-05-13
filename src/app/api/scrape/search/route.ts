import { NextRequest, NextResponse } from "next/server";
import { type FragranticaCandidate } from "@/lib/fragrantica-search";

/**
 * Search Fragrantica for perfumes matching a query.
 * Returns a list of {name, brand, url} results.
 *
 * Usage: GET /api/scrape/search?q=Sauvage+Dior
 */

export const maxDuration = 30;

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Search fetch failed (${res.status}).`);
  }
  return await res.text();
}

function decodeBingRedirectUrl(href: string): string {
  const normalizedHref = href.replace(/&amp;/g, "&");
  const match = normalizedHref.match(/[?&]u=a1([A-Za-z0-9_-]+)/i);
  if (!match?.[1]) return href;
  try {
    const normalized = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    return decoded.startsWith("http") ? decoded : href;
  } catch {
    return href;
  }
}

function canonicalizeFragranticaUrl(url: string): string {
  const normalized = url.replace(/^https?:\/\/[^/]*fragrantica\.[^/]+/i, "https://www.fragrantica.com");
  return normalized.replace(/\/+$/, "");
}

function extractBingFragranticaCandidates(html: string, query: string): FragranticaCandidate[] {
  const candidates: FragranticaCandidate[] = [];
  const seen = new Set<string>();
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) ?? [];

  for (const block of blocks) {
    const redirectMatch = block.match(/href="([^"]*bing\.com\/ck\/a[^"]+)"/i);
    if (!redirectMatch?.[1]) continue;
    const url = canonicalizeFragranticaUrl(decodeBingRedirectUrl(redirectMatch[1]));
    if (!/fragrantica\.[a-z.]+\/perfume\/[^/]+\/[^/]+-\d+\.html/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = (titleMatch?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const brandMatch = url.match(/\/perfume\/([^/]+)\//i);
    const brand = brandMatch?.[1]?.replace(/-/g, " ") ?? "";
    candidates.push({
      name:
        title ||
        url.split("/").pop()?.replace(/-\d+\.html$/i, "").replace(/-/g, " ") ||
        "",
      brand,
      url,
      source: "bing",
    });
  }

  if (!query.trim() || candidates.length < 2) {
    return candidates;
  }

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return candidates
    .map((candidate, index) => {
      const haystack = `${candidate.name} ${candidate.brand} ${candidate.url}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { candidate, index, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map(({ candidate }) => candidate);
}

async function searchWithPlaywright(query: string) {
  const { firefox } = await import("playwright");
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const searchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    return await page.evaluate(() => {
      const results: FragranticaCandidate[] = [];
      // Fragrantica search results are links to perfume pages
      const links = document.querySelectorAll('a[href*="/perfume/"]');
      const seen = new Set<string>();
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        if (!href.includes("/perfume/") || seen.has(href)) continue;
        // Skip non-perfume links (like brand pages)
        if (!href.match(/\/perfume\/[^/]+\/[^/]+-\d+\.html/)) continue;
        seen.add(href);
        const text = link.textContent?.trim() ?? "";
        if (!text || text.length > 100) continue;
        // Extract brand from URL
        const brandMatch = href.match(/\/perfume\/([^/]+)\//);
        const brand = brandMatch?.[1]?.replace(/-/g, " ") ?? "";
        results.push({ name: text, brand, url: href, source: "fragrantica" });
        if (results.length >= 8) break;
      }
      return results;
    });
  } finally {
    await browser.close();
  }
}

async function searchWithBing(query: string) {
  const variants = [
    `${query} Fragrantica`,
    `Fragrantica ${query}`,
    `site:fragrantica.com/perfume/ ${query}`,
  ];

  for (const variant of variants) {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(variant)}`;
    const html = await fetchHtml(searchUrl);
    const results = extractBingFragranticaCandidates(html, query).slice(0, 8);
    if (results.length > 0) return results;
  }

  return [];
}

async function searchWithPuppeteer(query: string) {
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
    const searchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 3000));

    return await page.evaluate(() => {
      const results: FragranticaCandidate[] = [];
      const links = document.querySelectorAll('a[href*="/perfume/"]');
      const seen = new Set<string>();
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        if (!href.includes("/perfume/") || seen.has(href)) continue;
        if (!href.match(/\/perfume\/[^/]+\/[^/]+-\d+\.html/)) continue;
        seen.add(href);
        const text = link.textContent?.trim() ?? "";
        if (!text || text.length > 100) continue;
        const brandMatch = href.match(/\/perfume\/([^/]+)\//);
        const brand = brandMatch?.[1]?.replace(/-/g, " ") ?? "";
        results.push({ name: text, brand, url: href, source: "fragrantica" });
        if (results.length >= 8) break;
      }
      return results;
    });
  } finally {
    await browser.close();
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query too short." },
      { status: 400 }
    );
  }

  try {
    const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    let results = isVercel
      ? await searchWithPuppeteer(query)
      : await searchWithPlaywright(query);

    if (results.length === 0) {
      results = await searchWithBing(query);
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("Search scrape error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
