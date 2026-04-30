# FreshLinen

FreshLinen is a perfume discovery and retrieval prototype built on top of a 68,000-fragrance catalog. The project combines a Next.js frontend, a growing official-brand scraping pipeline, and a local retrieval layer over a merged perfume corpus.

This repository currently contains the Week 6 v1 build:

- a working multi-page perfume app in Next.js
- an official brand scraper for Guerlain, Xerjoff, and Zara
- generated enrichment artifacts under `data/official-products/`
- a corpus builder that merges catalog and official enrichment data
- a local SQLite FTS retrieval script for natural-language perfume queries

## v1 scope

The current v1 focuses on getting an end-to-end retrieval workflow working before adding a full LLM-backed answer generation service.

Implemented:

- catalog-backed perfume browsing and recommendation UI
- official release scraping pipeline
- RAG corpus generation into `data/rag/perfume-documents.jsonl`
- local full-text retrieval over the corpus via `scripts/query-rag.py`

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
npm run official-scrape
npm run build-rag
python3 scripts/query-rag.py "woody winter vanilla" --limit 5
```

## Data outputs

Generated artifacts currently include:

- `data/brand-registry.csv`
- `data/official-products/*.jsonl`
- `data/official-products/latest-release-enrichment.csv`
- `data/rag/perfume-documents.jsonl`
- `data/rag/manifest.json`

## Notes

- Zara scraping is partially blocked by `403` responses in the current environment, so blocked items are preserved as seed metadata instead of failing the run.
- The retrieval layer in v1 is lexical FTS over a merged perfume corpus. This is a staging point for later embedding-based retrieval and evaluation work.
- `data/rag/perfume-fts.db` is intentionally not committed because it is rebuilt automatically on first query.
