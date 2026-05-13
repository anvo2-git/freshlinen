# RAG Todo

This is the next-step backlog for the perfume RAG work.

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
