#!/usr/bin/env node
const crypto = require("crypto");
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

function extractMetaContent(html, name) {
  return extractFirstMatch(
    html,
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
  );
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function md5Hex(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function deriveFragranticaPassphrase(host) {
  const value = String(host || "www.fragrantica.com").trim() || "www.fragrantica.com";
  const reversed = value.split("").reverse().join("");
  let interleaved = "";
  for (let i = 0; i < value.length; i += 1) {
    interleaved += value[i] + reversed[i];
  }
  let transformed = "";
  for (let i = 0; i < interleaved.length; i += 1) {
    transformed += String.fromCharCode((interleaved.charCodeAt(i) ^ ((7 * i + 13) & 127)) & 127);
  }
  const first = md5Hex(transformed);
  const second = md5Hex(value + first.slice(0, 8));
  return md5Hex(first + second);
}

function evpBytesToKey(passphrase, salt, keyLength = 32, ivLength = 16) {
  const passBuffer = Buffer.isBuffer(passphrase) ? passphrase : Buffer.from(String(passphrase), "utf8");
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt || ""), "hex");
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < keyLength + ivLength) {
    block = crypto.createHash("md5").update(Buffer.concat([block, passBuffer, saltBuffer])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return {
    key: derived.subarray(0, keyLength),
    iv: derived.subarray(keyLength, keyLength + ivLength),
  };
}

function decryptFragranticaPayload(payload, host = "www.fragrantica.com") {
  if (!payload || !payload.ct || !payload.iv || !payload.s) {
    return null;
  }
  const passphrase = deriveFragranticaPassphrase(host);
  const salt = Buffer.from(String(payload.s), "hex");
  const { key } = evpBytesToKey(passphrase, salt, 32, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(String(payload.iv), "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(payload.ct), "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted);
}

function normalizeSimilarPerfumes(data) {
  const items = Array.isArray(data?.similar_perfumes) ? data.similar_perfumes : [];
  return items.map((item) => ({
    similar_id: item.similar_id || item.parfem_id2 || "",
    votes: item.votes || 0,
    vote_yes: item.vote_yes || 0,
    vote_no: item.vote_no || 0,
    perfume: item.perfume
      ? {
          id: item.perfume.id || "",
          name: item.perfume.naslov || item.perfume.name || "",
          designer: item.perfume.dizajner || item.perfume.designer || "",
          slug: item.perfume.slug || "",
          sex: item.perfume.spol || item.perfume.sex || "",
          perfume_url: item.perfume.perfume_url || item.perfume.url || "",
          thumbnail: item.perfume.thumbnail || "",
        }
      : null,
  }));
}

function extractSimilarPerfumes(html, url = "") {
  const match = html.match(/let\s+similar_perfumes\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!match) {
    return { similar_perfumes: [], similar_perfumes_user_votes: [] };
  }

  try {
    const payload = JSON.parse(match[1]);
    const data = decryptFragranticaPayload(payload, new URL(url || "https://www.fragrantica.com").host);
    if (!data) {
      return { similar_perfumes: [], similar_perfumes_user_votes: [] };
    }
    return {
      similar_perfumes: normalizeSimilarPerfumes(data),
      similar_perfumes_user_votes: Array.isArray(data.user_votes) ? data.user_votes : [],
    };
  } catch (error) {
    return { similar_perfumes: [], similar_perfumes_user_votes: [] };
  }
}

function normalizeStatusSummary(summary) {
  const source = summary && typeof summary === "object" ? summary : {};
  const pickBreakdown = (value) => {
    const result = {};
    if (!value || typeof value !== "object") return result;
    for (const [key, entry] of Object.entries(value)) {
      if (
        /^\d+$/.test(key) ||
        ["female", "female_unisex", "unisex", "male_unisex", "male", "have", "had", "want"].includes(key)
      ) {
        result[key] = entry;
      }
    }
    return result;
  };

  return {
    longevity: {
      average: source.longevity_average ?? "",
      sum: source.longevity_sum ?? "",
      max: source.longevity_max ?? "",
      breakdown: pickBreakdown(source.longevity),
    },
    sillage: {
      average: source.sillage_average ?? "",
      sum: source.sillage_sum ?? "",
      max: source.sillage_max ?? "",
      breakdown: pickBreakdown(source.sillage),
    },
    price_value: {
      average: source.price_value_average ?? "",
      sum: source.price_value_sum ?? "",
      max: source.price_value_max ?? "",
      breakdown: pickBreakdown(source.price_value),
    },
    rating: {
      average: source.rating_average ?? "",
      sum: source.rating_sum ?? "",
      max: source.rating_max ?? "",
      breakdown: pickBreakdown(source.rating),
    },
    gender: {
      sum: source.gender_sum ?? "",
      max: source.gender_max ?? "",
      breakdown: pickBreakdown(source.gender),
    },
    relation: {
      sum: source.relation_sum ?? "",
      max: source.relation_max ?? "",
      breakdown: pickBreakdown(source.relation),
    },
    season_scores: [
      { label: "winter", value: source.winter ?? "" },
      { label: "spring", value: source.spring ?? "" },
      { label: "summer", value: source.summer ?? "" },
      { label: "autumn", value: source.autumn ?? "" },
      { label: "day", value: source.day ?? "" },
      { label: "night", value: source.night ?? "" },
    ].filter((item) => item.value !== "" && item.value !== null && item.value !== undefined),
    perfume_id: source.perfume_id ?? "",
    people: source.people ?? "",
  };
}

function extractFragranticaStatus(html, url = "") {
  const match = html.match(/let\s+status\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!match) {
    return { status_summary: {}, user_status: {} };
  }

  try {
    const payload = JSON.parse(match[1]);
    const data = decryptFragranticaPayload(payload, new URL(url || "https://www.fragrantica.com").host);
    if (!data || typeof data !== "object") {
      return { status_summary: {}, user_status: {} };
    }
    return {
      status_summary: normalizeStatusSummary(data.status || {}),
      user_status: data.user_status || {},
    };
  } catch (error) {
    return { status_summary: {}, user_status: {} };
  }
}

function extractFragranticaMeta(html) {
  const metaDescription = extractMetaContent(html, "description") || extractMetaContent(html, "og:description");
  const descriptionMatch = metaDescription.match(
    /^(.+?) by (.+?) is a (.+?) fragrance for (.+?)\.\s*(.+?) was launched in (\d{4})\.\s*The nose behind this fragrance is (.+?)(?:\.\s*$|\.{3}$|$)/i,
  );
  return {
    meta_description: metaDescription || "",
    notes_family: descriptionMatch ? descriptionMatch[3].trim() : "",
    notes_gender: descriptionMatch ? descriptionMatch[4].trim() : "",
    notes_launch_year: descriptionMatch ? descriptionMatch[6].trim() : "",
    notes_nose: descriptionMatch ? descriptionMatch[7].trim() : "",
  };
}

function extractFragrantica(html, url = "") {
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
  const reviews_count = extractFirstMatch(html, /Reviews\s*\(\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*\)/i);
  const metaFields = extractFragranticaMeta(html);

  const whenToWearStart = html.indexOf('tw-rating-card-label">When To Wear</span>');
  const perfRatingStart = whenToWearStart >= 0 ? html.indexOf("Perfume rating", whenToWearStart) : -1;
  const whenToWearSlice =
    whenToWearStart >= 0 && perfRatingStart > whenToWearStart
      ? html.slice(whenToWearStart, perfRatingStart)
      : "";
  const seasonScores = whenToWearSlice
    ? [...whenToWearSlice.matchAll(/<span[^>]*>\s*(winter|spring|summer|fall|day|night)\s*<\/span>[\s\S]*?<span[^>]*>([\d,]+)<\/span>/gi)]
        .map((match) => ({
          label: match[1].trim().toLowerCase(),
          value: match[2].replace(/,/g, ""),
        }))
        .filter((item) => item.label && item.value)
    : [];

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
  const similarPerfumes = extractSimilarPerfumes(html, url);
  const statusFields = extractFragranticaStatus(html, url);

  return {
    ...notes,
    accords,
    rating_value,
    rating_count,
    reviews_count,
    ...metaFields,
    season_scores: seasonScores,
    longevity_value,
    longevity_votes,
    sillage_value,
    sillage_votes,
    ...statusFields,
    ...similarPerfumes,
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
    season_scores: [],
    longevity_value: longevityValue,
    longevity_votes: longevityVotes,
    sillage_value: sillageValue,
    sillage_votes: sillageVotes,
  };
}

function extractPageData(url, html) {
  if (/fragrantica\.com/i.test(url)) {
    return extractFragrantica(html, url);
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
    reviews_count: "",
    meta_description: "",
    notes_family: "",
    notes_gender: "",
    notes_launch_year: "",
    notes_nose: "",
    season_scores: [],
    longevity_value: "",
    longevity_votes: "",
    sillage_value: "",
    sillage_votes: "",
    status_summary: {},
    user_status: {},
    similar_perfumes: [],
    similar_perfumes_user_votes: [],
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
    reviews_count: "",
    meta_description: "",
    notes_family: "",
    notes_gender: "",
    notes_launch_year: "",
    notes_nose: "",
    season_scores: [],
    longevity_value: "",
    longevity_votes: "",
    sillage_value: "",
    sillage_votes: "",
    status_summary: {},
    user_status: {},
    similar_perfumes: [],
    similar_perfumes_user_votes: [],
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
    result.reviews_count = parsed.reviews_count || "";
    result.meta_description = parsed.meta_description || "";
    result.notes_family = parsed.notes_family || "";
    result.notes_gender = parsed.notes_gender || "";
    result.notes_launch_year = parsed.notes_launch_year || "";
    result.notes_nose = parsed.notes_nose || "";
    result.season_scores = parsed.season_scores || [];
    result.longevity_value = parsed.longevity_value || "";
    result.longevity_votes = parsed.longevity_votes || "";
    result.sillage_value = parsed.sillage_value || "";
    result.sillage_votes = parsed.sillage_votes || "";
    result.status_summary = parsed.status_summary || {};
    result.user_status = parsed.user_status || {};
    result.similar_perfumes = parsed.similar_perfumes || [];
    result.similar_perfumes_user_votes = parsed.similar_perfumes_user_votes || [];
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
        reviews_count: "",
        meta_description: "",
        notes_family: "",
        notes_gender: "",
        notes_launch_year: "",
        notes_nose: "",
        season_scores: [],
        longevity_value: "",
        longevity_votes: "",
        sillage_value: "",
        sillage_votes: "",
        status_summary: {},
        user_status: {},
        similar_perfumes: [],
        similar_perfumes_user_votes: [],
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
