#!/usr/bin/env python3
"""
Build a brand enrichment registry from the perfume datasets.

The output is a curated CSV that combines:
- coverage counts from the 24k cleaned note pyramid dataset
- coverage counts from the 70k catalog
- manually verified official fragrance/homepage URLs
- a scraper priority tier and rough platform guess

Usage:
  python3 scripts/build-brand-registry.py \
    --catalog70k /path/to/catalog_70k.csv \
    --cleaned24k /path/to/fra_cleaned.csv \
    --output data/brand-registry.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path


CURATED_BRANDS = [
    {
        "brand_name": "Avon",
        "brand_slug": "avon",
        "official_url": "https://www.avon.com/",
        "domain_status": "blocked",
        "platform_guess": "custom/cloudfront",
        "scraper_tier": "later",
        "priority_notes": "High coverage but plain HTTP returns 403.",
    },
    {
        "brand_name": "Zara",
        "brand_slug": "zara",
        "official_url": "https://www.zara.com/us/en/woman-beauty-perfumes-l1415.html",
        "domain_status": "fetchable",
        "platform_guess": "custom/spa",
        "scraper_tier": "pilot",
        "priority_notes": "Large catalog and fetchable collection page.",
    },
    {
        "brand_name": "O Boticario",
        "brand_slug": "o-boticario",
        "official_url": "https://www.boticario.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "pilot",
        "priority_notes": "High coverage and plain fetch works.",
    },
    {
        "brand_name": "Guerlain",
        "brand_slug": "guerlain",
        "official_url": "https://www.guerlain.com/us/en-us/fragrance/",
        "domain_status": "fetchable",
        "platform_guess": "salesforce-commerce",
        "scraper_tier": "pilot",
        "priority_notes": "High coverage and rich fragrance copy.",
    },
    {
        "brand_name": "Natura",
        "brand_slug": "natura",
        "official_url": "https://www.natura.com.br/",
        "domain_status": "unverified",
        "platform_guess": "unknown",
        "scraper_tier": "research",
        "priority_notes": "High coverage, official domain not yet checked in this pass.",
    },
    {
        "brand_name": "Oriflame",
        "brand_slug": "oriflame",
        "official_url": "https://www.oriflame.com/",
        "domain_status": "unverified",
        "platform_guess": "unknown",
        "scraper_tier": "research",
        "priority_notes": "High coverage, likely regionalized product pages.",
    },
    {
        "brand_name": "Yves Saint Laurent",
        "brand_slug": "yves-saint-laurent",
        "official_url": "https://www.yslbeauty.com/",
        "domain_status": "fetchable",
        "platform_guess": "salesforce-commerce",
        "scraper_tier": "pilot",
        "priority_notes": "Fetchable fragrance site with likely consistent product templates.",
    },
    {
        "brand_name": "Dior",
        "brand_slug": "dior",
        "official_url": "https://www.dior.com/en_us/beauty/fragrance-1",
        "domain_status": "fetchable",
        "platform_guess": "salesforce-commerce",
        "scraper_tier": "pilot",
        "priority_notes": "Rich descriptions and clean category landing pages.",
    },
    {
        "brand_name": "Givenchy",
        "brand_slug": "givenchy",
        "official_url": "https://www.givenchybeauty.com/us",
        "domain_status": "fetchable",
        "platform_guess": "adobe-commerce",
        "scraper_tier": "pilot",
        "priority_notes": "High coverage and plain fetch works.",
    },
    {
        "brand_name": "Giorgio Armani",
        "brand_slug": "giorgio-armani",
        "official_url": "https://www.giorgioarmanibeauty-usa.com/",
        "domain_status": "blocked",
        "platform_guess": "adobe-commerce",
        "scraper_tier": "later",
        "priority_notes": "Official site blocks plain fetch with 403.",
    },
    {
        "brand_name": "Calvin Klein",
        "brand_slug": "calvin-klein",
        "official_url": "https://www.calvinklein.us/en/women/fragrance",
        "domain_status": "fetchable",
        "platform_guess": "salesforce-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable but likely retailer-style listing pages.",
    },
    {
        "brand_name": "Lattafa Perfumes",
        "brand_slug": "lattafa-perfumes",
        "official_url": "https://lattafa.com/",
        "domain_status": "blocked",
        "platform_guess": "custom/cloudflare",
        "scraper_tier": "later",
        "priority_notes": "High relevance but plain fetch returns 403.",
    },
    {
        "brand_name": "Carolina Herrera",
        "brand_slug": "carolina-herrera",
        "official_url": "https://www.carolinaherrera.com/us/fragrance",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable fragrance landing pages.",
    },
    {
        "brand_name": "Xerjoff",
        "brand_slug": "xerjoff",
        "official_url": "https://www.xerjoff.com/en-us",
        "domain_status": "fetchable",
        "platform_guess": "shopify-like",
        "scraper_tier": "pilot",
        "priority_notes": "Smaller but high-quality niche text.",
    },
    {
        "brand_name": "Bath & Body Works",
        "brand_slug": "bath-body-works",
        "official_url": "https://www.bathandbodyworks.com/c/body-care/fragrance",
        "domain_status": "challenge",
        "platform_guess": "custom-commerce",
        "scraper_tier": "later",
        "priority_notes": "Redirect/challenge behavior on plain fetch.",
    },
    {
        "brand_name": "Armaf",
        "brand_slug": "armaf",
        "official_url": "https://armaf.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable and likely simpler than luxury sites.",
    },
    {
        "brand_name": "L'Occitane en Provence",
        "brand_slug": "l-occitane-en-provence",
        "official_url": "https://www.loccitane.com/en-us/fragrances",
        "domain_status": "challenge",
        "platform_guess": "salesforce-commerce",
        "scraper_tier": "later",
        "priority_notes": "Demandware challenge page on direct fetch.",
    },
    {
        "brand_name": "Kenzo",
        "brand_slug": "kenzo",
        "official_url": "https://www.kenzoparfums.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable locale-aware fragrance site.",
    },
    {
        "brand_name": "Jo Malone London",
        "brand_slug": "jo-malone-london",
        "official_url": "https://www.jomalone.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable and note-rich product pages likely available.",
    },
    {
        "brand_name": "Rasasi",
        "brand_slug": "rasasi",
        "official_url": "https://rasasionline.com/",
        "domain_status": "blocked",
        "platform_guess": "custom-cloudflare",
        "scraper_tier": "later",
        "priority_notes": "Plain fetch returns 403.",
    },
    {
        "brand_name": "Roja Dove",
        "brand_slug": "roja-dove",
        "official_url": "https://www.rojaparfums.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Redirects to Roja London and fetch works.",
    },
    {
        "brand_name": "Jean Paul Gaultier",
        "brand_slug": "jean-paul-gaultier",
        "official_url": "https://www.jeanpaulgaultier.com/us/en_US/fragrances",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable, likely structured fragrance catalog.",
    },
    {
        "brand_name": "Victoria's Secret",
        "brand_slug": "victoria-s-secret",
        "official_url": "https://www.victoriassecret.com/us/vs/beauty/perfume",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable fragrance collection pages.",
    },
    {
        "brand_name": "Lancôme",
        "brand_slug": "lancome",
        "official_url": "https://www.lancome.co.uk/",
        "domain_status": "blocked",
        "platform_guess": "custom-cloudflare",
        "scraper_tier": "later",
        "priority_notes": "Plain fetch returns 403.",
    },
    {
        "brand_name": "Boadicea the Victorious",
        "brand_slug": "boadicea-the-victorious",
        "official_url": "https://boadiceaperfume.com/",
        "domain_status": "fetchable",
        "platform_guess": "custom-commerce",
        "scraper_tier": "wave-2",
        "priority_notes": "Fetchable niche site with likely rich product detail.",
    },
]


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def load_cleaned_counts(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            brand = (row.get("Brand") or "").strip()
            if brand:
                counts[slugify(brand)] += 1
    return counts


def load_catalog_counts(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            url = row.get("url") or ""
            match = re.search(r"/perfume/([^/]+)/", url)
            if match:
                counts[slugify(match.group(1).replace("-", " "))] += 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog70k", required=True, type=Path)
    parser.add_argument("--cleaned24k", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    cleaned_counts = load_cleaned_counts(args.cleaned24k)
    catalog_counts = load_catalog_counts(args.catalog70k)

    rows = []
    for brand in CURATED_BRANDS:
        slug = brand["brand_slug"]
        row = {
            **brand,
            "count_24k": cleaned_counts.get(slug, 0),
            "count_70k": catalog_counts.get(slug, 0),
        }
        rows.append(row)

    rows.sort(key=lambda row: (-row["count_24k"], -row["count_70k"], row["brand_name"]))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "brand_slug",
                "count_24k",
                "count_70k",
                "official_url",
                "domain_status",
                "platform_guess",
                "scraper_tier",
                "priority_notes",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} brand rows to {args.output}")


if __name__ == "__main__":
    main()
