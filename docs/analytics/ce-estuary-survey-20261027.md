# Estuary housing reservation survey — 2026-10-27

The fixed inputs cover six additional river/sea settlements from two FMG archives, selected for different populations and distances to the bank and shore. They are not a random or representative sample. The Nidyia archive contains only Nobra among its 435 burgs that meets the full current reservation predicate; these additional archives were selected to find another eligible case and near-miss controls.

Each input was generated twice with one worker, without rendering. Baseline and current use the same working tree, including the estuary wall continuity change; the baseline replaces only `heightArea.ts` with the version at `84408be53`, before the housing-area reservation. Generation times include normal process variation and two runs are insufficient for precise performance claims. The fixed inputs, per-city comparison, and hashes of the ignored full observations are adjacent to this report.

| Settlement | Population | Baseline mean | Reservation mean | Change | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Dunsbole | 10,318 | 2,655 ms | 3,867 ms | +45.7% | Eligible; larger generated settlement |
| Skipton | 8,119 | 1,649 ms | 1,551 ms | −6.0% | Same document fingerprint |
| Wihulbo | 14,054 | 2,562 ms | 2,545 ms | −0.7% | Same document fingerprint |
| Yebleca | 1,588 | 622 ms | 634 ms | +1.8% | Same document fingerprint |
| Rira | 776 | 1,663 ms | 1,620 ms | −2.6% | Same document fingerprint |
| Alburg | 9,709 | 2,562 ms | 2,620 ms | +2.2% | Same document fingerprint |

All runs succeeded in one attempt and reported zero crossing issues. Dunsbole's baseline already fit its 2,293 dwelling target without a housing area correction: it produced 2,351 houses and 3,481 buildings. Reservation increased those counts to 2,924 and 4,205 respectively, with no retry saved. The existing predicate therefore over-reserves in at least one qualifying city; it should not be generalized further without a better estimate of actual land loss and approach-space demand. Fingerprint equality on controls shows unchanged generated documents, while their small timing differences should be treated as measurement noise.

For Nobra, the waterfront curtain is now checked as a connected graph in both stage 5 and the completed city. Disconnected short waterfront remnants are removed and a reachable landward endpoint is joined to an actual ocean shoreline using dry mesh edges; no route is invented where a suitable path is unavailable. Existing road and bridge validation remains enabled. Next, investigate a terrain-aware reservation that retains Nobra's reduction in discarded housing stages without expanding already sufficient settlements such as Dunsbole.
