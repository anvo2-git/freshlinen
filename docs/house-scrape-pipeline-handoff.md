# House Scrape Pipeline Handoff

Montale is the reference house for this pipeline. The same structure can be reused for other houses once the outer-level scrape agent swaps in the house-specific adapter and seed URLs.

## Goal

Produce normalized product rows for a house with:

- official-site metadata and descriptions
- Fragrantica-enriched notes and accords
- sillage and longevity when available
- related-perfume / compare data when Fragrantica exposes it
- raw snapshots for every fetched page

## Canonical Flow

The pipeline has two stages:

1. `scripts/official_scraper/*` owns the house product crawl and official-site normalization.
2. `scripts/scrape-notes.js` owns Fragrantica note enrichment, including the encrypted related-perfume payload.

The official scraper writes the house rows first, then the enrichment pass fills note fields from Fragrantica.

## Note Scraper Command

Use `scripts/scrape-notes.js` as the canonical Fragrantica loader.

It accepts:

- `--url <fragrantica-or-parfumo-url>` to scrape a known page directly
- `--query <brand product>` to resolve a Fragrantica perfume page from a brand/product query
- `--output <file.jsonl>` to write JSONL results

The script saves raw HTML snapshots under `data/raw/notes/<timestamp>/...` and returns:

- `top_notes`
- `middle_notes`
- `base_notes`
- `accords`
- `rating_value`
- `longevity_value`
- `sillage_value`
- `similar_perfumes`
- `similar_perfumes_user_votes`

If the house adapter already has a product URL, prefer `--url`. If not, use `--query` with the brand and product name.

## Source Priority

Use sources in this order:

1. Official house site for product metadata and description text.
2. Fragrantica through Playwright for discovery and note extraction.
3. Fragrantica through Playwright for season, longevity, sillage, and compare data when the page exposes them.
4. Parfumo or retailer pages only if Fragrantica or the official site is incomplete.

Do not use plain HTTP fetches for Fragrantica. Use Playwright or the note scraper path that already drives Playwright.

## Montale Reference Implementation

Montale currently uses:

- [`scripts/official_scraper/brands/montale.py`](/Users/anvo/dev/school/freshlinen-scrape/scripts/official_scraper/brands/montale.py)
- [`scripts/official_scraper/runner.py`](/Users/anvo/dev/school/freshlinen-scrape/scripts/official_scraper/runner.py)
- [`scripts/note_enrichment.py`](/Users/anvo/dev/school/freshlinen-scrape/scripts/note_enrichment.py)
- [`scripts/scrape-notes.js`](/Users/anvo/dev/school/freshlinen-scrape/scripts/scrape-notes.js)

The Montale adapter demonstrates the intended split:

- official-site rows are the base record
- Fragrantica is not the source of the official product row
- Fragrantica is the enrichment source for notes, accords, rating, sillage, longevity, season, and compare data

## Required Output Shape

For each product row, aim to preserve:

- `brand_name`
- `official_url`
- `product_name`
- `collection`
- `description`
- `top_notes`
- `middle_notes`
- `base_notes`
- `key_notes`
- `accord_text`
- `price_text`
- `size_options`
- `release_signal`
- `source_type`
- `source_status`
- `raw_html_path`
- `extra`

The `extra` object should hold source-specific metadata.

For Fragrantica-enriched rows, `extra` should include:

- `notes_source`
- `notes_source_url`
- `notes_rating_value`
- `notes_longevity_value`
- `notes_sillage_value`
- `notes_similar_perfumes`
- `notes_similar_perfumes_user_votes`

## Fragrantica Note Scrape Behavior

`scripts/scrape-notes.js` should be the single place that knows how to parse Fragrantica page HTML.

It should extract:

- `top_notes`
- `middle_notes`
- `base_notes`
- `accords`
- `rating_value`
- `rating_count`
- `season_scores`
- `longevity_value`
- `longevity_votes`
- `sillage_value`
- `sillage_votes`
- `similar_perfumes`
- `similar_perfumes_user_votes`

Important detail:

- the compare section is stored in an encrypted `similar_perfumes` blob on the Fragrantica page
- the scraper decrypts that blob and normalizes it into a usable list
- each related-perfume entry carries vote counts, including `votes`, `vote_yes`, and `vote_no`

Do not guess these counts from visible page text. Use the encrypted payload.

## Official Scraper Behavior

The house adapter should:

