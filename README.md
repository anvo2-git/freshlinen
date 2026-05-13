# FreshLinen

FreshLinen is a perfume discovery and retrieval prototype built on top of a 68,000-fragrance catalog. The project combines a Next.js frontend, a growing official-brand scraping pipeline, and a local retrieval layer over a merged perfume corpus.

This repository currently contains the Week 6 v1 build:

- a working multi-page perfume app in Next.js
- an official brand scraper for Guerlain, Xerjoff, and Zara
- a curated 50-house niche shortlist for the next scrape wave
- an exploratory Fragrantica-driven discovery dump for future expansion
- a Fragrantica-first perfume discovery script for broader house queues
- a corpus-gap report and retailer-first discovery script for new perfume candidates
- a discovery-queue scraper for new retailer/official product URLs
- generated enrichment artifacts under `data/official-products/`
- a Playwright notes scraper for Fragrantica/Parfumo perfume pages
- automatic notes enrichment that prefers catalog-mapped Fragrantica pages
- a corpus builder that merges catalog and official enrichment data
- a local SQLite FTS retrieval script for natural-language perfume queries
- a first-pass RAG endpoint and UI at `/api/rag/query` and `/rag`
- a small RAG evaluation harness via `npm run rag-eval`
- a live parallel-agent board at `/board`, backed by a shared file outside the worktrees and updated by `scripts/agent-board.py` using `claim` / `ready` / `done`

For parallel work, see the app board at `/board`, the update CLI `scripts/agent-board.py`, the workflow notes in [docs/parallel-agent-workflow.md](/Users/anvo/dev/school/freshlinen/docs/parallel-agent-workflow.md), the board-item blueprint in [docs/board-item-blueprint.md](/Users/anvo/dev/school/freshlinen/docs/board-item-blueprint.md), and the scraping handoff cards in [docs/scrape-task-breakdown.md](/Users/anvo/dev/school/freshlinen/docs/scrape-task-breakdown.md).

## v1 scope

The current v1 focuses on getting an end-to-end retrieval workflow working before adding a full LLM-backed answer generation service.

Implemented:

- catalog-backed perfume browsing and recommendation UI
- official release scraping pipeline
- curated 50-house niche shortlist at `data/house-shortlist.csv`
- exploratory discovery via Fragrantica home/news plus registry/seed blending
- Fragrantica-first perfume discovery from the linked 70k catalog
- RAG corpus generation into `data/rag/perfume-documents.jsonl`
- local full-text retrieval over the corpus via `scripts/query-rag.py`
- app-level retrieval via `/rag` backed by `src/lib/rag.ts`

Planned next:

- backend RAG API for retrieval + answer generation
- embeddings / hybrid retrieval experiments
- evaluation workflow and dashboard

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS v4
- Python scripts for data ingestion and retrieval tooling
- SQLite FTS5 for local retrieval prototyping
- Supabase and Clerk for app persistence/auth in the web app

## Key scripts

```bash
npm run dev
npm run brand-registry
npm run discover-houses
npm run scrape-houses
npm run official-scrape
npm run build-rag
python3 scripts/query-rag.py "woody winter vanilla" --limit 5
```

The in-app retrieval UI is available at `/rag`, and the JSON endpoint is `GET /api/rag/query?q=...&limit=...`.
Run `npm run rag-eval` after starting the app to score the fixed RAG query set against the live endpoint.
The machine-readable benchmark cases live at `data/rag/eval-manifest.json`.

## Data outputs

Generated artifacts currently include:

- `data/brand-registry.csv`
- `data/house-shortlist.csv`
- `data/house-candidates.csv`
- `data/official-products/*.jsonl`
- `data/official-products/latest-release-enrichment.csv`
- `data/notes/*.jsonl` when you run the note scraper
- `data/rag/perfume-documents.jsonl`
- `data/rag/manifest.json`

## Notes scraping

The official-site scraper is good for metadata, but the note pyramids are often better sourced from Fragrantica or Parfumo.
The current note scraper also captures main accords and performance stats when the source exposes them.
The house/product scrape now runs a notes enrichment pass automatically and only merges results when the match is confident.

If you want a broader perfume queue before scraping official sites, start with:

```bash
python3 scripts/discover-perfumes.py --houses-file data/house-shortlist.csv --output data/fragrantica-perfume-discovery.csv
python3 scripts/filter-perfume-discovery.py --discovery data/fragrantica-perfume-discovery.csv --existing-corpus data/rag/perfume-documents.jsonl --output data/fragrantica-perfume-discovery.filtered.csv
python3 scripts/corpus-gap-report.py --output data/corpus-gap-report.csv
python3 scripts/discover-retailer-perfumes.py --houses-file data/house-shortlist.csv --existing-corpus data/rag/perfume-documents.jsonl --output data/retailer-perfume-discovery.csv
python3 scripts/discover-retailer-perfumes.py --brand-slugs montale,l-artisan-parfumeur,henry-jacques --existing-corpus data/rag/perfume-documents.jsonl --output data/retailer-perfume-discovery-montale.csv
python3 scripts/scrape-discovery-queue.py --discovery data/retailer-perfume-discovery.csv --existing-corpus data/rag/perfume-documents.jsonl --brand-slugs xerjoff,amouage,parfums-de-marly
python3 scripts/scrape-discovery-queue.py --discovery data/retailer-perfume-discovery-montale.csv --existing-corpus data/rag/perfume-documents.jsonl --brand-slugs montale,l-artisan-parfumeur,henry-jacques
```

That script mines the Fragrantica-linked corpus and is the right first step when a house's official site is too sparse to use as the primary discovery source.
Always filter the discovery queue against the existing corpus before scraping anything new so we avoid overscraping duplicates.
Use the gap report to prioritize houses with weak coverage in the merged corpus, then use retailer discovery for the actual new perfume queue.
The discovery-queue scraper writes fresh rows into `data/retailer-products/` and the corpus builder now folds those rows into the merged RAG corpus automatically.
Use `--brand-slugs` for a comma-separated deterministic chunk, or `--brands-file` for one brand slug per line. The scraper keeps the existing merged-corpus dedupe and output layout unchanged.
The retailer discovery step also accepts `--brand-slugs` and `--brands-file`, so you can target the exact uncovered houses from the gap report.

Use the Playwright-based note scraper when you need structured top/middle/base notes:

```bash
npm run scrape-notes -- \
  --url https://www.fragrantica.com/perfume/Xerjoff/1888-21616.html \
  --url https://www.parfumo.com/Perfumes/Xerjoff/Casamorati_1888 \
  --output data/notes/xerjoff-1888.jsonl
```

Current parsing priority:

1. Exact Fragrantica URL from the existing catalog, when available
2. Fragrantica summary sentence and pyramid sections
3. Fragrantica main accords plus rating, longevity, and sillage where available
4. Parfumo pyramid sections, main accords, and numeric scent/longevity/sillage
5. Official-site descriptions and tags as a fallback, not a substitute for notes

## Notes

- Zara scraping is partially blocked by `403` responses in the current environment, so blocked items are preserved as seed metadata instead of failing the run.
- The house pipeline now prefers the curated niche shortlist first, with the exploratory discovery dump kept around for future expansion.
- The retrieval layer in v1 is lexical FTS over a merged perfume corpus. This is a staging point for later embedding-based retrieval and evaluation work.
- `data/rag/perfume-fts.db` is intentionally not committed because it is rebuilt automatically on first query.
