from __future__ import annotations

import json
import re
from html import unescape
from urllib.parse import urljoin

import requests

from ..base import BrandAdapter, ScrapeRecord, slugify, strip_tags


class GuerlainAdapter(BrandAdapter):
    brand_name = "Guerlain"
    brand_slug = "guerlain"
    base_url = "https://www.guerlain.com"
    fragrance_grid = (
        "https://www.guerlain.com/on/demandware.store/"
        "Sites-Guerlain_US-Site/en_US/Search-UpdateGrid?cgid=fragrance"
    )
    listing_url = "https://www.guerlain.com/us/en-us/fragrance/"

    def _get_text(self, url: str) -> str:
        response = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": self.listing_url,
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.text

    def list_product_urls(self) -> list[str]:
        urls = set()
        self._get_text(self.listing_url)
        for start in (0, 120, 240):
            grid_url = f"{self.fragrance_grid}&start={start}&sz=120"
            text = self._get_text(grid_url)
            self.save_raw(f"grid-{start}", text)
            matches = re.findall(r'/us/en-us/p/[^"\'?# ]+\.html', text)
            for match in matches:
                if "personalization" in match or match.endswith("/p/P062413.html"):
                    continue
                urls.add(urljoin(self.base_url, unescape(match)))
        for row in self.seed_rows:
            urls.add(row["source_url"])
        return sorted(urls)

    def _extract_product_json(self, html: str) -> dict:
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
            if isinstance(parsed, dict) and parsed.get("@type") == "Product":
                return parsed
        raise ValueError("No product JSON-LD found")

    def parse_product(self, url: str) -> ScrapeRecord:
        html = self._get_text(url)
        raw_path = self.save_raw(url.rsplit("/", 1)[-1].replace(".html", ""), html)
        try:
            product = self._extract_product_json(html)
        except ValueError:
            title_match = re.search(r"<title>\s*(.*?)\s*</title>", html, flags=re.S | re.I)
            desc_match = re.search(
                r'<meta name="description" content="(.*?)"\s*/?>',
                html,
                flags=re.S | re.I,
            )
            title = strip_tags(unescape(title_match.group(1))) if title_match else ""
            description = strip_tags(unescape(desc_match.group(1))) if desc_match else ""
            slug = url.rsplit("/", 1)[-1].replace(".html", "")
            if "/p/" not in url:
                return ScrapeRecord(
                    brand_name=self.brand_name,
                    official_url=url,
                    product_name=title,
                    description=description,
                    scraped_at=self.run_id,
                    raw_html_path=raw_path,
                    source_status="blocked" if not title else "seed_only",
                    source_type="official_site",
                    match_hint=f"{self.brand_name} {title}".strip(),
                    extra={"fallback": "meta_only"},
                )
            return ScrapeRecord(
                brand_name=self.brand_name,
                official_url=url,
                product_name=title,
                collection=re.sub(r"-P\d+$", "", slug).replace("-", " ").title(),
                description=description,
                scraped_at=self.run_id,
                raw_html_path=raw_path,
                source_status="ok",
                source_type="official_site",
                match_hint=f"{self.brand_name} {title}".strip(),
                extra={"fallback": "meta_only"},
            )

        description = strip_tags(product.get("description", ""))
        name = product.get("name", "").strip()
        slug = url.rsplit("/", 1)[-1].replace(".html", "")

        collection = ""
        slug_prefix = re.sub(r"-P\d+$", "", slug)
        if slug_prefix and slug_prefix != slugify(name):
            collection = slug_prefix.split("---", 1)[0].replace("-", " ").title()

        quote_match = re.search(
            r'<h3 class="ecrin-quoteText">\s*(.*?)\s*</h3>.*?<p>\s*(.*?)\s*</p>',
            html,
            flags=re.S | re.I,
        )
        accord_text = ""
        if quote_match:
            accord_text = strip_tags(f"{quote_match.group(1)} {quote_match.group(2)}")

        release_signal = ""
        desc_lower = description.lower()
        if "2026" in description:
            release_signal = "mentions 2026 in official description"
        elif "limited" in desc_lower:
            release_signal = "limited edition"

        offers = product.get("offers", {}) if isinstance(product.get("offers"), dict) else {}
        price = offers.get("price")
        price_text = f"USD {price}" if price else ""

        size = product.get("size")
        size_options = [size] if size else []

        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=name,
            collection=collection,
            description=description,
            accord_text=accord_text,
            size_options=size_options,
            price_text=price_text,
            release_signal=release_signal,
            source_type="official_site",
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            source_id=product.get("sku", "") or product.get("mpn", ""),
            match_hint=f"{self.brand_name} {name}",
            extra={
                "category": product.get("category", ""),
                "alternate_name": product.get("alternateName", ""),
                "gtin13": product.get("gtin13", ""),
                "brand_description": product.get("brand", {}).get("description", "")
                if isinstance(product.get("brand"), dict)
                else "",
            },
        )
