# Brand Registry Notes

This file summarizes the first-pass official brand site registry in `data/brand-registry.csv`.

## Pilot targets

These are the best first scraper candidates because they have strong dataset coverage and plain HTTP fetch currently works.

1. `Zara` — `524` perfumes in the 24k cleaned set, `926` in the 70k catalog
2. `O Boticario` — `381` perfumes in the 24k cleaned set, `551` in the 70k catalog
3. `Guerlain` — `347` perfumes in the 24k cleaned set, `520` in the 70k catalog
4. `Yves Saint Laurent` — `197` perfumes in the 24k cleaned set, `253` in the 70k catalog
5. `Dior` — `196` perfumes in the 24k cleaned set, `275` in the 70k catalog
6. `Givenchy` — `196` perfumes in the 24k cleaned set, `272` in the 70k catalog
7. `Xerjoff` — `132` perfumes in the 24k cleaned set, `176` in the 70k catalog

## Suggested order

Start with three sites that maximize learning while minimizing anti-bot friction:

1. `Guerlain`
2. `Zara`
3. `Xerjoff`

This mix gives one luxury commerce stack, one large mass-market catalog, and one smaller niche catalog.

## Deferred targets

These brands have high catalog coverage but are currently blocked or challenged on plain fetch:

- `Avon`
- `Lattafa Perfumes`
- `Giorgio Armani`
- `Lancôme`
- `Rasasi`
- `L'Occitane en Provence`
- `Bath & Body Works`

They should wait until the plain-fetch pipeline and site adapters are working.
