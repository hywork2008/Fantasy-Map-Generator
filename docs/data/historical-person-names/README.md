# CC0 general-person-name corpora

This directory contains only **CC0 1.0 / Public Domain dedication** data. Both corpora contain names, not lists of famous people:

- `cc0-country-given-names.csv` has 1,382 mechanically imported country records from `popular-names-by-country-dataset`. It preserves country, year, rank, gender, localized spelling, romanization, population count (when supplied), and note fields.
- `cc0-wikidata-given-names.csv` has 1,125 language-attached Wikidata given-name entities. It supplies a broader spelling dictionary for languages whose country ranking is shallow or absent. Wikidata does not supply a usable gender or frequency value for these selected name entities, so every row is deliberately `unknown` for gender and has no derived rank.

## Scope and limits

- It covers the same 33 real-world name bases as the polity catalogue (IDs 0–31 and 42). `Human Generic` and fantasy bases are excluded.
- The source is country-based, while several FMG bases are historical regions or languages. `coverage_kind` makes the relationship explicit: `direct_country`, `regional_proxy`, `country_proxy`, or `modern_language_proxy`. A proxy row must not be represented as direct linguistic evidence.
- Hawaii and Swahili have no defensible row in either CC0 corpus, so no rows are invented for those bases. The country corpus lacks Nigeria and Vietnam, but the language-attached Wikidata corpus provides their independent CC0 coverage. A data gap is preferable to assigning names from an unrelated modern country.
- The source is modern (its per-country observation year is retained in `source_year`). It does **not** provide historical name frequencies. Do not invent medieval or ancient frequency values from it.

## Use

Use the country corpus when a gendered ranking is needed: filter by `name_base_id`, then choose a country and gender as appropriate. `source_rank` is an observed source ordering and is the only default weight. `source_population` is blank when the source did not publish a count. Use the Wikidata corpus only to widen spellings; do not derive gender or frequency from it. These files remain documentation-only and do not alter `Names.getCulture()` or character generation.

## Reproduction

Run the checked-in generator with a downloaded source snapshot:

```sh
node scripts/generateCc0PersonNameCorpus.mjs <source.csv> docs/data/historical-person-names/cc0-country-given-names.csv
```

The country generator deliberately includes only mappings recorded in its `baseCountryCoverage` table, so additions require an explicit coverage decision rather than silently assigning a country to a language. The Wikidata generator runs in four-language batches to tolerate public-query time limits; run it with offsets `0`, `4`, ..., `40`, then run `dedupeCc0WikidataGivenNames.mjs`.
