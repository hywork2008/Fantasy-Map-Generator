# Data provenance and licensing

`docs/data` stores reference data used to design or validate Fantasy Map Generator features. Every data set must document its source, retrieval date, and license in a nearby `sources.csv` before it can be treated as an importable corpus.

## CC0 / Public Domain data

The machine-readable personal-name corpora in [`historical-person-names/`](./historical-person-names/) are derived **only** from CC0 1.0 sources. CC0 is a public-domain dedication: the imported data may be copied, adapted, and redistributed without attribution or share-alike obligations. Their source snapshots, SHA-256 hashes, and reproduction scripts are recorded in that directory's `sources.csv` and `README.md`.

Do not bulk-copy a third-party name list merely because it can be viewed online or used to name an individual character. A data source is eligible for a checked-in corpus only when its terms explicitly permit reuse and redistribution under CC0 or a Public Domain dedication.

## Editorial reference catalogues

`historical-polity-names/` is an editorial, project-authored historical reference catalogue, not an imported CC0/Public Domain corpus. Its bibliography is preserved in its own `sources.csv`; it must not be represented as a third-party CC0 data export. Any future machine import into that directory must meet the CC0/Public Domain rule above and record that provenance explicitly.
