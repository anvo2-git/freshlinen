# Assignment 3 Reflection, The Common Nose, Electric Boogaloo

## 1. What did you build, and what does it do?

I took my perfume recommendation web app (in assignment 2) and attached a database to it to store user favourites. Also I really really wanted to have a relevant API to pull related to perfumes (technically I implemented a perfume search -> if doesnt exist in database then scrape Fragrantica, but I didn't know if that would have counted as API), so I... did a little GPS  +  weather -> recced perfume vibe thing.  The app lets you discover new fragrances through FOUR! paths:
- searching a catalog of 68,000 perfumes (or more on Fragrantica!!!) and picking up to 3 seeds for similarity-based recommendations
- building a scent profile by selecting leading and trailing accords
- taking a 5-question quiz that maps preferences to accord families.
- weather + GPS based path.

The recommendation engine works by representing each perfume as a vector of accord weights and ranking candidates by cosine similarity to the user's seed perfumes. A Dirichlet refinement layer sits on top and alters those rankings as users vote thumbs-up or thumbs-down on recommendations. Authenticated users (via Clerk + Supabase) can save favorites that persist across sessions. A "Today's Scent" page uses the browser's geolocation API with an Open-Meteo weather proxy to suggest accords appropriate for current conditions. I also added a first-pass RAG layer over the merged perfume corpus, with a `/rag` page and `/api/rag/query` endpoint for lexical retrieval over brand, name, notes, accords, and snippets.

## 2. What was the hardest technical challenge, and how did you solve it?

The hardest challenge was a cascade of broken native binaries caused by a disk-full event on WSL2 (my Claude kept shitting itself and exiting the terminal and that got me real STRESSED but I ignored her. Then WSL started giving me CORE DUMP warnings ((????!))). But it's all ok now. The symptoms looked like a Node.js or Next.js bug. The build worker was crashing with SIGBUS (bus error / memory-mapped file fault) — but the real cause was that three Rust-compiled `.node` addons (`@tailwindcss/oxide`, `lightningcss`, `@unrs/resolver-binding`) had been silently corrupted when the filesystem ran out of space mid-write. The error message gave no indication of which binary was at fault.

Ian's note: Claude tried to fix this for a VERY long time, and discouraged me from continue fixing it for awhile (since the Vercel version built) - it yapped to me a lot about CI/CD instead of local building. I had to give Claude context that 'hey my WSL just shat itself due to a core dump' for it to be able to fix it. So lesson learn is don't just 'Claude fix my mess' - you gotta help her out.

The solution was to isolate each native addon individually with a minimal `require()` test, identify which ones crashed with SIGBUS, re-download fresh tarballs from the npm registry, and overwrite the corrupted binaries. Additionally, `@supabase/supabase-js` ships empty `.d.mts` TypeScript declaration files (a known packaging quirk), which caused a separate type-checking failure; those were fixed by writing re-export stubs pointing at the `.d.cts` equivalents, now automated in a `postinstall` script.

Ian: I love that for you Claude, or sorry that happened.

## 3. What would you do differently or add with more time?

With more time I would replace the static big ass JSON bundle (14 MB served on first load) with a Supabase-backed search endpoint that queries a proper full-text index. The current approach works but forces the client to download the entire catalog before any search can run. I would also wire the frontend to the existing `perfume_notes` Supabase table so personal notes persist across sessions (the schema exists but is not yet connected to the UI), and add aggregated community favorites per perfume. I would also expand the new RAG layer from lexical retrieval into embeddings plus an evaluation harness so I can tell whether the answers are actually better instead of just more complicated. I would also fix it so the Search function is more responsive. Right now it freezes whenever you type in a letter. Also, images of the bottles would be nice. But considering there's no API available this would be hard/impossible :/


## 4. What did you learn about building with external APIs and authentication?

Claude:
The main lesson is that the integration layer between two auth systems is where complexity hides. Clerk handles identity and issues JWTs; Supabase uses those JWTs to enforce row-level security via `auth.jwt() ->> 'sub'`. Getting that chain right required configuring Third-Party Auth in the Supabase dashboard, writing RLS policies, and passing the Clerk session token as Supabase's `accessToken` on every request. None of that is difficult once you understand the model, but the failure mode — silently blocked database writes with no visible error to the user — is hard to debug without logging.

The broader lesson is that multi-vendor stacks (Next.js + Clerk + Supabase + Open-Meteo + Wikipedia) introduce a lot of surface area where packaging bugs, empty distribution files, and mismatched key formats can combine to produce failures that look unrelated to their actual cause. Defensive tooling — the `patch-esm.js` postinstall script and individual binary smoke tests — paid off more than expected.

Ian:
Honestly, not... a whole not in the beginning? And also near the end. I fed Claude Andre's slides, and Claude followed it, and whenever Claude needed anythnig from me I just followed her instructions. And then things kinda just worked out. I took it upon myself to kind of google/youtube/etc etc things to get an understanding and un-blackbox the process, but that's entirely orthogonal to having a functional simple auth + backend system vibecoded by Claude. I reckon that the more you know what's going on the easier it would be for you to help Claude unfuck itself (because some of the errors took her quite awhile).

## 5. RAG addendum

The perfume RAG work now goes beyond a plain lexical search prototype. I built a first-pass retrieval layer over the merged perfume corpus, exposed it at `/api/rag/query` and `/rag`, and then tightened the benchmark into a qrels-style evaluation set anchored to canonical corpus URLs. The evaluator now has a local mode, a saved latest run, and a dashboard at `/rag/eval` so the benchmark is inspectable instead of hidden in a script.

After calibrating the eval set, I upgraded the retriever itself: it now combines token overlap with fuzzy candidate boosts, canonical name handling, and a short answer brief that summarizes the best hits in perfume language. The dashboard and benchmark docs now reflect the same canonical corpus-backed judgments, so the retrieval behavior and the evaluation protocol are aligned instead of drifting apart.

What I learned is that the benchmark has to come first if the RAG is meant to be useful. Once the eval started resolving to real corpus URLs and using graded judgments, it became obvious which query types were strong and which ones still needed work. That made the retrieval tuning meaningful instead of subjective.

The next useful move is to keep improving the answer quality and ranking on vibe, similarity, and comparison queries while preserving exact lookup reliability.
