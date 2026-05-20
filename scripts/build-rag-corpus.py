#!/usr/bin/env python3
from __future__ import annotations

import ast
import csv
import json
import re
from pathlib import Path


def parse_list(value: str) -> list[str]:
    if not value:
        return []
    try:
        parsed = ast.literal_eval(value)
    except Exception:
        parsed = [part.strip() for part in value.split(",") if part.strip()]
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def extract_brand(url: str) -> str:
    match = re.search(r"/perfume/([^/]+)/", url)
    return match.group(1).replace("-", " ").strip() if match else ""


def extract_release_signal(description: str) -> str:
    lower = description.lower()
    if "2026" in description:
        return "mentions 2026"
    if "new fragrance" in lower or "new scent" in lower:
        return "new fragrance"
    if "limited edition" in lower or "limited and numbered" in lower:
        return "limited edition"
    return ""


def load_notes_index(path: Path) -> dict[str, list[str]]:
    notes = {}
    if not path.exists():
        return notes
    with path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            url = (row.get("url") or "").strip()
            if url:
                notes[url] = parse_list(row.get("all_notes", ""))
    return notes


def load_official_records(path: Path) -> dict[tuple[str, str], dict]:
    records = {}
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("source_status") != "ok":
            continue
        brand_slug = slugify(row.get("brand_name", ""))
        name_slug = slugify(row.get("product_name", ""))
        if brand_slug and name_slug:
            records[(brand_slug, name_slug)] = row
    return records


def build_catalog_docs(
    catalog_path: Path,
    notes_index: dict[str, list[str]],
    official_index: dict[tuple[str, str], dict],
) -> list[dict]:
    docs = []
    with catalog_path.open(newline="", encoding="utf-8", errors="ignore") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            url = (row.get("url") or "").strip()
            name = (row.get("Name") or "").strip()
            brand = extract_brand(url)
            brand_slug = slugify(brand)
            name_slug = slugify(name.replace(row.get("Gender", ""), "").strip())
            official = official_index.get((brand_slug, name_slug))
            accords = parse_list(row.get("Main Accords", ""))
            notes = notes_index.get(url, [])
            description = (row.get("Description") or "").strip()
            doc_parts = [
                f"Perfume: {name}",
                f"Brand: {brand}" if brand else "",
                f"Gender: {row.get('Gender', '').strip()}",
                f"Main accords: {', '.join(accords)}" if accords else "",
                f"Notes: {', '.join(notes)}" if notes else "",
                f"Catalog description: {description}" if description else "",
            ]
            if official:
                official_desc = official.get("description", "")
                if official_desc:
                    doc_parts.append(f"Official description: {official_desc}")
                top_notes = official.get("top_notes") or []
                middle_notes = official.get("middle_notes") or []
                base_notes = official.get("base_notes") or []
                note_parts = [f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                              f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                              f"Base notes: {', '.join(base_notes)}" if base_notes else ""]
                doc_parts.extend(part for part in note_parts if part)
                accord_text = official.get("accord_text", "")
                if accord_text:
                    doc_parts.append(f"Accords: {accord_text}")
                extra = official.get("extra", {})
                tags = extra.get("tags") or []
                if tags:
                    doc_parts.append(f"Official note tags: {', '.join(tags)}")
                signal = official.get("release_signal", "")
                if signal:
                    doc_parts.append(f"Official release signal: {signal}")

            docs.append(
                {
                    "doc_id": f"catalog-{idx}",
                    "source_type": "catalog_merge",
                    "brand": brand,
                    "name": name,
                    "url": url,
                    "rating_value": row.get("Rating Value", ""),
                    "rating_count": row.get("Rating Count", ""),
                    "accords": accords,
                    "notes": notes,
                    "release_signal": extract_release_signal(description),
                    "text": "\n".join(part for part in doc_parts if part),
                    "official_url": official.get("official_url", "") if official else "",
                }
            )
    return docs


