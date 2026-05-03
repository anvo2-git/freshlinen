#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function argValues(name) {
  const values = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalize(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitNotes(chunk) {
  const text = normalize(chunk)
    .replace(/[•·|]/g, ",")
    .replace(/\s+\band\b\s+/gi, ", ")
    .replace(/\s*;\s*/g, ", ");
  const parts = text
    .split(/,(?!\s*\))/)
    .flatMap((item) => item.split(/\n+/g))
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(parts.map((part) => part.replace(/\s{2,}/g, " ")))];
}

function extractFirstMatch(text, regex, group = 1) {
  const match = text.match(regex);
  return match ? match[group] : "";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractFragrantica(html) {
  const topMatch = html.match(
    /Top notes? are\s+(.+?);\s*middle notes? are\s+(.+?);\s*base notes? are\s+(.+?)(?:<\/p>|[.]\s*<\/p>)/i,
  );
  const notes = topMatch
    ? {
        top_notes: splitNotes(topMatch[1]),
        middle_notes: splitNotes(topMatch[2]),
        base_notes: splitNotes(topMatch[3]),
      }
    : { top_notes: [], middle_notes: [], base_notes: [] };

  const accordsSliceMatch = html.match(
    /<h6[^>]*>\s*main accords\s*<\/h6>([\s\S]*?)<a href="\/accords-search\/\?/i,
  );
  const accords = accordsSliceMatch
    ? [...accordsSliceMatch[1].matchAll(/<span class="truncate">([^<]+)<\/span>/gi)]
        .map((match) => match[1].trim())
        .filter(Boolean)
    : [];

  const rating_value = extractFirstMatch(
    html,
    /itemprop="ratingValue"[^>]*class="font-semibold[^"]*">([\d.]+)<\/span>/i,
  );
  const rating_count = extractFirstMatch(html, /itemprop="ratingCount"\s+content="(\d+)"/i);

  const longevitySliceStart = html.indexOf('data-type="durability"');
  const sillageSliceStart = html.indexOf('data-type="sillage"');
  const bottleSliceStart = html.indexOf('data-type="bottle"');
  const longevitySlice =
    longevitySliceStart >= 0 && sillageSliceStart > longevitySliceStart
      ? html.slice(longevitySliceStart, sillageSliceStart)
      : html;
  const sillageSlice =
    sillageSliceStart >= 0 && bottleSliceStart > sillageSliceStart
      ? html.slice(sillageSliceStart, bottleSliceStart)
      : html;

  const longevity_value = extractFirstMatch(
    longevitySlice,
    /class="pr-0-5 text-lg bold pink">([\d.]+)<\/span>/i,
  );
  const longevity_votes = extractFirstMatch(
    longevitySlice,
    /class="lightgrey text-2xs upper">([\d,]+)\s+Ratings<\/span>/i,
  );
  const sillage_value = extractFirstMatch(
    sillageSlice,
    /class="pr-0-5 text-lg bold purple">([\d.]+)<\/span>/i,
  );
  const sillage_votes = extractFirstMatch(
    sillageSlice,
    /class="lightgrey text-2xs upper">([\d,]+)\s+Ratings<\/span>/i,
  );

  return {
    ...notes,
    accords,
    rating_value,
    rating_count,
    longevity_value,
    longevity_votes,
    sillage_value,
    sillage_votes,
  };
}

