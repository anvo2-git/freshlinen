#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import string
from collections import Counter, defaultdict
from pathlib import Path
from html import unescape


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def strip_tags(value: str) -> str:
    value = re.sub(r"<script.*?</script>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<style.*?</style>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


FRAGRANTICA_HOME = "https://www.fragrantica.com/"
FRAGRANTICA_NEWS = "https://www.fragrantica.com/news/"
DIRECTORY_SOURCES = [
    ("fragrantica_niche_house", "https://www.fragrantica.com/industry/Niche%20Perfume%20House.html"),
    ("fragrantica_niche_designer", "https://www.fragrantica.com/industry/Niche%20perfumes.html"),
    ("perfumemap_brands", "https://perfumemap.co/brands"),
    ("parfinity_brands", "https://www.parfinity.com/en/brand"),
]
FRAGRANTICA_SEARCH_TERMS = [
    *list(string.ascii_lowercase),
    "oud",
    "rose",
    "musk",
    "amber",
    "vanilla",
    "leather",
    "incense",
    "tobacco",
    "patchouli",
    "sandalwood",
    "citrus",
    "jasmine",
    "vetiver",
    "woody",
    "floral",
    "fruity",
    "gourmand",
    "smoky",
    "marine",
    "spicy",
    "powdery",
    "animalic",
    "fresh",
    "oriental",
    "chypre",
    "aldehydic",
    "green",
    "aquatic",
    "sweet",
    "spice",
]


def load_registry(path: Path) -> dict[str, dict[str, str]]:
    registry: dict[str, dict[str, str]] = {}
    if not path.exists():
        return registry
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            brand = (row.get("brand_name") or "").strip()
            if brand:
                registry[slugify(brand)] = row
    return registry


def load_shortlist(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_seeds(path: Path) -> set[str]:
    brands: set[str] = set()
    if not path.exists():
        return brands
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            brand = (row.get("brand_name") or "").strip()
            if brand:
                brands.add(brand)
    return brands


def load_corpus_brands(path: Path) -> dict[str, dict[str, str]]:
    brands: dict[str, dict[str, str]] = {}
    if not path.exists():
        return brands
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            brand = (row.get("brand") or row.get("brand_name") or "").strip()
            if not brand:
                continue
            brand_slug = slugify(brand)
            if not brand_slug:
                continue
            entry = brands.get(brand_slug)
            if not entry:
                brands[brand_slug] = {
                    "brand_name": brand,
                    "corpus_count": "1",
                }
                continue
            entry["corpus_count"] = str(int(entry["corpus_count"]) + 1)
            if brand != entry["brand_name"] and len(brand) > len(entry["brand_name"]):
                entry["brand_name"] = brand
    return brands


def load_official_counts(path: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    if not path.exists():
        return counts
    for file_path in path.glob("*-products.jsonl"):
        brand_slug = slugify(file_path.name.removesuffix("-products.jsonl"))
        if not brand_slug:
            continue
        seen_urls: set[str] = set()
        with file_path.open(encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                source_type = str(row.get("source_type") or "").lower()
                if not source_type.startswith("official"):
                    continue
                url = (row.get("official_url") or row.get("url") or "").strip()
                if not url:
                    fallback = (row.get("product_name") or row.get("name") or "").strip()
                    url = slugify(fallback)
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
        if seen_urls:
            counts[brand_slug] = len(seen_urls)
    return counts


def parse_int(value: str) -> int:
    return int(value) if str(value).isdigit() else 0


def resolve_official_count(
    brand_slug: str,
    registry: dict[str, dict[str, str]],
    official_counts: dict[str, int],
) -> tuple[int, str]:
    if brand_slug in official_counts:
        return official_counts[brand_slug], "official_products"
    reg = registry.get(brand_slug, {})
    count_70k = parse_int(reg.get("count_70k", ""))
    if count_70k:
        return count_70k, "registry_count_70k"
    count_24k = parse_int(reg.get("count_24k", ""))
    if count_24k:
        return count_24k, "registry_count_24k"
    return 0, ""


def classify_coverage(corpus_count: int, official_count: int) -> str:
    if not official_count and not corpus_count:
        return "unknown"
    if not official_count:
        return "unknown"
    if corpus_count * 2 <= official_count:
        return "shallow"
    if corpus_count >= official_count:
        return "deep"
    return "balanced"


def compute_priority_score(
    corpus_count: int,
    official_count: int,
    registry_status: str,
    house_shortlist: str,
) -> int:
    status_bonus = {
        "fetchable": 35,
        "challenge": 22,
        "blocked": 14,
        "unverified": 10,
        "": 0,
    }.get(registry_status.lower(), 6)
    shortlist_bonus = 30 if house_shortlist == "1" else 0
    if official_count:
        shallow_bonus = max(0, official_count - corpus_count)
        shallow_bonus = min(140, shallow_bonus // 2)
        deep_penalty = max(0, corpus_count - official_count)
        deep_penalty = min(120, deep_penalty // 3)
    else:
        shallow_bonus = max(0, 90 - corpus_count)
        deep_penalty = 0
    return max(0, shallow_bonus + status_bonus + shortlist_bonus - deep_penalty)


def finalize_row(
    row: dict[str, str],
    registry: dict[str, dict[str, str]],
    official_counts: dict[str, int],
) -> None:
    brand_slug = row.get("brand_slug", "")
    reg = registry.get(brand_slug, {})
    corpus_count = parse_int(row.get("corpus_count", ""))
    registry_count_70k = parse_int(row.get("registry_count_70k", ""))
    registry_count_24k = parse_int(row.get("registry_count_24k", ""))
    official_count, official_count_source = resolve_official_count(brand_slug, registry, official_counts)
    official_basis = official_count or registry_count_70k or registry_count_24k
    coverage_gap = max(0, official_basis - corpus_count) if official_basis else 0
    coverage_ratio = (corpus_count / official_basis) if official_basis else 0.0
    coverage_state = classify_coverage(corpus_count, official_basis)
    priority_score = compute_priority_score(
        corpus_count,
        official_basis,
        row.get("registry_domain_status", ""),
        row.get("house_shortlist", ""),
    )
    row.update(
        {
            "official_count": str(official_count),
            "official_count_source": official_count_source,
            "coverage_gap": str(coverage_gap),
            "coverage_ratio": f"{coverage_ratio:.2f}",
            "coverage_state": coverage_state,
            "priority_score": str(priority_score),
        }
    )


def fetch_html(url: str) -> str:
    repo_root = Path(__file__).resolve().parent.parent
    helper = repo_root / "scripts" / "fetch-fragrantica-html.js"
    completed = subprocess.run(
        ["node", str(helper), url],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def fetch_search_results(query: str) -> list[dict[str, str]]:
    repo_root = Path(__file__).resolve().parent.parent
    helper = repo_root / "scripts" / "fetch-fragrantica-search.js"
    completed = subprocess.run(
        ["node", str(helper), query],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return []
    return [
        {"href": str(item.get("href", "")), "text": str(item.get("text", ""))}
        for item in data
        if isinstance(item, dict)
    ]


def extract_popular_brands(html: str) -> list[tuple[int, str]]:
    text = strip_tags(html)
    match = re.search(
        r"Most Popular Brands(?P<section>.*?)(Most Popular Perfumes|Search|Notes|Awards|Forum|Fragram|About|$)",
        text,
        flags=re.S | re.I,
    )
    section = match.group("section") if match else text
    brands: list[tuple[int, str]] = []
    for rank, name in re.findall(
        r"(\d{1,3})\.\s+(.+?)(?=\s+\d{1,3}\.\s+|Jump to the top\b|$)",
        section,
        flags=re.S,
    ):
        cleaned = re.sub(r"\s+", " ", name).strip(" .-")
        cleaned = cleaned.replace("©", "").strip()
        if cleaned:
            brands.append((int(rank), cleaned))
    # Remove obvious false positives and duplicates while keeping first rank.
    seen: set[str] = set()
    ordered: list[tuple[int, str]] = []
    for rank, brand in brands:
        slug = slugify(brand)
        if not slug or slug in seen:
            continue
        seen.add(slug)
        ordered.append((rank, brand))
    return ordered


def extract_news_brands(html: str) -> dict[str, list[str]]:
    brands: dict[str, list[str]] = defaultdict(list)
    anchors = re.findall(r'<a[^>]+href="(/news/[^"]+)"[^>]*>(.*?)</a>', html, flags=re.S | re.I)
    for href, anchor_html in anchors:
        title = strip_tags(anchor_html)
        if not title:
            continue

        match = re.match(
            r"^([A-Z][A-Za-z0-9'’&.\-]+(?:\s+[A-Z][A-Za-z0-9'’&.\-]+){0,3})\s+"
            r"(?:Releases|Launches|Introduces|Unveils|Presents|Adds|Celebrates|Debuts)\b",
            title,
        )
        if not match:
            continue

        brand = match.group(1).strip()
        if slugify(brand):
            brands[slugify(brand)].append(f"https://www.fragrantica.com{href}")
    return brands


def extract_search_brands(queries: list[str]) -> dict[str, list[str]]:
    brands: dict[str, list[str]] = defaultdict(list)
    for query in queries:
        try:
            results = fetch_search_results(query)
        except Exception as exc:
            print(f"warning: search fetch failed for {query}: {exc}")
            continue
        for item in results:
            href = item.get("href", "")
            match = re.match(r"^/perfume/([^/]+)/([^/]+)\.html$", href)
            if not match:
                continue
            brand_slug = match.group(1)
            brand = brand_slug.replace("-", " ").strip()
            if slugify(brand):
                brands[slugify(brand)].append(f"https://www.fragrantica.com{href}")
    return brands


def extract_directory_brands(html: str, source_name: str, page_url: str) -> dict[str, list[str]]:
    brands: dict[str, list[str]] = defaultdict(list)
    anchors = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, flags=re.S | re.I)
    stop_texts = {
        "",
        "Search perfumes",
        "Explore notes",
        "Explore accords",
        "Meet perfumers",
        "Brands guide",
        "Featured brands",
        "View perfumes",
        "Free Samples",
        "Discover",
        "Shop",
        "Shop All Brands",
        "Shop Niche",
        "Shop Designer",
        "Shop Middle",
        "Login",
        "Brands Background",
        "Image",
        "Visit House",
    }
    for href, anchor_html in anchors:
        text = strip_tags(anchor_html)
        text = re.sub(r"\s+View perfumes\s+\d+\s*$", "", text, flags=re.I)
        text = re.sub(r"\s+", " ", text).strip(" .-")
        if not text or text in stop_texts:
            continue
        if len(text) < 2:
            continue
        if source_name == "perfumemap_brands" and not re.search(r"[A-Za-z0-9]", text):
            continue
        if source_name == "parfinity_brands" and text in {"#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"}:
            continue
        slug = slugify(text)
        if not slug:
            continue
        full_url = href if href.startswith("http") else f"{page_url.rstrip('/')}{href}" if href.startswith("/") else href
        brands[slug].append(full_url or page_url)
    return brands


def extract_scentoracle_brands(html: str, page_url: str) -> dict[str, list[str]]:
    brands: dict[str, list[str]] = defaultdict(list)
    headings = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", html, flags=re.S | re.I)
    for heading in headings:
        text = strip_tags(heading)
        text = re.sub(r"\s+", " ", text).strip(" .-")
        if not text:
            continue
        if text in {"Perfume House Directory", "Sacred Vessels", "Sanctuaries of Scent", "Filter by Country:"}:
            continue
        if len(text) < 2:
            continue
        slug = slugify(text)
        if slug:
            brands[slug].append(page_url)
    return brands


def build_candidates(
    corpus_brands: dict[str, dict[str, str]],
    registry: dict[str, dict[str, str]],
    official_counts: dict[str, int],
    shortlist: list[dict[str, str]],
    popular_brands: list[tuple[int, str]],
    news_brands: dict[str, list[str]],
    search_brands: dict[str, list[str]],
    seed_brands: set[str],
    mode: str,
) -> list[dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}

    def upsert(brand_name: str, source: str, score: int, extra: dict[str, str] | None = None) -> None:
        brand_slug = slugify(brand_name)
        if not brand_slug:
            return
        row = rows.get(brand_slug)
        if not row:
            row = {
                "brand_name": brand_name,
                "brand_slug": brand_slug,
                "discovery_score": "0",
                "discovery_sources": "",
                "corpus_count": "",
                "fragrantica_rank": "",
                "news_hits": "0",
                "official_url": "",
                "registry_domain_status": "",
                "registry_platform_guess": "",
                "registry_scraper_tier": "",
                "registry_count_70k": "",
                "registry_count_24k": "",
                "priority_notes": "",
                "bucket": "",
                "house_shortlist": "",
                "official_count": "",
                "official_count_source": "",
                "coverage_gap": "",
                "coverage_ratio": "",
                "coverage_state": "",
                "priority_score": "",
            }
            rows[brand_slug] = row
        elif source in {"house_shortlist", "brand_registry"} and brand_name and len(brand_name) >= len(row.get("brand_name", "")):
            row["brand_name"] = brand_name

        row["discovery_score"] = str(int(row["discovery_score"]) + score)
        sources = [part for part in row["discovery_sources"].split(";") if part]
        if source not in sources:
            sources.append(source)
        row["discovery_sources"] = ";".join(sources)
        if extra:
            for key, value in extra.items():
                if value and not row.get(key):
                    row[key] = value

    for brand_slug, info in corpus_brands.items():
        brand = info.get("brand_name") or brand_slug.replace("-", " ").title()
        count = int(info.get("corpus_count", "0")) if str(info.get("corpus_count", "")).isdigit() else 0
        score = min(250, max(1, count * 2))
        upsert(
            brand,
            "corpus",
            score,
            {"corpus_count": str(count)},
        )

    for rank, brand in popular_brands:
        upsert(
            brand,
            "fragrantica_home",
            max(1, 120 - rank),
            {"fragrantica_rank": str(rank)},
        )

    for brand_slug, urls in news_brands.items():
        brand = registry.get(brand_slug, {}).get("brand_name") or brand_slug.replace("-", " ").title()
        upsert(brand, "fragrantica_news", 80 + len(urls), {"news_hits": str(len(urls))})

    for brand_slug, urls in search_brands.items():
        if brand_slug in registry:
            brand = registry[brand_slug].get("brand_name") or brand_slug.replace("-", " ").title()
        else:
            brand = brand_slug.replace("-", " ").title()
        upsert(
            brand,
            "fragrantica_search",
            70 + len(urls),
            {"news_hits": str(len(urls))},
        )

    for brand in seed_brands:
        upsert(brand, "latest_release_seeds", 60)

    for house in shortlist:
        brand = (house.get("brand_name") or "").strip()
        if not brand:
            continue
        upsert(
            brand,
            "house_shortlist",
            140,
            {
                "official_url": house.get("official_url", ""),
                "priority_notes": house.get("priority_notes", ""),
                "bucket": house.get("bucket", "niche"),
                "house_shortlist": "1",
            },
        )

    for brand_slug, reg in registry.items():
        brand = reg.get("brand_name", brand_slug)
        score = 20
        if (reg.get("domain_status") or "").lower() == "fetchable":
            score += 35
        elif (reg.get("domain_status") or "").lower() == "challenge":
            score += 10
        upsert(
            brand,
            "brand_registry",
            score,
            {
                "official_url": reg.get("official_url", ""),
                "registry_domain_status": reg.get("domain_status", ""),
                "registry_platform_guess": reg.get("platform_guess", ""),
                "registry_scraper_tier": reg.get("scraper_tier", ""),
                "registry_count_70k": reg.get("count_70k", ""),
                "registry_count_24k": reg.get("count_24k", ""),
                "priority_notes": reg.get("priority_notes", ""),
            },
        )

    for row in rows.values():
        finalize_row(row, registry, official_counts)
        rank = int(row["fragrantica_rank"]) if row["fragrantica_rank"] else 9999
        count_70k = parse_int(row["registry_count_70k"])
        sources = row["discovery_sources"].split(";")
        corpus_count = parse_int(row["corpus_count"])
        if mode == "niche" and row.get("house_shortlist") == "1":
            bucket = "niche"
        elif mode == "niche" and row["registry_domain_status"] in {"fetchable", "challenge"} and count_70k > 0 and count_70k < 250:
            bucket = "niche"
        elif mode == "niche" and ("fragrantica_news" in sources or "fragrantica_search" in sources or "latest_release_seeds" in sources):
            bucket = "niche"
        elif mode == "niche" and row["fragrantica_rank"] and rank <= 20:
            bucket = "niche"
        elif mode == "mainstream" and (row["fragrantica_rank"] and rank <= 100 or count_70k >= 150 or corpus_count >= 100):
            bucket = "mainstream"
        elif mode == "mainstream" and ("fragrantica_home" in sources or "fragrantica_news" in sources or "fragrantica_search" in sources):
            bucket = "mainstream"
        elif mode == "corpus" and row.get("house_shortlist") == "1":
            bucket = "niche"
        elif mode == "corpus" and corpus_count >= 100:
            bucket = "mainstream"
        elif mode == "corpus" and corpus_count >= 20 and (row["registry_domain_status"] in {"fetchable", "challenge"} or "fragrantica_news" in sources or "fragrantica_search" in sources):
            bucket = "regional"
        elif mode == "corpus" and corpus_count >= 10 and ("fragrantica_search" in sources or "brand_registry" in sources):
            bucket = "niche"
        elif mode == "corpus" and corpus_count >= 5 and ("brand_registry" in sources or "latest_release_seeds" in sources):
            bucket = "private_label"
        elif mode == "niche" and (
            row.get("house_shortlist") == "1"
            or "fragrantica_niche_house" in sources
            or "fragrantica_niche_designer" in sources
            or "brand_directory" in sources
            or "fragrantica_search" in sources
        ):
            bucket = "niche"
        else:
            bucket = "other"
        row["bucket"] = bucket

    def sort_key(row: dict[str, str]) -> tuple[int, int, int, str]:
        priority_score = parse_int(row.get("priority_score", ""))
        if not priority_score:
            priority_score = compute_priority_score(
                parse_int(row.get("corpus_count", "")),
                parse_int(row.get("official_count", "")),
                row.get("registry_domain_status", ""),
                row.get("house_shortlist", ""),
            )
        rank = int(row["fragrantica_rank"]) if row["fragrantica_rank"] else 9999
        return (-priority_score, -int(row["discovery_score"]), rank, row["brand_name"].lower())

    return sorted(rows.values(), key=sort_key)


def select_niche_only(rows: list[dict[str, str]], limit: int = 500) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        if row.get("bucket") != "niche":
            continue
        slug = row["brand_slug"]
        if slug in seen:
            continue
        selected.append(row)
        seen.add(slug)
        if len(selected) >= limit:
            break
    return selected


def select_mainstream_only(rows: list[dict[str, str]], limit: int = 150) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        if row.get("bucket") != "mainstream":
            continue
        slug = row["brand_slug"]
        if slug in seen:
            continue
        selected.append(row)
        seen.add(slug)
        if len(selected) >= limit:
            break
    return selected


def select_corpus_only(rows: list[dict[str, str]], limit: int = 500) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        if row.get("bucket") == "other":
            continue
        slug = row["brand_slug"]
        if slug in seen:
            continue
        selected.append(row)
        seen.add(slug)
        if len(selected) >= limit:
            break
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--houses-file", default="data/house-shortlist.csv")
    parser.add_argument("--mode", choices=["niche", "mainstream", "corpus"], default="niche")
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    registry_path = repo_root / "data" / "brand-registry.csv"
    seed_path = repo_root / "data" / "latest-release-seeds.csv"
    corpus_path = repo_root / "data" / "rag" / "perfume-documents.jsonl"
    official_products_path = repo_root / "data" / "official-products"
    houses_path = repo_root / args.houses_file
    out_csv = repo_root / "data" / "house-candidates.csv"
    out_json = repo_root / "data" / "house-candidates.json"

    corpus_brands = load_corpus_brands(corpus_path)
    registry = load_registry(registry_path)
    official_counts = load_official_counts(official_products_path)
    shortlist = load_shortlist(houses_path)
    seed_brands = load_seeds(seed_path)

    try:
        popular_html = fetch_html(FRAGRANTICA_HOME)
        popular_brands = extract_popular_brands(popular_html)
    except Exception as exc:
        print(f"warning: popular brands fetch failed: {exc}")
        popular_brands = []

    try:
        news_html = fetch_html(FRAGRANTICA_NEWS)
        news_brands = extract_news_brands(news_html)
    except Exception as exc:
        print(f"warning: news fetch failed: {exc}")
        news_brands = {}

    directory_brands: dict[str, list[str]] = defaultdict(list)
    for source_name, url in DIRECTORY_SOURCES:
        try:
            html = fetch_html(url)
        except Exception as exc:
            print(f"warning: directory fetch failed for {source_name}: {exc}")
            continue
        if source_name == "scentoracle_houses":
            extracted = extract_scentoracle_brands(html, url)
        else:
            extracted = extract_directory_brands(html, source_name, url)
        for brand_slug, urls in extracted.items():
            directory_brands[brand_slug].extend(urls)

    search_queries = FRAGRANTICA_SEARCH_TERMS
    search_brands = extract_search_brands(search_queries)

    candidates = build_candidates(
        corpus_brands,
        registry,
        official_counts,
        shortlist,
        popular_brands,
        news_brands,
        search_brands,
        seed_brands,
        args.mode,
    )
    for brand_slug, urls in directory_brands.items():
        if brand_slug in registry:
            brand = registry[brand_slug].get("brand_name") or brand_slug.replace("-", " ").title()
        else:
            brand = brand_slug.replace("-", " ").title()
        row = {
            "brand_name": brand,
            "brand_slug": brand_slug,
            "discovery_score": str(90 + len(urls)),
            "discovery_sources": "brand_directory",
            "corpus_count": str(corpus_brands.get(brand_slug, {}).get("corpus_count", "")),
            "fragrantica_rank": "",
            "news_hits": "0",
            "official_url": urls[0] if urls else "",
            "registry_domain_status": registry.get(brand_slug, {}).get("domain_status", ""),
            "registry_platform_guess": registry.get(brand_slug, {}).get("platform_guess", ""),
            "registry_scraper_tier": registry.get(brand_slug, {}).get("scraper_tier", ""),
            "registry_count_70k": registry.get(brand_slug, {}).get("count_70k", ""),
            "registry_count_24k": registry.get(brand_slug, {}).get("count_24k", ""),
            "priority_notes": registry.get(brand_slug, {}).get("priority_notes", ""),
            "bucket": "",
            "house_shortlist": "1" if any(slugify((house.get("brand_name") or "")) == brand_slug for house in shortlist) else "",
            "official_count": "",
            "official_count_source": "",
            "coverage_gap": "",
            "coverage_ratio": "",
            "coverage_state": "",
            "priority_score": "",
        }
        finalize_row(row, registry, official_counts)
        candidates.append(row)
    if args.mode == "niche":
        selected = select_niche_only(candidates, limit=args.limit)
    elif args.mode == "mainstream":
        selected = select_mainstream_only(candidates, limit=args.limit)
    else:
        selected = select_corpus_only(candidates, limit=args.limit)

    if args.mode == "niche" and len(selected) < args.limit:
        # If the niche bucket is still sparse, keep the strongest non-other houses
        # instead of stopping early. This keeps the queue broad enough for a fanout.
        selected = select_corpus_only(candidates, limit=args.limit)

    with out_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "brand_slug",
                "discovery_score",
                "discovery_sources",
                "corpus_count",
                "fragrantica_rank",
                "news_hits",
                "official_url",
                "registry_domain_status",
                "registry_platform_guess",
                "registry_scraper_tier",
                "registry_count_70k",
                "registry_count_24k",
                "priority_notes",
                "bucket",
                "house_shortlist",
                "official_count",
                "official_count_source",
                "coverage_gap",
                "coverage_ratio",
                "coverage_state",
                "priority_score",
            ],
        )
        writer.writeheader()
        writer.writerows(selected)

    out_json.write_text(json.dumps(candidates, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {len(selected)} {args.mode} house candidates to {out_csv}")
    bucket_counts = Counter(row.get("bucket", "") for row in selected)
    print("Bucket mix: " + ", ".join(f"{bucket}={count}" for bucket, count in sorted(bucket_counts.items())))


if __name__ == "__main__":
    main()
