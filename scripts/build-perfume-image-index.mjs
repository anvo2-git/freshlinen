import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  path.join(ROOT, "data", "official-products"),
  path.join(ROOT, "data", "retailer-products"),
];
const OUTPUT_PATH = path.join(ROOT, "public", "data", "perfume-images.json");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  return String(value || "")
    .replace(/\s*(?:for women and men|for men and women|for women|for men)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildKeys(row) {
  const brand = cleanName(row.brand_name || row.brand || "");
  const productName = cleanName(row.product_name || row.name || "");
  const collection = cleanName(row.collection || "");
  const matchHint = cleanName(row.match_hint || "");
  const alternateName = cleanName(row.extra?.alternate_name || "");
  const handle = cleanName(row.extra?.handle || "");

  const candidates = [productName, collection, matchHint, alternateName, handle]
    .filter(Boolean)
    .flatMap((value) => [
      `${normalize(brand)}|${normalize(value)}`,
      `${normalize(brand)}|${normalize(`${brand} ${value}`)}`,
    ]);

  return new Set(candidates.filter(Boolean));
}

async function resolveImage(row) {
  const images = row.extra?.images || row.images || [];
  if (Array.isArray(images) && images.length > 0) {
    return String(images[0]).startsWith("//") ? `https:${images[0]}` : String(images[0]);
  }

  const url = row.official_url || row.url;
  if (!url || typeof url !== "string") return null;

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; FreshlinenImageBot/1.0)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const og =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1];

    if (og) return og.startsWith("//") ? `https:${og}` : og;

  } catch {
    return null;
  }

  return null;
}

async function main() {
  const rows = [];
  for (const dir of SOURCE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".jsonl")) continue;
      rows.push(...readJsonl(path.join(dir, file)));
    }
  }

  const map = {};
  let fetched = 0;
  let cached = 0;
  for (const row of rows) {
    const keys = buildKeys(row);
    if (keys.size === 0) continue;

    const image = await resolveImage(row);
    if (!image) continue;

    for (const key of keys) {
      if (!map[key]) map[key] = image;
    }

    const fromCache = (row.extra?.images || row.images || []).length > 0;
    if (fromCache) cached++;
    else fetched++;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(map));
  console.log(`wrote ${Object.keys(map).length} image keys (${cached} cached, ${fetched} fetched)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
