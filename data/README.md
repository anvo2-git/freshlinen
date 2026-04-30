This directory holds generated and curated datasets that support enrichment work.

- `brand-registry.csv` is the first-pass brand-to-homepage registry for official site enrichment.
- Rebuild it with:

```bash
python3 scripts/build-brand-registry.py \
  --catalog70k /home/anvo23/projects/perfume-rec/data/catalog_70k.csv \
  --cleaned24k /home/anvo23/projects/perfume-rec/data/perfumes/fra_cleaned.csv \
  --output data/brand-registry.csv
```
