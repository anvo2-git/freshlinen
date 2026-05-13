# RAG Todo

This is the next-step backlog for the perfume RAG work.

## Resume here

When we reconnect, start with the current benchmark snapshot and work down this list:

1. Check `/rag/eval` and the latest benchmark snapshot in `data/rag/eval-latest.json`.
2. Improve vibe search on the remaining weak perfume tasks, especially broad scent-language queries.
3. Add run history to the benchmark dashboard so score changes are visible across commits.
4. Keep the answer brief grounded and concise, but make it better at comparisons and alternatives.
5. Decide on a non-Fragrantica source or ingestion path for scrape-backed fallback, because Fragrantica page scraping is blocked here even though the Bing-backed search fallback now finds canonical perfume URLs.

## Done recently

1. Beginner guidance is now built into `/rag` with starter chips for fresh/clean, sweet/vanilla, smoky/incense, woody/cedar, floral/iris, citrus/bright, green/earthy, and musky/skin-like.
2. Semantic scent-language expansion is now wired into the retriever so phrases like rain, linen, soap, incense, lipstick, pencil, and winter map onto the relevant perfume families.
3. The answer brief now surfaces interpreted scent concepts when the query is vague or beginner-friendly.
4. The benchmark now includes beginner-shaped queries so we can track novice helpfulness separately from exact perfume lookup.
5. The Fragrantica fallback search now resolves canonical perfume URLs via Bing, but the scrape step itself returns a hard blocked error instead of a fake success.

## P0

1. Finish the benchmark loop
- Keep the latest eval snapshot fresh after retrieval changes.
- Add run history so `/rag/eval` can compare scores across commits.
- Re-run the benchmark after each retrieval change and capture the delta.

2. Improve vibe and similarity retrieval
- Tune the hybrid scorer for queries like `clean rainy iris` and `smoky vanilla winter`.
- Add a reranker for the top candidate set.
- Reduce over-reliance on generic overlap terms like `fresh`, `sweet`, or `winter`.

## P1

3. Expand answer synthesis
- Turn the answer brief into a grounded comparison summary.
- Cite the strongest retrieved perfumes and the exact matching signals.
- Add explicit abstention language when the evidence is thin.

4. Strengthen the corpus schema
- Preserve more structured fields during corpus build.
- Keep note pyramids, accords, collections, release signals, and provenance separate from the merged text blob.

5. Grow the eval set carefully
- Add more hard perfume tasks, especially comparison and negative cases.
- Use a second pass of human judgment for ambiguous vibe queries.
- Keep qrels mapped to canonical corpus URLs only.

## P2

6. Add retrieval experiments
- Compare lexical-only, hybrid, and reranked retrieval.
- Measure exact lookup, vibe search, comparison, and abstention separately.

7. Improve the app surface
- Add a run history table or chart to `/rag/eval`.
- Add per-case drilldown for failed benchmark queries.
- Keep `/rag` useful as the interactive query page, not just a debugging screen.