function extractParfumo(html) {
  const mainStart = html.indexOf("Main accords");
  const pyramidStart = html.indexOf("Fragrance Pyramid");
  const accordsSlice =
    mainStart >= 0 && pyramidStart > mainStart ? html.slice(mainStart, pyramidStart) : "";
  const accords = accordsSlice
    ? [...accordsSlice.matchAll(/<div class="text-xs grey">([^<]+)<\/div>/gi)]
        .map((match) => match[1].trim())
        .filter(Boolean)
    : [];

  const pyramidStartIndex = html.indexOf("Fragrance Pyramid");
  const perfumerStart = html.indexOf("Perfumer");
  const pyramidSlice =
    pyramidStartIndex >= 0 && perfumerStart > pyramidStartIndex
      ? html.slice(pyramidStartIndex, perfumerStart)
      : "";
  const top_notes = [];
  const middle_notes = [];
  const base_notes = [];
  const pyramidSectionPatterns = [
    { bucket: "t", label: "Top Notes" },
    { bucket: "m", label: "Heart Notes" },
    { bucket: "b", label: "Base Notes" },
  ];
  for (const { bucket, label } of pyramidSectionPatterns) {
    const start = pyramidSlice.indexOf(label);
    if (start < 0) continue;
    const nextStarts = pyramidSectionPatterns
      .filter((item) => item.label !== label)
      .map((item) => pyramidSlice.indexOf(item.label, start + 1))
      .filter((idx) => idx >= 0);
    const end = nextStarts.length ? Math.min(...nextStarts) : pyramidSlice.length;
    const sectionBody = pyramidSlice.slice(start, end);
    const notes = [...sectionBody.matchAll(/alt="([^"]+)"/gi)]
      .map((noteMatch) => noteMatch[1].trim())
      .filter(Boolean);
    if (bucket === "t") top_notes.push(...notes);
    if (bucket === "m") middle_notes.push(...notes);
    if (bucket === "b") base_notes.push(...notes);
  }

  const scentValue = extractFirstMatch(
    html,
    /<div class="text-xs upper blue">Scent<\/div>[\s\S]*?<span class="pr-0-5 text-lg bold blue">([\d.]+)<\/span>/i,
  );
  const scentVotes = extractFirstMatch(
    html,
    /<div class="text-xs upper blue">Scent<\/div>[\s\S]*?<span class="lightgrey text-2xs upper">([\d,]+)\s+Ratings<\/span>/i,
  );
  const longevityValue = extractFirstMatch(
    html,
    /<div class="text-xs upper pink">Longevity<\/div>[\s\S]*?<span class="pr-0-5 text-lg bold pink">([\d.]+)<\/span>/i,
  );
  const longevityVotes = extractFirstMatch(
    html,
    /<div class="text-xs upper pink">Longevity<\/div>[\s\S]*?<span class="lightgrey text-2xs upper">([\d,]+)\s+Ratings<\/span>/i,
  );
  const sillageValue = extractFirstMatch(
    html,
    /<div class="text-xs upper purple">Sillage<\/div>[\s\S]*?<span class="pr-0-5 text-lg bold purple">([\d.]+)<\/span>/i,
  );
  const sillageVotes = extractFirstMatch(
    html,
    /<div class="text-xs upper purple">Sillage<\/div>[\s\S]*?<span class="lightgrey text-2xs upper">([\d,]+)\s+Ratings<\/span>/i,
  );

  return {
    top_notes,
    middle_notes,
    base_notes,
    accords,
    rating_value: scentValue,
    rating_count: scentVotes,
    longevity_value: longevityValue,
    longevity_votes: longevityVotes,
    sillage_value: sillageValue,
    sillage_votes: sillageVotes,
  };
}

function extractPageData(url, html) {
  if (/fragrantica\.com/i.test(url)) {
    return extractFragrantica(html);
  }
  if (/parfumo\.com/i.test(url)) {
    return extractParfumo(html);
  }
  return {
    top_notes: [],
    middle_notes: [],
    base_notes: [],
    accords: [],
    rating_value: "",
    rating_count: "",
    longevity_value: "",
    longevity_votes: "",
    sillage_value: "",
    sillage_votes: "",
  };
}

function sectionFromLines(lines, startLabels, stopLabels) {
  const stopSet = stopLabels.map((label) => label.toLowerCase());
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    const lowered = raw.toLowerCase();
    if (!startLabels.some((label) => lowered === label.toLowerCase() || lowered.startsWith(label.toLowerCase() + " "))) {
      continue;
    }

    const collected = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      const candidateLower = candidate.toLowerCase();
      if (!candidate) {
        continue;
      }
      if (stopSet.some((label) => candidateLower === label || candidateLower.startsWith(label + " "))) {
        break;
      }
      if (/^(main accords|perfumer|ratings|reviews|videos|statements|collection|interesting facts|website of|smell & feel|fragrance pyramid)$/i.test(candidate)) {
        break;
      }
      collected.push(candidate);
    }
    const merged = collected.join(" ");
    if (merged) {
      return splitNotes(merged);
    }
  }
  return [];
}

