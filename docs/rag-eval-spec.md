# RAG Evaluation Spec

This document defines the first perfume-RAG evaluation protocol for FreshLinen.
The goal is not just to see whether retrieval "works", but whether it works on the
actual hard perfume tasks that the literature suggests are difficult: mapping vague
descriptions to scent structure, disambiguating similar fragrances, and ranking
good alternatives under incomplete relevance judgments.

## 1. Scope

The eval should measure three layers separately:

1. Retrieval quality
- Does the system surface the right perfumes or perfume-like documents?
- Are the top-ranked items relevant for the query intent?

2. Rank quality
- Are the best items near the top?
- Does ordering improve with better signals?

3. Perfume-task fit
- Can the system handle perfume-specific tasks like vibe search, note estimation,
  similarity, and comparison?

The current corpus is a retrieval corpus over perfumes and enrichment records, so
the first evaluation pass should focus on retrieval. Answer generation can be
evaluated later as a separate layer.

## 2. Why perfume is a hard retrieval domain

Perfume search is difficult because scent language is indirect and subjective.
Recent perfume-note work treats descriptive-text-to-note mapping as a real NLP task,
and reports top-k hit rate and MRR as useful measures.

Perfume recommendation work also evaluates beyond top-1 accuracy, using ranking and
catalog metrics such as `nDCG@k`, `Precision@k`, `Recall@k`, `Diversity`, and
`Coverage`.

That implies a strong perfume eval must cover:

- exact name lookup
- vibe-to-perfume mapping
- note/accord inference from prose
- similarity and alternatives
- comparison
- constraint satisfaction
- abstention when the query is under-specified

## 3. Query taxonomy

Every eval case must belong to exactly one primary intent.

### 3.1 Exact lookup

Examples:

- `Layton`
- `Dior Sauvage`
- `Tom Ford Black Orchid`

Purpose:

- Verify that exact perfume and brand mentions are recovered reliably.

Expected behavior:

- The canonical perfume should usually be `rank 1`.
- Alias and formatted-name variants should also be recognized.

### 3.2 Vibe search

Examples:

- `clean rainy iris`
- `smoky vanilla winter`
- `fresh woody summer`
- `powdery iris`

Purpose:

- Test perfume-language understanding when the query is a natural-language scent
  description rather than a perfume title.

Expected behavior:

- Top 3 to top 5 should contain plausible matches.
- A good result may not match the query literally, but should satisfy most of the
  scent constraints.

### 3.3 Note / accord constraint search

Examples:

- `rose oud incense`
- `citrus musk cedar`
- `amber vanilla leather`

Purpose:

- Test whether the retriever can satisfy explicit note and accord constraints.

Expected behavior:

- Returned perfumes should contain the majority of the named notes or accords.
- Partial matches are acceptable only when the query is intentionally broad.

### 3.4 Similarity / alternatives

Examples:

- `similar to Layton but less sweet`
- `alternatives to Naxos`
- `what is like Black Orchid but lighter`

Purpose:

- Test whether retrieval can preserve a perfume's core identity while shifting one
  axis such as sweetness, darkness, smokiness, or density.

Expected behavior:

- The top results should be close to the seed perfume or concept, but not duplicate
  the exact source perfume unless the query asks for it.

### 3.5 Comparison

Examples:

- `Layton vs Herod`
- `Xerjoff Naxos vs Layton`
- `Black Orchid vs Velvet Orchid`

Purpose:

- Test whether the system can retrieve both sides of a comparison cleanly.

Expected behavior:

- Both compared perfumes should appear in the top set.
- The system should expose discriminating attributes, not just one-sided matches.

### 3.6 Filtering / attribute search

Examples:

- `niche vanilla under 200`
- `new fragrance amber`
- `rose oud incense by niche house`

Purpose:

- Test structured filtering through natural language.

Expected behavior:

- The result set should satisfy the constraints, even if lexical overlap is modest.

### 3.7 Negative / abstain

