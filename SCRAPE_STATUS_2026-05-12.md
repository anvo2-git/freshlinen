# Scrape Status

Date: 2026-05-12

## Current State

- The house scrape pipeline was paused after a successful tranche of the top 20 candidate houses.
- The batch now skips browser-launch failures and continues past blocked brands.
- Fragrantica note discovery and note enrichment still use the Playwright-backed helpers, but browser launch is failing in this sandbox, so those steps are now treated as recoverable and skipped when needed.

## What Completed In The Last Tranche

- `27 87`
- `Commodity Fragrances`
- `D.S. & Durga`
- `Heeley`
- `Jusbox Perfumes`
- `Maison Tahité`
- `Marissa Zappas`
- `Parfums MDCI`
- `Parle Moi de Parfum`
- `Puredistance`
- `Room 1015`
- `Spirit of Dubai`
- `Orto Parisi`
- `Essential Parfums`
- `Akro`
- `Aedes de Venustas`
- `Maison Crivelli`
- `Initio Parfums Prives`
- `Kerosene`
- `Imaginary Authors`

## Known Blockers

- `Guerlain` official listing fetch can return `403` and is skipped without aborting the batch.
- Fragrantica Playwright helpers can fail to launch in this sandbox with `LAUNCH_FAILURE`, which is now handled as a recoverable skip.

## Next Houses To Scrape

Priority from the refreshed gap report:

1. `L'Artisan Parfumeur`
2. `Henry Jacques`
3. `Ormonde Jayne`
4. `Memo Paris`
5. `Le Labo`
6. `Maison Francis Kurkdjian`
7. `Atelier Cologne`
8. `Bortnikoff`
9. `Fragrance du Bois`
10. `Houbigant`
11. `Zoologist Perfumes`
12. `The House of Oud`
13. `Be Layered`

## Resume Command

Recommended next batch:

```bash
python3 scripts/scrape-houses.py --houses-file data/house-candidates.csv --only-top 20 --limit-per-house 5 --fragrantica-limit 2
```

If you want a more aggressive pass, raise `--limit-per-house` and `--fragrantica-limit` after the first resumed tranche is healthy.
