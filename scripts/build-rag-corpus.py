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


def extract_identity_from_url(url: str) -> tuple[str, str]:
    if not url:
        return "", ""
    match = re.search(r"/perfume/([^/]+)/([^/]+)\.html", url)
    if match:
        return slugify(match.group(1).replace("-", " ")), slugify(match.group(2).replace("-", " "))
    parts = [part for part in re.split(r"[/?#]+", url) if part]
    if len(parts) >= 2:
        return slugify(parts[-2].replace("-", " ")), slugify(parts[-1].replace("-", " "))
    return "", ""


def extract_brand(url: str) -> str:
    brand_slug, _ = extract_identity_from_url(url)
    return brand_slug.replace("-", " ").strip() if brand_slug else ""


def parse_text_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if not value:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = ast.literal_eval(text)
        except Exception:
            parsed = [part.strip() for part in text.split(",") if part.strip()]
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def parse_price_value(price_text: str) -> str:
    match = re.search(r"([0-9]+(?:[.,][0-9]+)?)", price_text or "")
    if not match:
        return ""
    return match.group(1).replace(",", ".")


def parse_launch_year(*values: str) -> str:
    for value in values:
        if not value:
            continue
        match = re.search(r"\b(19\d{2}|20\d{2})\b", value)
        if match:
            return match.group(1)
    return ""


def extract_label_value(text: str, label: str) -> str:
    pattern = rf"{re.escape(label)}:\s*(.+?)(?=\n[A-Za-z][A-Za-z ]+?:|\Z)"
    match = re.search(pattern, text or "", flags=re.S)
    return match.group(1).strip() if match else ""


def extract_label_list(text: str, label: str) -> list[str]:
    return parse_text_list(extract_label_value(text, label))


def compact_list(values: list[str]) -> list[str]:
    deduped: list[str] = []
    for value in values:
        item = str(value).strip()
        if item and item not in deduped:
            deduped.append(item)
    return deduped


def build_search_text(parts: list[str]) -> str:
    return "\n".join(part for part in parts if part)


def normalize_extra_fields(extra: object) -> dict:
    if not isinstance(extra, dict):
        return {}
    normalized = dict(extra)
    normalized["notes_status_summary"] = extra.get("notes_status_summary", {}) if isinstance(extra, dict) else {}
    normalized["notes_user_status"] = extra.get("notes_user_status", {}) if isinstance(extra, dict) else {}
    normalized["notes_season_scores"] = extra.get("notes_season_scores", []) if isinstance(extra, dict) else []
    normalized["notes_similar_perfumes"] = extra.get("notes_similar_perfumes", []) if isinstance(extra, dict) else []
    normalized["notes_similar_perfumes_user_votes"] = (
        extra.get("notes_similar_perfumes_user_votes", []) if isinstance(extra, dict) else []
    )
    return normalized


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