function extractFromText(text) {
  const normalized = normalize(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const summaryMatch = normalized.match(/Top notes?\s+are\s+(.+?);\s*middle notes?\s+are\s+(.+?);\s*base notes?\s+are\s+(.+?)(?:[.]\s|$)/i);
  if (summaryMatch) {
    return {
      top_notes: splitNotes(summaryMatch[1]),
      middle_notes: splitNotes(summaryMatch[2]),
      base_notes: splitNotes(summaryMatch[3]),
    };
  }

  const top_notes = sectionFromLines(lines, ["Top Notes"], ["Middle Notes", "Heart Notes", "Base Notes"]);
  const middle_notes = sectionFromLines(lines, ["Middle Notes", "Heart Notes"], ["Base Notes"]);
  const base_notes = sectionFromLines(lines, ["Base Notes"], []);
  return { top_notes, middle_notes, base_notes };
}

async function fetchPage(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
  const content = bodyText || (await page.content().catch(() => ""));
  await page.close();
  return {
    title,
    content,
  };
}

async function resolveFragranticaQuery(browser, query) {
  const searchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}`;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const candidates = await page.$$eval('a[href*="/perfume/"]', (links) =>
    links
      .map((link) => ({
        href: link.href || "",
        text: (link.textContent || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((item) => item.href),
  ).catch(() => []);
  await page.close();
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.href)) continue;
    seen.add(candidate.href);
    unique.push(candidate);
  }
  if (!unique.length) {
    return "";
  }
  const tokens = String(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  const scored = unique.map((candidate, index) => {
    const href = candidate.href;
    const lower = href.toLowerCase();
    const text = candidate.text.toLowerCase();
    const tokenScore = tokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0);
    const textScore = tokens.reduce((score, token) => score + (text.includes(token) ? 2 : 0), 0);
    const exactScore = text.includes(query.toLowerCase()) ? 4 : 0;
    return { href, index, score: tokenScore + textScore + exactScore };
  });
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.index - right.index;
  });
  return scored[0].href || "";
}

async function scrapeUrl(browser, url, query = "") {
  const result = {
    url,
    query,
    resolved_url: url,
    source: "",
    title: "",
    top_notes: [],
    middle_notes: [],
    base_notes: [],
    accords: [],
    rating_value: "",
    rating_count: "",
    longevity_value: "",
    longevity_votes: "",
    sillage_value: "",
    sillage_votes: "",
    raw_path: "",
    blocked: false,
    error: "",
  };

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1600 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    const title = await page.title().catch(() => "");
    const text = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
    const html = await page.content().catch(() => "");
    await page.close();

    result.title = normalize(title);
    const repoRoot = process.cwd();
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
    const rawDir = path.join(repoRoot, "data", "raw", "notes", stamp);
    fs.mkdirSync(rawDir, { recursive: true });
    const rawFile = path.join(rawDir, `${slugify(title || url)}.html`);
    fs.writeFileSync(rawFile, html, "utf-8");
    result.raw_path = path.relative(repoRoot, rawFile);

    const lower = `${title}\n${text}`.toLowerCase();
    result.blocked = /access denied|captcha|verify you are human|forbidden|bot detection|unusual traffic|robot/i.test(lower);
    const parsed = extractPageData(url, html || text);
    result.top_notes = parsed.top_notes || [];
    result.middle_notes = parsed.middle_notes || [];
    result.base_notes = parsed.base_notes || [];
    result.accords = parsed.accords || [];
    result.rating_value = parsed.rating_value || "";
    result.rating_count = parsed.rating_count || "";
    result.longevity_value = parsed.longevity_value || "";
    result.longevity_votes = parsed.longevity_votes || "";
    result.sillage_value = parsed.sillage_value || "";
    result.sillage_votes = parsed.sillage_votes || "";
    return result;
  } catch (error) {
    result.error = String(error && error.message ? error.message : error);
    return result;
  }
}

async function main() {
  const urls = [...new Set([...argValues("--url"), ...argValues("-u")])];
  const queries = [...new Set([...argValues("--query"), ...argValues("-q")])];
  const output = argValue("--output", "");
  const quiet = hasFlag("--quiet");
  const useHeadless = !hasFlag("--headed");

  if (!urls.length && !queries.length) {
    console.error(
      "Usage: node scripts/scrape-notes.js --url <perfume-url> [--url <perfume-url>] [--query <brand product>] [--output file.jsonl]",
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: useHeadless });
  const rows = [];
  for (const url of urls) {
    const row = await scrapeUrl(browser, url);
    row.source = /parfumo\.com/i.test(url) ? "parfumo" : /fragrantica\.com/i.test(url) ? "fragrantica" : "unknown";
    rows.push(row);
    if (!quiet) {
      console.log(JSON.stringify(row, null, 2));
    }
  }
  for (const query of queries) {
    const resolvedUrl = await resolveFragranticaQuery(browser, query);
    if (!resolvedUrl) {
      const row = {
        url: "",
        query,
        resolved_url: "",
        source: "fragrantica",
        title: "",
        top_notes: [],
        middle_notes: [],
        base_notes: [],
        accords: [],
        rating_value: "",
        rating_count: "",
        longevity_value: "",
        longevity_votes: "",
        sillage_value: "",
        sillage_votes: "",
        raw_path: "",
        blocked: false,
        error: "no result",
      };
      rows.push(row);
      if (!quiet) {
        console.log(JSON.stringify(row, null, 2));
      }
      continue;
    }
    const row = await scrapeUrl(browser, resolvedUrl, query);
    row.source = /parfumo\.com/i.test(resolvedUrl)
      ? "parfumo"
      : /fragrantica\.com/i.test(resolvedUrl)
        ? "fragrantica"
        : "unknown";
    row.resolved_url = resolvedUrl;
    rows.push(row);
    if (!quiet) {
      console.log(JSON.stringify(row, null, 2));
    }
  }
  await browser.close();

  if (output) {
    const outPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf-8");
  }
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
