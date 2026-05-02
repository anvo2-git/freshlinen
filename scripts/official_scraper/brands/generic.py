from __future__ import annotations

import json
import re
from html import unescape
from urllib.parse import quote, urljoin, urlparse

from ..base import BrandAdapter, ScrapeRecord, slugify, strip_tags


def _same_domain(url: str, base_url: str) -> bool:
    return urlparse(url).netloc == urlparse(base_url).netloc


def _looks_like_product_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    if not path or path.endswith("/"):
        return False
    if any(segment in path for segment in ["/cart", "/account", "/search", "/collections", "/blogs", "/pages"]):
        return False
    return any(
        token in path
        for token in [
            "/product/",
            "/products/",
            "/perfume/",
            "/fragrance/",
            "/p/",
            ".html",
        ]
    )


class GenericOfficialSiteAdapter(BrandAdapter):
    source_type = "official_site"

    def __init__(self, output_root, brand_name: str, official_url: str, seed_file=None):
        self.brand_name = brand_name
        self.brand_slug = slugify(brand_name)
        self.official_url = official_url
        parsed = urlparse(official_url)
        self.base_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else official_url
        self.collection_url = official_url
        super().__init__(output_root, seed_file=seed_file)

    def list_product_urls(self) -> list[str]:
        urls = {row["source_url"] for row in self.seed_rows if row.get("source_url")}
        if not self.official_url:
            return self._fragrantica_fallback(urls)

        try:
            html = self.fetch_text(self.collection_url)
            self.save_raw("collection", html)
        except Exception:
            return self._fragrantica_fallback(urls)

        hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
        for href in hrefs:
            resolved = urljoin(self.base_url, unescape(href))
            if not _same_domain(resolved, self.base_url):
                continue
            if _looks_like_product_url(resolved):
                urls.add(resolved.split("#", 1)[0])
        if _looks_like_product_url(self.official_url):
            urls.add(self.official_url)
        return self._fragrantica_fallback(urls)

    def _fragrantica_fallback(self, urls: set[str]) -> list[str]:
        search_url = f"https://www.fragrantica.com/search/?query={quote(self.brand_name)}"
        try:
            html = self.fetch_text(search_url)
            self.save_raw("fragrantica-search", html)
            hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
            for href in hrefs:
                resolved = urljoin("https://www.fragrantica.com", unescape(href))
                if "fragrantica.com/perfume/" in resolved:
                    urls.add(resolved.split("#", 1)[0])
        except Exception:
            pass
        return sorted(urls)

    def _extract_json_ld(self, html: str) -> dict:
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

    def parse_product(self, url: str) -> ScrapeRecord:
        html = self.fetch_text(url)
        raw_path = self.save_raw(url.rsplit("/", 1)[-1].replace(".html", ""), html)
        source_type = "fragrantica" if "fragrantica.com" in urlparse(url).netloc else self.source_type
        title_match = re.search(r"<title>\s*(.*?)\s*</title>", html, flags=re.S | re.I)
        meta_desc = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
            html,
            flags=re.S | re.I,
        )
        og_title = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']',
            html,
            flags=re.S | re.I,
        )
        ld = self._extract_json_ld(html)

        name = (
            (ld.get("name") if isinstance(ld, dict) else "") or
            (og_title.group(1) if og_title else "") or
            (title_match.group(1) if title_match else "")
        )
        name = strip_tags(unescape(name)).strip()

        description = strip_tags(
            unescape(
                (ld.get("description") if isinstance(ld, dict) else "")
                or (meta_desc.group(1) if meta_desc else "")
            )
        )

        collection = ""
        if name:
            clean_name = name
            if self.brand_name.lower() in clean_name.lower():
                collection = re.sub(re.escape(self.brand_name), "", clean_name, flags=re.I).strip(" -|·")
        if not collection:
            slug = url.rsplit("/", 1)[-1].replace(".html", "")
            collection = re.sub(r"[-_]+", " ", re.sub(r"-P\d+$", "", slug)).strip().title()

        size_options: list[str] = []
        price_text = ""
        release_signal = ""
        text = f"{name} {description}".lower()
        if "new" in text or "new arrival" in text or "new fragrance" in text:
            release_signal = "new product"
        elif "limited edition" in text or "limited" in text:
            release_signal = "limited edition"
        elif "2026" in text:
            release_signal = "mentions 2026"

        offers = ld.get("offers") if isinstance(ld, dict) else None
        if isinstance(offers, dict):
            price = offers.get("price")
            if price:
                price_text = f"USD {price}"
            availability = offers.get("availability")
            if availability:
                size_options.append(str(availability).rsplit("/", 1)[-1])
        elif isinstance(offers, list) and offers:
            for offer in offers:
                if isinstance(offer, dict) and offer.get("price"):
                    price_text = f"USD {offer['price']}"
                    break

        if not price_text:
            price_match = re.search(r'([$€£]\s?\d+(?:\.\d{2})?)', html)
            if price_match:
                price_text = price_match.group(1)

        return ScrapeRecord(
            brand_name=self.brand_name,
            official_url=url,
            product_name=name,
            collection=collection,
            description=description,
            size_options=size_options,
            price_text=price_text,
            release_signal=release_signal,
            source_type=source_type,
            scraped_at=self.run_id,
            raw_html_path=raw_path,
            source_status="ok",
            source_id=str(ld.get("sku", "")) if isinstance(ld, dict) else "",
            match_hint=f"{self.brand_name} {name}".strip(),
            extra={
                "canonical": url,
                "json_ld_type": ld.get("@type", "") if isinstance(ld, dict) else "",
                "domain": urlparse(url).netloc,
            },
        )