def extract_metadata_from_text(text: str) -> dict[str, object]:
    top_notes = extract_label_list(text, "Top notes")
    middle_notes = extract_label_list(text, "Middle notes")
    base_notes = extract_label_list(text, "Base notes")
    accords = extract_label_list(text, "Accords")
    description = extract_label_value(text, "Official description") or extract_label_value(text, "Catalog description")
    collection = extract_label_value(text, "Collection")
    brand = extract_label_value(text, "Brand")
    product = extract_label_value(text, "Official product") or extract_label_value(text, "Perfume")
    price_text = extract_label_value(text, "Price")
    release_signal = extract_label_value(text, "Official release signal") or extract_label_value(text, "Release signal")
    notes_source = extract_label_value(text, "Notes source")
    notes_source_url = extract_label_value(text, "Notes source url")
    notes_family = extract_label_value(text, "Notes family")
    notes_gender = extract_label_value(text, "Notes gender")
    notes_nose = extract_label_value(text, "Notes nose")
    notes_launch_year = extract_label_value(text, "Notes launch year")
    rating_value = extract_label_value(text, "Rating value")
    rating_count = extract_label_value(text, "Rating count")
    longevity_value = extract_label_value(text, "Longevity value")
    longevity_votes = extract_label_value(text, "Longevity votes")
    sillage_value = extract_label_value(text, "Sillage value")
    sillage_votes = extract_label_value(text, "Sillage votes")
    return {
        "brand_name": brand,
        "product_name": product,
        "description": description,
        "collection": collection,
        "top_notes": top_notes,
        "middle_notes": middle_notes,
        "base_notes": base_notes,
        "accords": accords,
        "price_text": price_text,
        "price_value": parse_price_value(price_text),
        "release_signal": release_signal,
        "notes_source": notes_source,
        "notes_source_url": notes_source_url,
        "notes_family": notes_family,
        "notes_gender": notes_gender,
        "notes_nose": notes_nose,
        "notes_launch_year": notes_launch_year,
        "rating_value": rating_value,
        "rating_count": rating_count,
        "longevity_value": longevity_value,
        "longevity_votes": longevity_votes,
        "sillage_value": sillage_value,
        "sillage_votes": sillage_votes,
    }


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
            _, name_slug_from_url = extract_identity_from_url(url)
            name_slug = name_slug_from_url or slugify(name.replace(row.get("Gender", ""), "").strip())
            official = official_index.get((brand_slug, name_slug))
            accords = parse_list(row.get("Main Accords", ""))
            notes = notes_index.get(url, [])
            description = (row.get("Description") or "").strip()
            source_status = "ok" if official or description or accords else "partial"
            official_url = official.get("official_url", "") if official else ""
            official_text = official.get("text", "") if official else ""
            official_extra = normalize_extra_fields(official.get("extra", {})) if official else {}
            top_notes = compact_list((official.get("top_notes") or []) if official else [])
            middle_notes = compact_list((official.get("middle_notes") or []) if official else [])
            base_notes = compact_list((official.get("base_notes") or []) if official else [])
            accord_text = official.get("accord_text", "") if official else ""
            collection = official.get("collection", "") if official else ""
            price_text = official.get("price_text", "") if official else ""
            release_signal = official.get("release_signal", "") if official else ""
            rating_value = row.get("Rating Value", "")
            rating_count = row.get("Rating Count", "")
            notes_source = official_extra.get("notes_source", "")
            notes_source_url = official_extra.get("notes_source_url", "")
            notes_family = official_extra.get("notes_family", "")
            notes_gender = official_extra.get("notes_gender", "")
            notes_launch_year = official_extra.get("notes_launch_year", "")
            notes_nose = official_extra.get("notes_nose", "")
            longevity_value = official_extra.get("notes_longevity_value", "")
            longevity_votes = official_extra.get("notes_longevity_votes", "")
            sillage_value = official_extra.get("notes_sillage_value", "")
            sillage_votes = official_extra.get("notes_sillage_votes", "")
            tags = official_extra.get("tags") or []
            price_value = parse_price_value(price_text)
            launch_year = parse_launch_year(description, official_text, notes_launch_year)
            key_notes = compact_list([*notes, *top_notes, *middle_notes, *base_notes])
            text_parts = [
                f"Perfume: {name}",
                f"Brand: {brand}" if brand else "",
                f"Brand slug: {brand_slug}" if brand_slug else "",
                f"Product slug: {name_slug}" if name_slug else "",
                f"Gender: {row.get('Gender', '').strip()}",
                f"Collection: {collection}" if collection else "",
                f"Description: {description}" if description else "",
                f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                f"Base notes: {', '.join(base_notes)}" if base_notes else "",
                f"Main accords: {', '.join(accords)}" if accords else "",
                f"Accords: {accord_text}" if accord_text else "",
                f"Notes: {', '.join(notes)}" if notes else "",
                f"Price: {price_text}" if price_text else "",
                f"Price value: {price_value}" if price_value else "",
                f"Release signal: {release_signal}" if release_signal else "",
                f"Launch year: {launch_year}" if launch_year else "",
                f"Rating value: {rating_value}" if rating_value else "",
                f"Rating count: {rating_count}" if rating_count else "",
                f"Notes source: {notes_source}" if notes_source else "",
                f"Notes source URL: {notes_source_url}" if notes_source_url else "",
                f"Family: {notes_family}" if notes_family else "",
                f"Gender label: {notes_gender}" if notes_gender else "",
                f"Nose: {notes_nose}" if notes_nose else "",
                f"Longevity value: {longevity_value}" if longevity_value else "",
                f"Longevity votes: {longevity_votes}" if longevity_votes else "",
                f"Sillage value: {sillage_value}" if sillage_value else "",
                f"Sillage votes: {sillage_votes}" if sillage_votes else "",
                f"Official note tags: {', '.join(tags)}" if tags else "",
            ]
            doc_parts = [
                *text_parts,
            ]
            if official:
                official_desc = official.get("description", "")
                if official_desc:
                    doc_parts.append(f"Official description: {official_desc}")
                note_parts = [
                    f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                    f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                    f"Base notes: {', '.join(base_notes)}" if base_notes else "",
                ]
                doc_parts.extend(part for part in note_parts if part)
                if accord_text:
                    doc_parts.append(f"Accords: {accord_text}")
                if tags:
                    doc_parts.append(f"Official note tags: {', '.join(tags)}")
                if release_signal:
                    doc_parts.append(f"Official release signal: {release_signal}")

            docs.append(
                {
                    "doc_id": f"catalog-{idx}",
                    "source_type": "fragrantica",
                    "source_status": source_status,
                    "brand": brand,
                    "brand_name": brand,
                    "brand_slug": brand_slug,
                    "name": name,
                    "product_name": name,
                    "product_slug": name_slug,
                    "url": url,
                    "official_url": official_url or url,
                    "source_url": url,
                    "description": description,
                    "collection": collection,
                    "price_text": price_text,
                    "price_value": price_value,
                    "release_signal": extract_release_signal(description) or release_signal,
                    "raw_html_path": official.get("raw_html_path", "") if official else "",
                    "top_notes": top_notes,
                    "middle_notes": middle_notes,
                    "base_notes": base_notes,
                    "accords": accords,
                    "notes": notes,
                    "rating_value": rating_value,
                    "rating_count": rating_count,
                    "year": launch_year,
                    "launch_year": launch_year,
                    "gender": row.get("Gender", "").strip(),
                    "size_options": official.get("size_options", []) if official else [],
                    "key_notes": key_notes,
                    "tags": tags,
                    "notes_source": notes_source,
                    "notes_source_url": notes_source_url,
                    "longevity_value": longevity_value,
                    "longevity_votes": longevity_votes,
                    "sillage_value": sillage_value,
                    "sillage_votes": sillage_votes,
                    "similar_perfumes": official_extra.get("notes_similar_perfumes", []),
                    "similar_perfumes_user_votes": official_extra.get("notes_similar_perfumes_user_votes", []),
                    "notes_family": notes_family,
                    "notes_gender": notes_gender,
                    "notes_nose": notes_nose,
                    "notes_launch_year": notes_launch_year,
                    "notes_status_summary": official_extra.get("notes_status_summary", {}),
                    "notes_user_status": official_extra.get("notes_user_status", {}),
                    "season_scores": official_extra.get("notes_season_scores", []),
                    "text": build_search_text(doc_parts),
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
            brand_name = row.get("brand_name", "")
            product_name = row.get("product_name", "")
            brand_slug = slugify(brand_name)
            product_slug = slugify(product_name)
            source_url = row.get("official_url", "")
            top_notes = compact_list(row.get("top_notes") or [])
            middle_notes = compact_list(row.get("middle_notes") or [])
            base_notes = compact_list(row.get("base_notes") or [])
            accord_text = row.get("accord_text", "")
            tag_notes = extra.get("tags") or []
            price_text = row.get("price_text", "")
            price_value = parse_price_value(price_text)
            release_signal = row.get("release_signal", "")
            description = row.get("description", "")
            collection = row.get("collection", "")
            source_status = row.get("source_status", "ok")
            notes_source = extra.get("notes_source", "")
            notes_source_url = extra.get("notes_source_url", "")
            notes_family = extra.get("notes_family", "")
            notes_gender = extra.get("notes_gender", "")
            notes_launch_year = extra.get("notes_launch_year", "")
            notes_nose = extra.get("notes_nose", "")
            launch_year = parse_launch_year(description, notes_launch_year, source_url)
            key_notes = compact_list([*top_notes, *middle_notes, *base_notes])
            doc_parts = [
                f"Official product: {product_name}",
                f"Brand: {brand_name}",
                f"Brand slug: {brand_slug}" if brand_slug else "",
                f"Product slug: {product_slug}" if product_slug else "",
                f"Collection: {collection}",
                f"Description: {description}",
                f"Top notes: {', '.join(top_notes)}" if top_notes else "",
                f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
                f"Base notes: {', '.join(base_notes)}" if base_notes else "",
                f"Accords: {accord_text}" if accord_text else "",
                f"Official tags: {', '.join(tag_notes)}" if tag_notes else "",
                f"Price: {price_text}" if price_text else "",
                f"Price value: {price_value}" if price_value else "",
                f"Release signal: {release_signal}" if release_signal else "",
                f"Launch year: {launch_year}" if launch_year else "",
                f"Notes source: {notes_source}" if notes_source else "",
                f"Notes source URL: {notes_source_url}" if notes_source_url else "",
                f"Family: {notes_family}" if notes_family else "",
                f"Gender label: {notes_gender}" if notes_gender else "",
                f"Nose: {notes_nose}" if notes_nose else "",
                f"Rating value: {extra.get('notes_rating_value', '')}" if extra.get("notes_rating_value") else "",
                f"Rating count: {extra.get('notes_rating_count', '')}" if extra.get("notes_rating_count") else "",
                f"Longevity value: {extra.get('notes_longevity_value', '')}" if extra.get("notes_longevity_value") else "",
                f"Longevity votes: {extra.get('notes_longevity_votes', '')}" if extra.get("notes_longevity_votes") else "",
                f"Sillage value: {extra.get('notes_sillage_value', '')}" if extra.get("notes_sillage_value") else "",
                f"Sillage votes: {extra.get('notes_sillage_votes', '')}" if extra.get("notes_sillage_votes") else "",
            ]
            docs.append(
                {
                    "doc_id": f"official-{brand}-{line_number}",
                    "source_type": row.get("source_type", "official_site"),
                    "source_status": source_status,
                    "brand": brand_name,
                    "brand_name": brand_name,
                    "brand_slug": brand_slug,
                    "name": product_name,
                    "product_name": product_name,
                    "product_slug": product_slug,
                    "url": source_url,
                    "official_url": source_url,
                    "source_url": source_url,
                    "description": description,
                    "collection": collection,
                    "price_text": price_text,
                    "price_value": price_value,
                    "release_signal": release_signal,
                    "raw_html_path": row.get("raw_html_path", ""),
                    "top_notes": top_notes,
                    "middle_notes": middle_notes,
                    "base_notes": base_notes,
                    "accords": compact_list(row.get("accords") or []),
                    "notes": tag_notes,
                    "rating_value": extra.get("notes_rating_value", ""),
                    "rating_count": extra.get("notes_rating_count", ""),
                    "year": launch_year,
                    "launch_year": launch_year,
                    "gender": notes_gender or row.get("extra", {}).get("notes_gender", ""),
                    "size_options": row.get("size_options", []),
                    "key_notes": key_notes,
                    "tags": tag_notes,
                    "notes_source": notes_source,
                    "notes_source_url": notes_source_url,
                    "longevity_value": extra.get("notes_longevity_value", ""),
                    "longevity_votes": extra.get("notes_longevity_votes", ""),
                    "sillage_value": extra.get("notes_sillage_value", ""),
                    "sillage_votes": extra.get("notes_sillage_votes", ""),
                    "similar_perfumes": extra.get("notes_similar_perfumes", []),
                    "similar_perfumes_user_votes": extra.get("notes_similar_perfumes_user_votes", []),
                    "notes_family": notes_family,
                    "notes_gender": notes_gender,
                    "notes_nose": notes_nose,
                    "notes_launch_year": notes_launch_year,
                    "notes_status_summary": extra.get("notes_status_summary", {}),
                    "notes_user_status": extra.get("notes_user_status", {}),
                    "season_scores": extra.get("notes_season_scores", []),
                    "text": build_search_text(doc_parts),
                }
            )
    return docs


def normalize_doc(row: dict) -> dict:
    text = row.get("text", "") or ""
    extra = normalize_extra_fields(row.get("extra", {}))
    brand_name = row.get("brand_name") or row.get("brand") or extra.get("brand_name") or ""
    product_name = row.get("product_name") or row.get("name") or extra.get("product_name") or ""
    url = row.get("official_url") or row.get("url") or extra.get("notes_source_url") or ""
    url_brand_slug, url_product_slug = extract_identity_from_url(url)
    brand_slug = url_brand_slug or row.get("brand_slug") or slugify(brand_name)
    product_slug = url_product_slug or row.get("product_slug") or slugify(product_name)
    description = row.get("description") or extract_label_value(text, "Description")
    collection = row.get("collection") or extract_label_value(text, "Collection")
    top_notes = compact_list(row.get("top_notes") or extract_label_list(text, "Top notes"))
    middle_notes = compact_list(row.get("middle_notes") or extract_label_list(text, "Middle notes"))
    base_notes = compact_list(row.get("base_notes") or extract_label_list(text, "Base notes"))
    accords = compact_list(row.get("accords") or extract_label_list(text, "Accords"))
    price_text = row.get("price_text") or extract_label_value(text, "Price")
    price_value = row.get("price_value") or parse_price_value(price_text)
    release_signal = row.get("release_signal") or extract_label_value(text, "Release signal")
    raw_html_path = row.get("raw_html_path") or ""
    source_status = row.get("source_status") or ("ok" if row.get("source_type") == "fragrantica" else "partial")
    source_type = row.get("source_type") or "fragrantica"
    rating_value = row.get("rating_value") or extract_label_value(text, "Rating value") or extra.get("notes_rating_value", "")
    rating_count = row.get("rating_count") or extract_label_value(text, "Rating count") or extra.get("notes_rating_count", "")
    launch_year = row.get("launch_year") or row.get("year") or extract_label_value(text, "Launch year") or extra.get("notes_launch_year", "")
    gender = row.get("gender") or extract_label_value(text, "Gender") or extra.get("notes_gender", "")
    size_options = parse_text_list(row.get("size_options", []))
    key_notes = compact_list(row.get("key_notes") or [*top_notes, *middle_notes, *base_notes])
    tags = parse_text_list(row.get("tags") or []) or parse_text_list(extra.get("tags") or [])
    notes_source = row.get("notes_source") or extra.get("notes_source", "")
    notes_source_url = row.get("notes_source_url") or extra.get("notes_source_url", "")
    longevity_value = row.get("longevity_value") or extra.get("notes_longevity_value", "")
    longevity_votes = row.get("longevity_votes") or extra.get("notes_longevity_votes", "")
    sillage_value = row.get("sillage_value") or extra.get("notes_sillage_value", "")
    sillage_votes = row.get("sillage_votes") or extra.get("notes_sillage_votes", "")
    similar_perfumes = row.get("similar_perfumes") or extra.get("notes_similar_perfumes", [])
    similar_perfumes_user_votes = row.get("similar_perfumes_user_votes") or extra.get("notes_similar_perfumes_user_votes", [])
    notes_family = row.get("notes_family") or extra.get("notes_family", "")
    notes_gender = row.get("notes_gender") or extra.get("notes_gender", "")
    notes_nose = row.get("notes_nose") or extra.get("notes_nose", "")
    notes_launch_year = row.get("notes_launch_year") or extra.get("notes_launch_year", "")
    notes_status_summary = row.get("notes_status_summary") or extra.get("notes_status_summary", {})
    notes_user_status = row.get("notes_user_status") or extra.get("notes_user_status", {})
    season_scores = row.get("season_scores") or extra.get("notes_season_scores", [])
    if not description:
        description = extract_label_value(text, "Official description") or extract_label_value(text, "Catalog description")
    if not collection:
        collection = extract_label_value(text, "Collection")
    if not release_signal:
        release_signal = extract_release_signal(description or text)
    if not launch_year:
        launch_year = parse_launch_year(description, text, notes_launch_year)
    if source_status not in {"ok", "blocked", "uncertain"}:
        has_core_content = bool(description and (top_notes or middle_notes or base_notes or accords))
        has_some_content = bool(description or top_notes or middle_notes or base_notes or accords)
        source_status = "ok" if has_core_content else "partial" if has_some_content else "uncertain"
    source_url = row.get("source_url") or url
    text_parts = [
        f"Perfume: {product_name}",
        f"Brand: {brand_name}" if brand_name else "",
        f"Brand slug: {brand_slug}" if brand_slug else "",
        f"Product slug: {product_slug}" if product_slug else "",
        f"Source type: {source_type}" if source_type else "",
        f"Source status: {source_status}" if source_status else "",
        f"Description: {description}" if description else "",
        f"Collection: {collection}" if collection else "",
        f"Top notes: {', '.join(top_notes)}" if top_notes else "",
        f"Middle notes: {', '.join(middle_notes)}" if middle_notes else "",
        f"Base notes: {', '.join(base_notes)}" if base_notes else "",
        f"Accords: {', '.join(accords)}" if accords else "",
        f"Price: {price_text}" if price_text else "",
        f"Price value: {price_value}" if price_value else "",
        f"Release signal: {release_signal}" if release_signal else "",
        f"Launch year: {launch_year}" if launch_year else "",
        f"Gender: {gender}" if gender else "",
        f"Rating value: {rating_value}" if rating_value else "",
        f"Rating count: {rating_count}" if rating_count else "",
        f"Key notes: {', '.join(key_notes)}" if key_notes else "",
        f"Tags: {', '.join(tags)}" if tags else "",
        f"Notes source: {notes_source}" if notes_source else "",
        f"Notes source URL: {notes_source_url}" if notes_source_url else "",
        f"Family: {notes_family}" if notes_family else "",
        f"Notes gender: {notes_gender}" if notes_gender else "",
        f"Nose: {notes_nose}" if notes_nose else "",
        f"Notes launch year: {notes_launch_year}" if notes_launch_year else "",
        f"Longevity value: {longevity_value}" if longevity_value else "",
        f"Longevity votes: {longevity_votes}" if longevity_votes else "",
        f"Sillage value: {sillage_value}" if sillage_value else "",
        f"Sillage votes: {sillage_votes}" if sillage_votes else "",
    ]
    normalized = dict(row)
    normalized.update(
        {
            "brand": brand_name,
            "brand_name": brand_name,
            "brand_slug": brand_slug,
            "name": product_name,
            "product_name": product_name,
            "product_slug": product_slug,
            "url": source_url,
            "official_url": row.get("official_url") or source_url,
            "source_url": source_url,
            "source_type": source_type,
            "source_status": source_status,
            "description": description,
            "collection": collection,
            "top_notes": top_notes,
            "middle_notes": middle_notes,
            "base_notes": base_notes,
            "accords": accords,
            "price_text": price_text,
            "price_value": price_value,
            "release_signal": release_signal,
            "raw_html_path": raw_html_path,
            "rating_value": rating_value,
            "rating_count": rating_count,
            "year": launch_year,
            "launch_year": launch_year,
            "gender": gender,
            "size_options": size_options,
            "key_notes": key_notes,
            "tags": tags,
            "notes_source": notes_source,
            "notes_source_url": notes_source_url,
            "longevity_value": longevity_value,
            "longevity_votes": longevity_votes,
            "sillage_value": sillage_value,
            "sillage_votes": sillage_votes,
            "similar_perfumes": similar_perfumes,
            "similar_perfumes_user_votes": similar_perfumes_user_votes,
            "notes_family": notes_family,
            "notes_gender": notes_gender,
            "notes_nose": notes_nose,
            "notes_launch_year": notes_launch_year,
            "notes_status_summary": notes_status_summary,
            "notes_user_status": notes_user_status,
            "season_scores": season_scores,
            "extra": extra,
            "text": build_search_text(text_parts) if text_parts else text,
        }
    )
    return normalized


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

    notes_index = load_notes_index(notes_path)
    official_index = {}
    official_paths = sorted(
        path for path in official_dir.glob("*-products.jsonl") if path.is_file()
    )
    retailer_paths = sorted(
        path for path in retailer_dir.glob("*-products.jsonl") if path.is_file()
    )
    for path in official_paths:
        official_index.update(load_official_records(path))

    if catalog_path.exists():
        catalog_docs = build_catalog_docs(catalog_path, notes_index, official_index)
        base_docs: list[dict] = []
    else:
        catalog_docs = [normalize_doc(row) for row in load_jsonl_docs(output_dir / "perfume-documents.jsonl")]
        base_docs = catalog_docs
    official_docs = build_official_docs(official_paths + retailer_paths)
    output_path = output_dir / "perfume-documents.jsonl"

    merged_docs: dict[str, dict] = {}
    ordered_ids: list[str] = []
    for row in base_docs + catalog_docs + official_docs:
        row = normalize_doc(row)
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
        "merged_docs": len(ordered_ids),
        "output_path": str(output_path),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
