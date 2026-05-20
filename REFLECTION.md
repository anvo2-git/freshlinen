# Fresh Linen Reflection

## What this project is

Fresh Linen is a perfume discovery app built around a chat-first assistant. It helps a user do three things:

1. figure out what they like in fragrance language they can actually use
2. find perfumes that match that taste
3. save, revisit, and refine those results over time

The app is intentionally not just a static catalog browser. It has a conversation layer, a recommendation layer, a retrieval layer, and personal memory. The goal is to make perfume search feel more like talking to a knowledgeable shop assistant than filling out a form.

## The main moving parts

### Chat-first assistant

The homepage now centers a conversational assistant that can:

- onboard a new user with a lightweight taste quiz
- continue as free-form chat afterward
- return results in sets of three
- refine results from follow-up prompts
- save chosen recommendations to the user library

For beginners, the assistant asks what the user wants to smell like, what they explicitly do not want to smell like, and how they want the result to behave. That gives the system a useful preference profile without forcing the user to know perfume jargon.

### Recommendation engine

The recommender is based on accord-weight similarity. Each perfume is represented as a vector of accord weights, and the system ranks candidates by cosine similarity to the user’s session Seeds. A refinement layer adjusts rankings when the user provides feedback or extra context.

The recommender now works alongside:

- session-local Seeds
- persistent Favorites
- beginner quiz context
- optional web research for explicit perfumes

### RAG layer

I added a perfume retrieval layer over the merged corpus. It handles:

- exact perfume lookup
- vibe search
- note and accord constraints
- comparison queries
- blend queries like “smells like X but with Y”
- beginner-friendly search prompts

The RAG system evolved from simple lexical matching into a more structured retrieval pipeline with semantic scent concepts, canonical name handling, candidate reranking, and a short answer brief.

### Personal memory

Authenticated users have account-backed memory through Clerk and Supabase. The app now stores:

- favorites
- saved recommendations
- chat threads
- chat messages
- onboarding / taste profile

Anonymous users still get session storage so the app remains usable without sign-in, but the signed-in path now persists across devices.

### Scraping and corpus building

The app also has a best-effort scrape-on-demand pipeline. When the merged corpus misses a perfume, the UI can fall back to search and scrape flows. The broader corpus build process merges multiple sources, and the bottle-image pipeline uses best-effort image lookup from available source metadata.

### Evaluation

I added a qrels-style benchmark for perfume retrieval, with graded judgments and canonical corpus identifiers. That made it possible to tune the retriever against an actual evaluation set instead of guessing whether changes “felt better.”

## How the project evolved

This project started as a recommendation app with a seed-based similarity engine. The earliest version was mostly:

- browse a catalog
- pick up to three seeds
- get recommendations based on accord overlap

From there, the project expanded in stages:

1. **Auth and persistence**
   - Clerk + Supabase were added so favorites and user data could persist.

2. **Better browsing surfaces**
   - quiz
   - guide
   - build
   - today/weather-based scent suggestions
   - library for saved memory

3. **RAG**
   - first as a lexical search layer
   - then as a calibrated benchmarked retrieval system
   - then as a chat-facing perfume explanation layer

4. **Chat-first onboarding**
   - the project moved from browse-first navigation toward a conversational assistant
   - the quiz became beginner-first and more perfume-native

5. **Unified memory**
   - Favorites stayed persistent
   - Seeds became session-local taste anchors
   - chat and saved recommendations moved into account-backed storage

6. **Display cleanup**
   - perfume names were normalized
   - notes and accords were separated
   - cards were reworked to show clearer structure
   - bottle art was added where image data exists

The overall direction was to make the app less like a static fragrance database and more like a guided perfume discovery assistant.

## What worked well

- The similarity recommender is effective when the user can provide a few seed perfumes.
- The beginner quiz now captures useful preference data without overwhelming the user.
- The RAG benchmark forced the retrieval behavior to become more disciplined.
- Clerk + Supabase gives the app a clean persistence model for signed-in users.
- The chat-first UI makes the app feel more like a real assistant than a set of separate tools.

## Limitations

There are still clear limits to the system.

### Corpus quality is uneven

Not every perfume has the same level of metadata. Some rows have strong structured note data, while others are mostly accord-heavy or have noisy merged text. That means the UI and the retriever sometimes have to infer structure from imperfect source data.

### Occasion and intensity are still inferred

The app can ask about things like quiet, office-friendly, or high-end, but those are not always direct source fields. They are partly heuristic interpretations of notes, accords, descriptions, and popularity signals.

### Image coverage is incomplete

Bottle art works for some perfumes and not others. Coverage depends on whether trustworthy image URLs are available in the source data or can be resolved from accessible product pages.

### Scraping is source-dependent

Some sources are easy to reach, while others block automation. Fragrantica is especially inconsistent for automated page access. That means some fallback flows can search successfully but still fail on page scraping.

### RAG is still not a perfect semantic engine

The retrieval layer is much better than plain substring matching, but it still depends on the corpus and on curated scent concepts. It can handle many perfume-language questions well, but not all ambiguous prompts are equally reliable.

### Recommendation ranking is still partial

The recommender can use popularity, Seeds, Favorites, and some taste signals, but it still lacks true structured data for things like price sensitivity, projection, longevity, or reliable “office / date / formal” labels across the whole corpus.

## How to overcome the limitations

### 1. Keep improving the corpus

The strongest long-term fix is better source data:

- more consistent note extraction
- cleaner accord separation
- more complete launch / house / concentration metadata
- better image coverage
- more precise product normalization

### 2. Add richer structured signals

The app would benefit from inferred or curated tags for:

- price tier
- niche vs designer
- projection
- longevity
- seasonality
- occasion fit

Those can then become explicit ranking features rather than vague heuristics.

### 3. Continue improving retrieval

The current RAG stack could be extended with:

- embeddings
- a reranker
- better negative/abstain behavior
- more curated semantic scent groups

That would improve vibe search and blend queries without breaking exact lookup.

### 4. Improve image sourcing

The best approach is to prefer stable official or retailer images first, and use fallback mapping only when available. If broader coverage is needed, a curated alternate image source is safer than trying to rely on a single blocked site.

### 5. Expand the account model

Now that signed-in memory is working, the next step is to make the assistant’s state more durable and more useful:

- profile edits over time
- saved chat threads with summaries
- explicit “include Favorites / exclude Favorites” preferences
- better sync between the quiz, the assistant, and the library

### 6. Tighten answer generation

The LLM should keep doing output formatting, explanation, and light research, but the ranking and retrieval should remain grounded. That separation makes the system more reliable.

## What I learned

The biggest lesson was that perfume search is not just a search problem. It is a language problem, a taste-profiling problem, and a data-quality problem at the same time.

I also learned that the infrastructure glue matters more than it looks:

- Clerk and Supabase need to agree on identity
- the app needs a clear split between session memory and account memory
- the retrieval layer needs a benchmark before tuning
- source data needs normalization before the UI can look polished

Once those pieces were aligned, the app became much more coherent. The product is now closer to a true perfume assistant: it can teach, retrieve, recommend, remember, and explain.

## Final summary

Fresh Linen ended up as a chat-first perfume discovery system with:

- a beginner-friendly onboarding flow
- a similarity-based recommender
- a calibrated RAG layer for perfume language
- authenticated memory through Clerk + Supabase
- a library for favorites, saved recs, and chat history
- scrape and corpus build tooling for expanding coverage

The project is most useful when it stays grounded in the corpus and uses the assistant layer to translate user intent into usable fragrance signals. The next gains will come from better metadata, better image coverage, and stronger semantic ranking, not from making the UI more complicated.