Examples:

- intentionally ambiguous or impossible queries
- overly broad queries like `best perfume ever`
- conflicting constraints like `fresh smoky aquatic leather`

Purpose:

- Test whether the system can acknowledge weak evidence and avoid overclaiming.

Expected behavior:

- The top results may be weak, but the system should not look overconfident.
- Later answer-generation should be able to say the evidence is thin.

## 4. Relevance labels

Use graded relevance, not just binary relevance.

Recommended grades:

- `3 = highly relevant`
- `2 = relevant`
- `1 = partially relevant`
- `0 = not relevant`

Grade definitions:

- `3`: exact perfume match, or a near-perfect perfume match for the intent
- `2`: strongly satisfies the scent constraints or is a clear alternative
- `1`: partially matches the scent space, but misses one major constraint
- `0`: irrelevant or misleading

For exact lookup tasks, `3` is usually reserved for the canonical perfume.
For vibe and similarity tasks, the grader may assign `2` or `3` to multiple items.

## 5. Judging protocol

### 5.1 Pooling

Do not judge the entire corpus exhaustively.

Instead:

1. Run multiple retrieval baselines.
2. Pool the union of their top-k candidates.
3. Judge the pooled candidates.

This is standard practice in IR because relevance assessments are usually incomplete.
Incomplete judgment handling is one reason metrics like `bpref` exist, and why
pooling depth matters.

### 5.2 Judging rules

When judging a perfume result, consider:

- exact name and brand
- top / middle / base notes
- accords
- release signal
- collection and line identity
- strength of the scent-vibe match
- whether the result is a valid alternative or just a keyword echo

Gold-standard judgments should resolve to canonical corpus documents. For this
project, that means the exported qrels should use corpus URLs as docno values,
and every non-manual-review judgment should map to at least one real corpus row
before it is accepted.

Avoid judging by brand prestige alone.

### 5.3 Ties and aliases

Treat a result as correct if it is:

- the canonical perfume
- a stable alias / formatting variant of the same perfume
- a clearly equivalent entry for the same product

Different product sizes or special editions should be judged separately unless the
query clearly refers to the line as a whole.

## 6. Metrics

### 6.1 Primary metrics

Use these as the default retrieval metrics:

- `MRR@10`
- `Recall@5`
- `Recall@10`
- `nDCG@10`
- `MAP@10`
- `Precision@3`

Why:

- `MRR` is good for exact lookup and "first good hit" behavior.
- `Recall@k` is good for vibe and filtering queries.
- `nDCG@k` respects rank order for graded relevance.
- `MAP@k` is useful when there are multiple relevant perfumes per query.
- `Precision@3` is a good fit for the small top-of-list user experience.

### 6.2 Secondary metrics

Use these when the eval grows beyond a small hand-curated set:

- `bpref` for incomplete judgments
- `Top-K accuracy`
- `Coverage`
- `Diversity`

The perfume recommendation literature also uses diversity and coverage, which is
important because a retriever that only finds near-duplicates is not a good advisor.

### 6.3 Separate exact vs vibe reporting

Report exact and non-exact tasks separately.

Suggested breakdown:

- Exact lookup: `Top-1 accuracy`, `MRR@10`, `nDCG@10`
- Vibe search: `Recall@5`, `nDCG@10`
- Similarity / alternatives: `MRR@10`, `nDCG@10`, `Recall@5`
- Comparison: `Recall@5` for both target perfumes
- Filtering: `Recall@5`, `Precision@3`
- Negative / abstain: manual review plus failure rate

## 7. Perfume-specific hard cases

The eval should include cases that reflect known difficulty in perfume language.

### 7.1 Vague olfactory language

Perfume descriptions often rely on metaphor, mood, and style words instead of direct
ingredient lists. Include queries like:

- `clean rainy iris`
- `cold powdery musk`
- `dark smoky rose`

### 7.2 Descriptive-to-note mapping

