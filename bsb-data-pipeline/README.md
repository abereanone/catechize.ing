# BSB Data Pipeline

This folder owns the local BSB corpus used by the site.

## Files

- `bsb.json`: canonical local BSB data used by all downstream build steps.
- `scripts/prepare-bsb.mjs`: one-time or on-demand normalizer that:
  - applies the existing Yahweh/LORD rewrites directly in the corpus,
  - stores each verse with explicit metadata: `{ chapter, verse, text }`.

## Commands

- `npm run seed:bsb`
  - normalizes `bsb-data-pipeline/bsb.json` in place.

- `npm run build:bible`
  - reads `src/generated/questions.json`,
  - extracts cited references,
  - writes `src/generated/bible-cited.json` for runtime `getVerse()` lookups.
