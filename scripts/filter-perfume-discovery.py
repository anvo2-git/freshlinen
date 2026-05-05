#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("&", "and")
    return "".join(ch if ch.isalnum() else "-" for ch in text).strip("-")


def parse_set(value: str) -> set[str]:
    return {part.strip().lower() for part in re.split(r"[^a-z0-9]+", value or "") if part.strip()}


def load_existing_keys(corpus_path: Path) -> set[tuple[str, str]]:
    existing: set[tuple[str, str]] = set()
    if not corpus_path.exists():
        return existing
    with corpus_path.open(encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            brand = slugify(row.get("brand", "") or row.get("brand_name", ""))
            name = slugify(row.get("name", "") or row.get("product_name", ""))
            if brand and name:
                existing.add((brand, name))
    return existing


def load_discovery_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--discovery", default="data/fragrantica-perfume-discovery.csv")
    parser.add_argument("--existing-corpus", default="data/rag/perfume-documents.jsonl")
    parser.add_argument("--output", default="data/fragrantica-perfume-discovery.filtered.csv")
    args = parser.parse_args()

    discovery_path = Path(args.discovery)
    corpus_path = Path(args.existing_corpus)
    output_path = Path(args.output)

    existing = load_existing_keys(corpus_path)
    discovery_rows = load_discovery_rows(discovery_path)

    filtered: list[dict[str, str]] = []
    skipped_existing = 0
    skipped_duplicate = 0
    seen: set[tuple[str, str]] = set()

    for row in discovery_rows:
        brand = slugify(row.get("brand_name", ""))
        name = slugify(row.get("product_name", ""))
        if not brand or not name:
            continue
        key = (brand, name)
        if key in existing:
            skipped_existing += 1
            continue
        if key in seen:
            skipped_duplicate += 1
            continue
        seen.add(key)
        filtered.append(row)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=discovery_rows[0].keys() if discovery_rows else [])
        if discovery_rows:
            writer.writeheader()
            for row in filtered:
                writer.writerow(row)

    print(f"Wrote {len(filtered)} new perfume discoveries to {output_path}")
    print(f"Skipped {skipped_existing} already-present perfumes from the existing corpus")
    print(f"Skipped {skipped_duplicate} duplicate discovery rows")


if __name__ == "__main__":
    main()
