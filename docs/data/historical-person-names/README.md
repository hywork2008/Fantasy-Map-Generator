# CC0 person-name corpora

This directory contains only **CC0 1.0 / Public Domain dedication** data.

## Files

| File | Role |
| :--- | :--- |
| `cc0-country-given-names.csv` | Modern general-population country forenames (rank, gender, year) — **docs / future short-lived use** |
| `cc0-wikidata-given-names.csv` | Language-attached given-name spellings (no frequency) — spelling dictionary only |
| **`cc0-mythic-ancient-names.csv`** | **Mythology figures + ancient historical persons**, one cultural sphere per `name_base_id` — **used by long-lived character names** |
| `sources.csv` | Provenance / license |

### Modern corpora (country + Wikidata given names)

- `cc0-country-given-names.csv` has 1,382 mechanically imported country records from `popular-names-by-country-dataset`. It preserves country, year, rank, gender, localized spelling, romanization, population count (when supplied), and note fields.
- `cc0-wikidata-given-names.csv` has 1,125 language-attached Wikidata given-name entities. It supplies a broader spelling dictionary for languages whose country ranking is shallow or absent. Wikidata does not supply a usable gender or frequency value for these selected name entities, so every row is deliberately `unknown` for gender and has no derived rank.

### Mythic / ancient corpus (long-lived races)

- `cc0-mythic-ancient-names.csv` is built from **Wikidata Query Service** labels (CC0 1.0).
- Rows are **strictly partitioned** by FMG `name_base_id` (e.g. Greek=7, Nordic=6, Japanese=12). A picker must **never** mix bases for one culture/homeland.
- `category` is `mythology` (deities, legendary figures) or `ancient_person` (pre-modern historical people).
- Large spheres (Greek, Roman, Nordic, Japanese, Arabic, Celtic) come from class-based SPARQL; smaller spheres (German heroic, English Arthurian, Chinese, Mesopotamian, Iranian, Levantine) use **label-verified QIDs** plus filters that drop place/taxon/junk labels.
- Runtime catalog: `src/data/mythicAncientNames.ts` (emit via `node scripts/emitMythicAncientNamesTs.mjs`).
- Generation wiring: long-lived races (`lifespan ≥ 150`) use `tryRollMythicPersonName` with `culture.personNameBase` or fantasy→sphere map (`src/data/personNameSpheres.ts`). Short-lived races keep Markov `Names.getCulture()`.
- **Race → sphere UI**: Options → Generation → **Race person names** opens a dialog (`RacePersonNamesDialog`). Mapping is stored in `options.racePersonNameSpheres` / localStorage and applied in `cultures-generator` via `applyRacePersonNameSpheres` (`src/data/racePersonNameConfig.ts`). Each race has a primary sphere and an optional alternate (2nd culture of the same race).
- High Fantasy default: Quenian elves → Greek; Eldar → Celtic; Dunirr dwarves → Nordic — never a mixed bag inside one culture.
- **Variation law** (`src/data/personNameVariation.ts`): small spheres rarely use a bare catalog form. Names are uniquified against living characters via sphere-local prefixes/suffixes, vowel swaps, or stem recombination (e.g. Mesopotamian *Inanna* → *Ninanna*, *Inannesh*, …) so a dark-elf court does not stamp eight identical *Inanna*s.

## Scope and limits

- It covers the same 33 real-world name bases as the polity catalogue (IDs 0–31 and 42). `Human Generic` and fantasy bases are excluded.
- The source is country-based, while several FMG bases are historical regions or languages. `coverage_kind` makes the relationship explicit: `direct_country`, `regional_proxy`, `country_proxy`, or `modern_language_proxy`. A proxy row must not be represented as direct linguistic evidence.
- Hawaii and Swahili have no defensible row in either CC0 corpus, so no rows are invented for those bases. The country corpus lacks Nigeria and Vietnam, but the language-attached Wikidata corpus provides their independent CC0 coverage. A data gap is preferable to assigning names from an unrelated modern country.
- The source is modern (its per-country observation year is retained in `source_year`). It does **not** provide historical name frequencies. Do not invent medieval or ancient frequency values from it.

## Use

- **Modern country corpus:** filter by `name_base_id`, then country and gender when a ranked pool is needed. Documentation-first; not yet the default short-lived generator.
- **Mythic/ancient corpus:** filter by **exactly one** `name_base_id` (the culture’s person-name sphere). Do not blend spheres. This **does** drive long-lived character names via `src/data/personNames.ts`.

## Reproduction

### Mythic / ancient (live Wikidata)

```sh
node scripts/generateCc0MythicAncientNames.mjs
node scripts/emitMythicAncientNamesTs.mjs
```

### Modern country corpus

```sh
node scripts/generateCc0PersonNameCorpus.mjs <source.csv> docs/data/historical-person-names/cc0-country-given-names.csv
```

(The country generator script may live only in historical notes; the mythic pipeline above is the active CC0 path for long-lived names.)