1. enumerate product URLs
2. fetch the official page
3. save a raw HTML snapshot
4. parse product metadata
5. emit a normalized row
6. let note enrichment fill the Fragrantica fields after the base rows are written

The adapter should not try to reimplement Fragrantica parsing.
The adapter should also not invent its own Fragrantica crawling logic; it should hand pages to `scripts/scrape-notes.js` or the existing note enrichment wrapper.

## Validation Steps

After a house run:

1. Confirm the house JSONL exists under `data/official-products/<brand>-products.jsonl`.
2. Confirm raw snapshots were saved under `data/raw/<brand>/<timestamp>/...`.
3. Check that at least a small valid batch exists.
4. Confirm notes and accords were attached on matched pages.
5. Confirm the `extra.notes_similar_perfumes` field appears on Fragrantica-enriched rows when the source page exposes it.
6. Confirm the release CSV was regenerated if the adapter writes release signals.

## Stop Condition

Stop when:

- the house has a valid batch of rows
- raw snapshots exist for all fetched pages
- note enrichment succeeded for the matched rows
- ambiguous or weak matches were left out rather than forced in

## How To Reuse For Another House

For a new house, the outer-level agent should:

1. clone the Montale pattern into a new adapter under `scripts/official_scraper/brands/`
2. swap in the house-specific curated URLs or discovery URLs
3. keep the official site as the base row source
4. keep Fragrantica as the note enrichment source
5. preserve the same output paths, raw snapshot discipline, and validation checks

If the house has weak official-site coverage, the agent can fall back to Fragrantica or retailer pages, but it should still preserve the same normalized row schema and note-enrichment behavior.

## Fragrantica Enrichment Schema Proposal

This is the recommended shape for richer Fragrantica ingestion on the outer scrape agent.

### Top-Level Row Fields

Keep the official row shape stable:

- `brand_name`
- `official_url`
- `product_name`
- `collection`
- `description`
- `top_notes`
- `middle_notes`
- `base_notes`
- `key_notes`
- `accord_text`
- `price_text`
- `size_options`
- `release_signal`
- `source_type`
- `source_status`
- `raw_html_path`
- `extra`

### `extra` Fields From Fragrantica

Add these to `extra` when the Fragrantica page exposes them:

- `notes_source`
- `notes_source_url`
- `notes_rating_value`
- `notes_rating_count`
- `notes_family`
- `notes_nose`
- `notes_launch_year`
- `notes_gender`
- `notes_reviews_count`
- `notes_when_to_wear`
- `notes_season_scores`
- `notes_longevity_value`
- `notes_longevity_votes`
- `notes_longevity_breakdown`
- `notes_sillage_value`
- `notes_sillage_votes`
- `notes_sillage_breakdown`
- `notes_price_value`
- `notes_price_breakdown`
- `notes_gender_breakdown`
- `notes_relation_breakdown`
- `notes_similar_perfumes`
- `notes_similar_perfumes_user_votes`

### Suggested Shapes

`notes_season_scores`:

```json
[
  {"label": "winter", "value": "44"},
  {"label": "spring", "value": "89"},
  {"label": "summer", "value": "79"},
  {"label": "fall", "value": "86"},
  {"label": "day", "value": "70"},
  {"label": "night", "value": "62"}
]
```

`notes_similar_perfumes`:

```json
[
  {
    "similar_id": 88137,
    "votes": 11,
    "vote_yes": 25,
    "vote_no": 14,
    "perfume": {
      "id": 88137,
      "name": "Black Noir",
      "designer": "Mancera",
      "slug": "Mancera/Black-Noir",
      "sex": "unisex",
      "perfume_url": "/perfume/Mancera/Black-Noir-88137.html",
      "thumbnail": "https://fimgs.net/mdimg/perfume/s.88137.jpg"
    }
  }
]
```

`notes_longevity_breakdown`, `notes_sillage_breakdown`, `notes_price_breakdown`, `notes_gender_breakdown`, and `notes_relation_breakdown` should be objects keyed by the bucket labels Fragrantica renders, for example:

```json
{
  "1": 7,
  "2": 3,
  "3": 25,
  "4": 61,
  "5": 26
}
```

### Recommended Extraction Order

1. Parse visible note pyramid and accords.
2. Parse the visible rating summary.
3. Decode `status` for the structured poll data.
4. Decode `similar_perfumes` for related perfume recommendations.
5. Persist raw HTML so the extractor can be improved later without another live scrape.

### Stop Rule

If a page does not expose one of these fields cleanly, leave it blank or empty rather than inventing a fallback from unrelated text.
