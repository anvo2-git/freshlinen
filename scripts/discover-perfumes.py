#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
import re


DEFAULT_SOURCE_PATH = Path("data/rag/perfume-documents.jsonl")


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", "and")
    return "".join(ch if ch.isalnum() else "-" for ch in text).strip("-")


def extract_brand_from_url(url: str) -> str:
    if not isinstance(url, str):
        return ""
    match = re.search(r"/perfume/([^/]+)/", url)
    if not match:
        return ""
    return match.group(1).replace("-", " ").strip()


def load_shortlist(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_catalog_discovery(path: Path) -> dict[str, list[dict[str, str]]]:
    discoveries: dict[str, list[dict[str, str]]] = defaultdict(list)
    if not path.exists():
        return discoveries

    seen: set[tuple[str, str]] = set()
    if path.suffix.lower() == ".jsonl":
        with path.open(encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                source_url = (row.get("url") or "").strip()
                brand = (row.get("brand") or "").strip()
                name = (row.get("name") or "").strip()
                if not source_url or "fragrantica.com/perfume/" not in source_url or not brand or not name:
                    continue
                brand_slug = slugify(brand)
                key = (brand_slug, source_url)
                if key in seen:
                    continue
                seen.add(key)
                discoveries[brand_slug].append(
                    {
                        "brand_name": brand,
                        "product_name": name,
                        "fragrantica_url": source_url,
                        "rating_value": str(row.get("rating_value", "") or ""),
                        "rating_count": str(row.get("rating_count", "") or ""),
                        "gender": "",
                        "notes": ", ".join(row.get("notes") or []) if isinstance(row.get("notes"), list) else "",
                        "accords": ", ".join(row.get("accords") or []) if isinstance(row.get("accords"), list) else "",
                    }
                )
        return discoveries

    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            url = (row.get("url") or "").strip()
            name = (row.get("Name") or "").strip()
            brand = extract_brand_from_url(url)
            brand_slug = slugify(brand)
            if not url or not name or not brand_slug:
                continue
            key = (brand_slug, url)
            if key in seen:
                continue
            seen.add(key)
            discoveries[brand_slug].append(
                {
                    "brand_name": brand.replace("-", " ").strip(),
                    "product_name": name,
                    "fragrantica_url": url,
                    "rating_value": str(row.get("Rating Value", "") or ""),
                    "rating_count": str(row.get("Rating Count", "") or ""),
                    "gender": str(row.get("Gender", "") or ""),
                    "notes": str(row.get("Notes", "") or ""),
                    "accords": str(row.get("Accords", "") or ""),
                }
            )
    return discoveries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--houses-file", default="data/house-shortlist.csv")
    parser.add_argument("--source-path", default=str(DEFAULT_SOURCE_PATH))
    parser.add_argument("--output", default="data/fragrantica-perfume-discovery.csv")
    parser.add_argument("--limit-per-house", type=int, default=None)
    parser.add_argument("--bucket", default="niche")
    args = parser.parse_args()

    houses = load_shortlist(Path(args.houses_file))
    catalog = load_catalog_discovery(Path(args.source_path))

    selected = [row for row in houses if not args.bucket or row.get("bucket") == args.bucket]
    output_rows: list[dict[str, str]] = []
    summary: list[tuple[str, int]] = []

    for house in selected:
        brand_name = (house.get("brand_name") or "").strip()
        brand_slug = slugify(house.get("brand_slug") or brand_name)
        discoveries = catalog.get(brand_slug, [])
        if not discoveries:
            continue
        discoveries = sorted(
            discoveries,
            key=lambda row: (
                -(int(row["rating_count"]) if row["rating_count"].isdigit() else 0),
                row["product_name"].lower(),
            ),
        )
        if args.limit_per_house:
            discoveries = discoveries[: args.limit_per_house]
        summary.append((brand_name, len(discoveries)))
        for item in discoveries:
            output_rows.append(
                {
                    "brand_name": brand_name,
                    "brand_slug": brand_slug,
                    "product_name": item["product_name"],
                    "fragrantica_url": item["fragrantica_url"],
                    "rating_value": item["rating_value"],
                    "rating_count": item["rating_count"],
                    "gender": item["gender"],
                    "notes": item["notes"],
                    "accords": item["accords"],
                    "discovery_source": "fragrantica_catalog",
                }
            )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "brand_name",
                "brand_slug",
                "product_name",
                "fragrantica_url",
                "rating_value",
                "rating_count",
                "gender",
                "notes",
                "accords",
                "discovery_source",
            ],
        )
        writer.writeheader()
        for row in output_rows:
            writer.writerow(row)

    print(f"Wrote {len(output_rows)} perfume discoveries to {out_path}")
    for brand_name, count in summary:
        print(f"{brand_name}: {count}")


if __name__ == "__main__":
    main()