def build_official_docs(official_paths: list[Path]) -> list[dict]:
    docs = []
    for path in official_paths:
        brand = path.name.replace("-products.jsonl", "")
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("source_status") != "ok":
                continue
            extra = row.get("extra", {})
            tag_notes = extra.get("tags") or []
            top_notes = row.get("top_notes") or []
            middle_notes = row.get("middle_notes") or []
            base_notes = row.get("base_notes") or []
            accord_text = row.get("accord_text", "")
            doc_parts = [
                f"Official product: {row.get('product_name', '')}",
                f"Brand: {row.get('brand_name', '')}",
                f"Collection: {row.get('collection', '')}",
                f"Description: {row.get('description', '')}",
                f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                f"Base notes: {', '.join(base_notes)}" if base_notes else "",
                f"Accords: {accord_text}" if accord_text else "",
                f"Official tags: {', '.join(tag_notes)}" if tag_notes else "",
                f"Price: {row.get('price_text', '')}" if row.get("price_text") else "",
                f"Release signal: {row.get('release_signal', '')}" if row.get("release_signal") else "",
            ]
            docs.append(
                {
                    "doc_id": f"official-{brand}-{line_number}",
                    "source_type": "official_enrichment",
                    "brand": row.get("brand_name", ""),
                    "name": row.get("product_name", ""),
                    "url": row.get("official_url", ""),
                    "rating_value": "",
                    "rating_count": "",
                    "accords": [],
                    "notes": tag_notes,
                    "release_signal": row.get("release_signal", ""),
                    "text": "\n".join(part for part in doc_parts if part),
                    "official_url": row.get("official_url", ""),
                }
            )
    return docs


def build_scraped_docs(scraped_paths: list[Path]) -> list[dict]:
    docs = []
    for path in scraped_paths:
        for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            source_key = row.get("source_key") or f"{path.stem}-{line_number}"
            brand = str(row.get("brand") or "").strip()
            name = str(row.get("name") or "").strip()
            accord_weights = row.get("accord_weights") or {}
            accords = sorted(accord_weights.keys(), key=lambda key: accord_weights.get(key, 0), reverse=True)
            doc_parts = [
                f"Scraped perfume: {name}",
                f"Brand: {brand}" if brand else "",
                f"Gender: {row.get('gender', '')}" if row.get("gender") else "",
                f"Accords: {', '.join(accords)}" if accords else "",
                f"Rating: {row.get('rating', '')}" if row.get("rating") else "",
                f"Rating count: {row.get('rating_count', '')}" if row.get("rating_count") else "",
                f"Source URL: {row.get('source_url', '')}" if row.get("source_url") else "",
            ]
            docs.append(
                {
                    "doc_id": f"scraped-{source_key}",
                    "source_type": "scraped_cache",
                    "brand": brand,
                    "name": name,
                    "url": row.get("source_url", ""),
                    "rating_value": str(row.get("rating", "")),
                    "rating_count": str(row.get("rating_count", "")),
                    "accords": accords,
                    "notes": [],
                    "release_signal": "",
                    "text": "\n".join(part for part in doc_parts if part),
                    "official_url": row.get("source_url", ""),
                }
            )
    return docs


def load_jsonl_docs(path: Path) -> list[dict]:
    if not path.exists():
        return []
    docs = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        docs.append(json.loads(line))
    return docs


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    catalog_path = Path("/home/anvo23/projects/perfume-rec/data/catalog_70k.csv")
    notes_path = Path("/home/anvo23/projects/perfume-rec/data/catalog_24k_notes.csv")
    official_dir = repo_root / "data" / "official-products"
    retailer_dir = repo_root / "data" / "retailer-products"
    output_dir = repo_root / "data" / "rag"
    output_dir.mkdir(parents=True, exist_ok=True)
    scraped_cache_dir = output_dir / "scraped-cache"

    notes_index = load_notes_index(notes_path)
    official_index = {}
    official_paths = sorted(
        path for path in official_dir.glob("*-products.jsonl") if path.is_file()
    )
    retailer_paths = sorted(
        path for path in retailer_dir.glob("*-products.jsonl") if path.is_file()
    )
    scraped_paths = [output_dir / "scraped-perfumes.jsonl", scraped_cache_dir / "scraped-perfumes.jsonl"]
    for path in official_paths:
        official_index.update(load_official_records(path))

    if catalog_path.exists():
        catalog_docs = build_catalog_docs(catalog_path, notes_index, official_index)
        base_docs: list[dict] = []
    else:
        catalog_docs = load_jsonl_docs(output_dir / "perfume-documents.jsonl")
        base_docs = catalog_docs
    official_docs = build_official_docs(official_paths + retailer_paths)
    scraped_docs = build_scraped_docs([path for path in scraped_paths if path.exists()])
    output_path = output_dir / "perfume-documents.jsonl"

    merged_docs: dict[str, dict] = {}
    ordered_ids: list[str] = []
    for row in base_docs + catalog_docs + official_docs + scraped_docs:
        doc_id = row.get("doc_id")
        if not doc_id:
            continue
        if doc_id not in merged_docs:
            ordered_ids.append(doc_id)
        merged_docs[doc_id] = row

    with output_path.open("w", encoding="utf-8") as handle:
        for doc_id in ordered_ids:
            row = merged_docs[doc_id]
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    manifest = {
        "catalog_docs": len(catalog_docs),
        "official_docs": len(official_docs),
        "scraped_docs": len(scraped_docs),
        "merged_docs": len(ordered_ids),
        "output_path": str(output_path),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
