#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from contextlib import closing
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
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


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with closing(urlopen(request, timeout=30)) as response:
            return response.read().decode("utf-8", errors="ignore")
    except HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error for {url}: {exc.reason}") from exc


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


def build_candidates(
    registry: dict[str, dict[str, str]],
    popular_brands: list[tuple[int, str]],
    news_brands: dict[str, list[str]],
    seed_brands: set[str],
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
            }
            rows[brand_slug] = row

        row["discovery_score"] = str(int(row["discovery_score"]) + score)
        sources = [part for part in row["discovery_sources"].split(";") if part]
        if source not in sources:
            sources.append(source)
        row["discovery_sources"] = ";".join(sources)
        if extra:
            for key, value in extra.items():
                if value and not row.get(key):
                    row[key] = value

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

    for brand in seed_brands:
        upsert(brand, "latest_release_seeds", 60)

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
        rank = int(row["fragrantica_rank"]) if row["fragrantica_rank"] else 9999
        count_70k = int(row["registry_count_70k"]) if row["registry_count_70k"].isdigit() else 0
        sources = row["discovery_sources"].split(";")
        count_70k = int(row["registry_count_70k"]) if row["registry_count_70k"].isdigit() else 0
        if row["fragrantica_rank"] and rank <= 20:
            bucket = "popular"
        elif row["registry_domain_status"] in {"fetchable", "challenge"} and count_70k > 0 and count_70k < 250:
            bucket = "niche"
        elif count_70k >= 250 and row["registry_domain_status"] in {"fetchable", "challenge"}:
            bucket = "high_end"
        elif "fragrantica_news" in sources or "latest_release_seeds" in sources:
            bucket = "niche"
        else:
            bucket = "other"
        row["bucket"] = bucket

    def sort_key(row: dict[str, str]) -> tuple[int, int, str]:
        rank = int(row["fragrantica_rank"]) if row["fragrantica_rank"] else 9999
        return (-int(row["discovery_score"]), rank, row["brand_name"].lower())

    return sorted(rows.values(), key=sort_key)


def select_balanced(rows: list[dict[str, str]], limit: int = 30) -> list[dict[str, str]]:
    buckets = {
        "popular": [row for row in rows if row.get("bucket") == "popular"],
        "high_end": [row for row in rows if row.get("bucket") == "high_end"],
        "niche": [row for row in rows if row.get("bucket") == "niche"],
        "other": [row for row in rows if row.get("bucket") == "other"],
    }
    targets = {
        "popular": max(4, limit // 3),
        "high_end": max(4, limit // 3),
        "niche": max(4, limit - 2 * (limit // 3)),
    }

    selected: list[dict[str, str]] = []
    seen: set[str] = set()
    for bucket_name in ("popular", "high_end", "niche"):
        bucket_rows = buckets[bucket_name]
        quota = targets[bucket_name]
        taken = 0
        for row in bucket_rows:
            if taken >= quota or len(selected) >= limit:
                break
            slug = row["brand_slug"]
            if slug in seen:
                continue
            selected.append(row)
            seen.add(slug)
            taken += 1

    for row in buckets["other"]:
        if len(selected) >= limit:
            break
        slug = row["brand_slug"]
        if slug in seen:
            continue
        selected.append(row)
        seen.add(slug)

    if len(selected) < limit:
        for row in rows:
            if row["brand_slug"] in seen:
                continue
            selected.append(row)
            seen.add(row["brand_slug"])
            if len(selected) >= limit:
                break
    return selected


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    registry_path = repo_root / "data" / "brand-registry.csv"
    seed_path = repo_root / "data" / "latest-release-seeds.csv"
    out_csv = repo_root / "data" / "house-candidates.csv"
    out_json = repo_root / "data" / "house-candidates.json"

    registry = load_registry(registry_path)
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

    candidates = build_candidates(registry, popular_brands, news_brands, seed_brands)
    selected = select_balanced(candidates, limit=30)

    with out_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "brand_slug",
                "discovery_score",
                "discovery_sources",
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
            ],
        )
        writer.writeheader()
        writer.writerows(selected)

    out_json.write_text(json.dumps(candidates, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {len(selected)} balanced house candidates to {out_csv}")
    print(
        "Bucket mix: "
        + ", ".join(
            f"{bucket}={sum(1 for row in selected if row.get('bucket') == bucket)}"
            for bucket in ("popular", "high_end", "niche", "other")
        )
    )


if __name__ == "__main__":
    main()