The note-estimation literature treats free-text descriptions and note recovery as a
real task. Include cases where the query is a description and the expected target
contains the corresponding notes or accords.

Examples:

- `bright citrus opening with musk and cedar`
- `apple lavender vanilla`
- `rose with oud and incense`

### 7.3 Close-family disambiguation

Perfumes often share overlapping note families. Include cases where the system must
separate similar fragrances:

- vanilla vs smoky vanilla
- fresh spicy vs aromatic fresh
- woody amber vs woody oud

### 7.4 Style shifts

Include queries that ask for the same perfume family but with one attribute changed:

- less sweet
- more airy
- darker
- cleaner
- more wearable

### 7.5 Under-specified queries

Perfume language is noisy and incomplete in the wild. Include queries with missing or
conflicting constraints so the system can be judged on whether it degrades gracefully.

## 8. Minimum eval set composition

For a first rigorous version, aim for at least 40 queries:

- 10 exact lookup
- 10 vibe search
- 8 note / accord constraint
- 6 similarity / alternatives
- 4 comparison
- 2 negative / abstain

If the benchmark is expanded later, target 80 to 120 queries with more balanced
coverage across houses, styles, and difficulty.

## 9. Sampling guidelines

When adding cases, balance the set across:

- mainstream and niche houses
- men / women / unisex labels where relevant
- fresh / floral / woody / amber / gourmand / smoky styles
- easy and hard queries
- exact and fuzzy intents

Avoid overfitting the benchmark to a single famous fragrance cluster.

## 10. Acceptance thresholds

These are starting thresholds for the first-pass system.

- Exact lookup `MRR@10`: high, ideally close to 1.0 on canonical names
- Exact lookup `Top-1 accuracy`: high
- Vibe search `Recall@5`: should be meaningfully above chance
- Similarity tasks: top 3 should include at least one plausible alternative
- Negative queries: low overconfidence, with manual review of failures

For a small benchmark, absolute thresholds matter less than consistency across
iteration. The key question is whether a change improves the same queries without
breaking the others.

## 11. Output format

Store eval cases in a machine-readable file once the set stabilizes.

Recommended fields:

- `id`
- `query`
- `intent`
- `expected`
- `relevant_docs`
- `hardness`
- `notes`

For `relevant_docs`, prefer canonical corpus doc identifiers, ideally the exact
URLs exported into `data/rag/eval.qrels`.

Recommended result fields:

- `rank`
- `doc_id`
- `brand`
- `name`
- `score`
- `matched_terms`
- `judgment`

## 12. Benchmark checklist

Use this checklist whenever you add or change eval cases:

1. Does the judgment resolve to a real corpus URL?
2. Is the intent clear?
3. Is the case discriminative?
4. Is the query representative of a real user task?
5. Is the relevance label defensible?
6. Does it avoid fuzzy duplicate credit?
7. Does it cover a distinct failure mode?
8. Does the qrels export still look canonical?
9. Does the benchmark still have a healthy mix?
10. Does a rerun change the score in a sensible way?
11. Is the case hard enough to matter but not impossible?
12. Would a second judge plausibly agree?

## 13. References

- BEIR metrics wiki: [Metrics available](https://github.com/beir-cellar/beir/wiki/Metrics-available)
- BEIR paper: [OpenReview / BEIR](https://openreview.net/forum?id=wCu6T5xFjeJ)
- Perfume note estimation: [An NLP-Based Perfume Note Estimation Based on Descriptive Sentences](https://www.mdpi.com/2076-3417/14/20/9293)
- Perfume recommendation metrics: [Personalized Perfume Recommendations Based on User Descriptions Using Cosine and Jaccard Similarity](https://www.sciencedirect.com/science/article/pii/S1877050925027127)
- Olfactory language difficulty: [The language of scents](https://www.nature.com/articles/s41599-026-07494-4)
- Incomplete relevance judgments: [Sakai & Kando 2008](https://link.springer.com/article/10.1007/s10791-008-9059-7)
