# Historical polity-name catalogue

`historical-polity-names.csv` is a curated, period-aware reference catalogue for the real-world name bases in `src/generators/names-generator.ts`. It is documentation data: it does **not** change the current Markov name generator or assert that a particular name was used by every population in the listed territory.

## Scope

- Included: the 32 real-world name bases (IDs 0–31) and the Levantine base (ID 42).
- Excluded: `Human Generic` (a synthetic fallback) and the fantasy bases `Elven` through `Serpents` (IDs 33–41). They have no historical-polity counterpart.
- A row is a historically attested sovereign polity, constituent realm, or widely used state-level political name that is useful as a state-name reference. Cities, tribes without a state-level polity, and every short-lived claimant are deliberately out of scope.
- “Country” in the request is represented by `name_base` because many bases describe a language or historical region rather than a modern country (for example Celtic, Mesopotamian, Nahuatl, and Karnataka).

## Columns and dates

- `start_year` and `end_year` use astronomical-style integer years (`-550` means 551 BCE; `9999` means continuing). Dates are approximate where the polity itself has no universally agreed foundation or end date.
- `era` is a generator-facing period label, not a claim that the source polity was culturally uniform.
- `relative_frequency` is an editorial sampling weight from 1 to 100 **within a name base and era**. It is not an observed historical frequency. Higher values favour names with a long-lived, territorially central, or especially recognizable state tradition; short-lived and regional names receive lower values. A caller should select only rows whose period overlaps its setting, then normalize these weights.
- `attested_name` preserves a historically used name or a conventional English rendering. `generator_stem` is a compact form suitable for a generated-state display name; it is intentionally optional rather than a replacement for the historical name.

## Sources and maintenance

`sources.csv` records the stable reference collections consulted. The catalogue is a concise, reproducible reference set rather than an assertion of exhaustive coverage of every dynasty, city-state, or constitutional style. Before promoting data to runtime generation, verify each selected row against a scholarly or institutional source and decide whether a source’s chronology and transliteration conventions fit the map’s setting.

The data follows the broad “historical country” concept used by Wikidata: a state, country, or territory with continuing historical informational value. This avoids treating a modern nation-state as the only valid unit for earlier periods.
