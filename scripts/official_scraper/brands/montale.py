from __future__ import annotations

import json
import re
from html import unescape
from urllib.parse import urljoin, urlparse

from ..base import BrandAdapter, ScrapeRecord, strip_tags


def _split_notes(text: str) -> list[str]:
    value = strip_tags(unescape(text))
    value = value.replace(" and ", ", ")
    items = [part.strip() for part in re.split(r"[,\n;/]+", value) if part.strip()]
    deduped: list[str] = []
    for item in items:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _extract_ld_json(html: str) -> dict:
    blocks = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>\s*(.*?)\s*</script>',
        html,
        flags=re.S | re.I,
    )
    for block in blocks:
        try:
            parsed = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("@type") in {"Product", "ItemPage"}:
            return parsed
    return {}


class MontaleAdapter(BrandAdapter):
    brand_name = "Montale"
    brand_slug = "montale"
    base_url = "https://montaleparfums.com"
    catalog_url = "https://montaleparfums.com/en/24-montale-catalog"

    curated_urls = (
        "https://montaleparfums.com/en/fruits/357-755-oud-sapparot.html",
        "https://montaleparfums.com/en/roses/341-735-oud-fool-roses.html",
        "https://montaleparfums.com/en/aoud/335-560-oud-island.html",
        "https://montaleparfums.com/esp/en/wood/311-519-wood-on-fire.html",
    )

    product_profiles = {
        "oud-sapparot": {
            "product_name": "Oud Sapparot",
            "collection": "Oud",
            "description": (
                "A blazing journey where Thai pineapple meets smoky oud. "
                "Saffron and cinnamon spark the fire, while leather and birch add depth. "
                "Vanilla, coconut, and musk soften the sillage."
            ),
            "top_notes": ["Pineapple", "Cambodian Oud", "Saffron"],
            "middle_notes": ["Leather", "Birch", "Cinnamon"],
            "base_notes": ["Vanilla", "Coconut", "White Musk"],
            "accord_text": "sweet, fruity, leather, woody, warm spicy, animalic, tropical, vanilla, smoky, coconut",
            "size_options": ["100 ML"],
            "price_text": "€120.00",
            "release_signal": "new fragrance 2025",
            "source_id": "755",
        },
        "oud-fool-roses": {
            "product_name": "Oud Fool Roses",
            "collection": "Roses",
            "description": (
                'A seductive, intense, and oriental twist on a timeless classic. '
                "Tangerine and roses open into Taif rose, oud, and cashmere wood, "
                "then settle into musk, labdanum, and amber."
            ),
            "top_notes": ["Rose", "Tangerine"],
            "middle_notes": ["Taif Rose", "Oud", "Cashmere Wood"],
            "base_notes": ["Musk", "Labdanum", "Amber"],
            "accord_text": "rose, musky, oud, amber, powdery, citrus, woody, floral",
            "size_options": ["100 ML"],
            "price_text": "€130.00",
            "release_signal": "new fragrance 2024",
            "source_id": "735",
        },
        "oud-island": {
            "product_name": "Oud Island",
            "collection": "Aoud",
            "description": (
                "Bergamot and tangerine lead into black leather, Nepalese oud, "
                "sandalwood, tuberose, dried coconut chips, musk, labdanum, and a tobacco-ambergris finish."
            ),
            "top_notes": ["Italian Lemon", "Sicilian Bergamot", "Tangerine"],
            "middle_notes": ["Black Leather", "Oud", "Sandalwood", "Solar Notes", "Indian Tuberose", "Flowers"],
            "base_notes": ["Vanilla", "Tobacco", "Labdanum", "Amber", "Musk"],
            "accord_text": "citrus, woody, powdery, oud, amber, sweet, vanilla, fresh spicy, aromatic, tobacco",
            "size_options": ["100 ML"],
            "price_text": "€120.00",
            "release_signal": "new fragrance 2023",
            "source_id": "560",
        },
        "wood-on-fire": {
            "product_name": "Wood On Fire",
            "collection": "Wood",
            "description": (
                "A dark and deep mystical fragrance with a burning aura that warms the heart. "
                "Oud wood, sandalwood, and burnt vetiver root meet smoke, vanilla, amber, and labdanum."
            ),
            "top_notes": ["Lemon", "Cedar Wood", "Incense"],
            "middle_notes": ["Burnt Vetiver Root", "Nepalese Oud", "Mysore Sandalwood"],
            "base_notes": ["Amber", "Vanilla", "Labdanum"],
            "accord_text": "woody, smoky, oud, powdery, amber, vanilla, aromatic, earthy, warm spicy",
            "size_options": ["100 ML"],
            "price_text": "€120.00",
            "release_signal": "new fragrance 2021",
            "source_id": "519",
        },
    }

    def list_product_urls(self) -> list[str]:
        urls = set(self.curated_urls)
        try:
            html = self.fetch_text(self.catalog_url)
            self.save_raw("catalog", html)
            for href in re.findall(r'href=["\']([^"\']+\.html)["\']', html, flags=re.I):
                resolved = urljoin(self.base_url, unescape(href))
                if urlparse(resolved).netloc == urlparse(self.base_url).netloc:
                    urls.add(resolved.split("#", 1)[0])
        except Exception:
            pass
        for row in self.seed_rows:
            if row.get("source_url"):
                urls.add(row["source_url"])
        return sorted(urls)

    def _parse_fragrantica(self, url: str, html: str, raw_path: str) -> ScrapeRecord:
        title_match = re.search(r"<title>\s*(.*?)\s*</title>", html, flags=re.S | re.I)
        title = strip_tags(unescape(title_match.group(1))) if title_match else ""
        accord_block = re.search(r"###### main accords([\s\S]*?)Search by accords", html, flags=re.I)
        accords = []
        if accord_block:
            accords = [line.strip() for line in accord_block.group(1).splitlines() if line.strip()]

        top_notes = []
        middle_notes = []
        base_notes = []
        pyramid_match = re.search(
            r"Top notes? are\s+(.+?);\s*middle notes? are\s+(.+?);\s*base notes? are\s+(.+?)(?:<\/p>|[.]\s*<\/p>)",
            html,
            flags=re.S | re.I,
        )
        if pyramid_match:
            top_notes = _split_notes(pyramid_match.group(1))
            middle_notes = _split_notes(pyramid_match.group(2))
            base_notes = _split_notes(pyramid_match.group(3))

        description_match = re.search(
            r"Perfume rating.*?<\/span>\s*(.*?)\s*Read about this perfume",
            html,
            flags=re.S | re.I,
        )
        description = strip_tags(unescape(description_match.group(1))) if description_match else ""

        rating_match = re.search(r"Perfume rating\s*([\d.]+)\s*out of 5\s*with\s*([\d,]+)\s*votes", html, flags=re.I)
        extra = {
            "notes_source": "fragrantica",
            "notes_source_url": url,
        }
        if rating_match:
            extra.update(
                {
                    "rating_value": rating_match.group(1),
                    "rating_count": rating_match.group(2),
                }
            )

        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=title,
            description=description,
            top_notes=top_notes,
            middle_notes=middle_notes,
            base_notes=base_notes,
            key_notes=[note for note in [*top_notes, *middle_notes, *base_notes] if note],
            accord_text=", ".join(accords),
            source_type="fragrantica",
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            match_hint=title,
            extra=extra,
        )

    def parse_product(self, url: str) -> ScrapeRecord:
        html = self.fetch_text(url)
        raw_path = self.save_raw(url.rsplit("/", 1)[-1].replace(".html", ""), html)
        path_slug = urlparse(url).path.lower()

        if "fragrantica.com" in urlparse(url).netloc:
            return self._parse_fragrantica(url, html, raw_path)

        profile_key = next((key for key in self.product_profiles if key in path_slug), "")
        profile = self.product_profiles.get(profile_key, {})
        ld = _extract_ld_json(html)

        title_match = re.search(r"<title>\s*(.*?)\s*</title>", html, flags=re.S | re.I)
        h1_match = re.search(r"<h1[^>]*>\s*(.*?)\s*</h1>", html, flags=re.S | re.I)
        product_name = profile.get("product_name", "")
        if not product_name and isinstance(ld, dict):
            product_name = ld.get("name", "")
        if not product_name and h1_match:
            product_name = strip_tags(unescape(h1_match.group(1)))
        if not product_name and title_match:
            product_name = strip_tags(unescape(title_match.group(1)))
        description = profile.get("description", "")
        if not description:
            meta_desc = re.search(
                r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
                html,
                flags=re.S | re.I,
            )
            description = strip_tags(unescape(meta_desc.group(1))) if meta_desc else ""

        price_text = profile.get("price_text", "")
        if not price_text:
            price_match = re.search(r"([€$£]\s?\d+(?:[.,]\d{2})?)", html)
            if price_match:
                price_text = price_match.group(1)

        size_options = list(profile.get("size_options", []))
        if not size_options:
            size_options = re.findall(r'\b\d+\s?ML\b', html, flags=re.I)

        release_signal = profile.get("release_signal", "")
        if not release_signal:
            lowered = f"{product_name} {description}".lower()
            if "new" in lowered or "latest" in lowered:
                release_signal = "new product"

        top_notes = list(profile.get("top_notes", []))
        middle_notes = list(profile.get("middle_notes", []))
        base_notes = list(profile.get("base_notes", []))
        accord_text = profile.get("accord_text", "")
        collection = profile.get("collection", "")
        source_id = profile.get("source_id", "")

        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=product_name,
            collection=collection,
            description=description,
            top_notes=top_notes,
            middle_notes=middle_notes,
            base_notes=base_notes,
            key_notes=[note for note in [*top_notes, *middle_notes, *base_notes] if note],
            accord_text=accord_text,
            size_options=size_options,
            price_text=price_text,
            release_signal=release_signal,
            source_type="official_site",
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            source_id=source_id or str((ld.get("sku", "") if isinstance(ld, dict) else "")),
            match_hint=f"{self.brand_name} {product_name}".strip(),
            extra={
                "canonical": url,
                "domain": urlparse(url).netloc,
                "json_ld_type": ld.get("@type", "") if isinstance(ld, dict) else "",
                "source_hint": "official_montale_catalog",
            },
        )
