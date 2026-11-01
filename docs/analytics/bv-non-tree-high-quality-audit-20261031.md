# BV non-tree Codex high-quality model audit (2026-10-31)

Regenerate: `node --import tsx scripts/auditBvModelQuality.mts`

## Shared-component production rules

Read [BV composite models and per-part quality](../plan/bv-composite-models.md) before starting each candidate. Reuse its explicit factories, connection contracts, part ledger and BV isolation workflow. Do not independently rebuild elements that should be shared.

- Cloth and craft guild halls use one shared architecture profile: upper floor 3.32 m, upper wall 3.25 m, roof rise 2.2 m, east-side exterior stair, door Z=-2.3 m, and masonry arcade supports. Trade decoration must not change these dimensions or connections.
- Before Medieval 35 crane High work, follow [CE crane siting, cargo berths and lighter transfer](../plan/ce-harbor-cranes-and-cargo-berths.md). Resolve vessel cargo access, quay support, crane reach/height and the unloading route together; do not extend a jib to compensate for a failed berth.
- Check existing components before adding stairs, floor supports, roofs or balconies. Regenerate from profile parameters; do not resize a completed assembly.
- For future attachments, retain continuous host walls/roofs and use controlled overlap. Do not cut a bespoke socket for one chapel or workshop footprint: smaller replacements must not leave gaps. Functional doors/windows are separate. This is forward guidance, not a request to revise Notre-Dame.
- Different stair sides, floor heights or support systems require a named, documented preset. The town bell turret and timber-post market hall are civic presets, not arbitrary craft-guild differences.
- Verify unintended collisions, physical support/contact, doorway clearance, functional roof penetrations, ownership and standalone part display. Preserve intended attachment overlap on continuous hosts. Count shared placement variants as audit records, not newly independent High assets. Legacy Low/default factories retain their compatibility identities.

## Rules

- Do not commit completed-model screenshots or link their PNG files in these records. Inspect models and parts in BV; temporary images may be used for local verification only.

- Authorship does not establish quality. Single/default/unspecified models are treated as Low.
- High evidence: highDetail/ultraDetail, registered high/ultra factories, or explicit high preview metadata backed by a high/low factory.
- Triangle counts, names and hardcoded BV labels do not establish quality. Opus-only High remains a missing Codex edition. Codex Ultra qualifies as an existing detailed edition.
- Records correspond to BV entries and author editions, including size/state previews and duplicate presentations of shared factories. These totals are not counts of unique assets. Catalogue massing and separate exterior studies are listed separately.
- Excludes trees (Medieval 43) and the crag/escarpment terrain diagnostics. Interactive sign combinations, wall cultures and castle phases are not counted as additional assets.

## Summary

Records: **220**. Codex High or Ultra available: **107**. Missing candidates: **113**.

| Category | Records | Codex High available | Missing candidates |
| --- | ---: | ---: | ---: |
| Catalogue | 11 | 0 | 11 |
| Direct BV study | 66 | 2 | 64 |
| Gothic landmark | 10 | 10 | 0 |
| Imaginary landmark | 4 | 1 | 3 |
| Medieval 02 | 3 | 3 | 0 |
| Medieval 03 | 3 | 3 | 0 |
| Medieval 04 | 4 | 4 | 0 |
| Medieval 05 | 2 | 2 | 0 |
| Medieval 06 | 2 | 2 | 0 |
| Medieval 07 | 3 | 3 | 0 |
| Medieval 08 | 2 | 2 | 0 |
| Medieval 09 | 3 | 3 | 0 |
| Medieval 10 | 3 | 3 | 0 |
| Medieval 11 | 2 | 2 | 0 |
| Medieval 12 | 2 | 2 | 0 |
| Medieval 13 | 3 | 3 | 0 |
| Medieval 14 | 2 | 2 | 0 |
| Medieval 15 | 2 | 2 | 0 |
| Medieval 16 | 2 | 2 | 0 |
| Medieval 17 | 2 | 2 | 0 |
| Medieval 18 | 1 | 1 | 0 |
| Medieval 19 | 3 | 3 | 0 |
| Medieval 20 | 3 | 3 | 0 |
| Medieval 21 | 2 | 2 | 0 |
| Medieval 22 | 1 | 1 | 0 |
| Medieval 23 | 2 | 2 | 0 |
| Medieval 25 | 1 | 1 | 0 |
| Medieval 26 | 2 | 2 | 0 |
| Medieval 27 | 1 | 1 | 0 |
| Medieval 28 | 4 | 4 | 0 |
| Medieval 29 | 1 | 1 | 0 |
| Medieval 30 | 1 | 1 | 0 |
| Medieval 31 | 1 | 1 | 0 |
| Medieval 32 | 2 | 2 | 0 |
| Medieval 33 | 1 | 1 | 0 |
| Medieval 34 | 1 | 1 | 0 |
| Medieval 35 | 2 | 2 | 0 |
| Medieval 36 | 1 | 1 | 0 |
| Medieval 37 | 1 | 1 | 0 |
| Medieval 38 | 2 | 2 | 0 |
| Medieval 39 | 1 | 1 | 0 |
| Medieval 40 | 1 | 1 | 0 |
| Medieval 41 | 1 | 1 | 0 |
| Medieval 42 | 1 | 1 | 0 |
| Medieval 44 | 21 | 4 | 17 |
| Medieval 45 | 3 | 0 | 3 |
| Medieval 46 | 7 | 7 | 0 |
| Medieval 47 | 6 | 6 | 0 |
| Regional house | 5 | 0 | 5 |
| Romanesque landmark | 10 | 0 | 10 |

## Completed batches and next work

1. Fixed the unspecified-quality fallback and the hardcoded town-wall High labels to Low. Preserved explicit high/low factories for facilities, bridges and the Opus galleon.
2. Added new Codex High factories for farm-barn, threshing-barn and hay-shelter. BV offers Low/High; the old create factory remains unchanged as Low. No existing CE adoption was switched.
3. Second batch (2026-11-01): added High for the three Medieval 02 boundaries and four Medieval 04 animal houses. See [verification and previews](bv-boundary-animal-high-20261101.md).
4. Third batch (2026-11-01): added High for the two Medieval 05 troughs and two Medieval 06 market stalls. See [verification and previews](bv-trough-market-high-20261101.md).
5. Fourth batch (2026-11-01): added High for the three Medieval 07 dwellings and two Medieval 08 shop houses. The existing default dwelling variants remain registered for CE. See [verification and previews](bv-dwelling-shop-high-20261101.md).
6. Fifth batch (2026-11-01): added High for the three Medieval 09 hand carts and three Medieval 10 bakeries. See [verification and previews](bv-cart-bakery-high-20261101.md).
7. Sixth batch (2026-11-01): added High for the two Medieval 11 smithies and two Medieval 12 inns. Existing default smithy variants remain registered for CE. See [verification and previews](bv-smithy-inn-high-20261101.md).
8. Seventh batch (2026-11-01): added High for the three Medieval 13 fuel stores and two Medieval 14 churches, preserving their default CE variants. See [verification and previews](bv-fuel-church-high-20261101.md).
9. Eighth batch (2026-11-01): added High for the two Medieval 15 breweries and two Medieval 16 granaries, preserving the default granary variants used by CE. See [verification and previews](bv-brewery-granary-high-20261101.md).
10. Ninth batch (2026-11-01): added High for the two Medieval 17 warehouses and the Medieval 18 livestock market, preserving their default CE variants. See [verification and previews](bv-warehouse-market-high-20261101.md).
11. Composite-model phase (2026-11-01): audited the friary's Ultra vegetation and detailed well, introduced independent components and quality budgets, and decomposed shop houses, bakeries, inns and breweries. Added a new High urban friary with actual masonry apertures, buttresses, roof intersections, a pointed cloister arcade and detailed bellcote. CE keeps its default Low architecture. See [verification and previews](bv-friary-high-p4-20261101.md).
12. Tenth model batch (2026-11-01): added High for the three Medieval 19 grave markers and three Medieval 20 textile/leather workshops, preserving default CE grave-marker variants. See [verification and previews](bv-grave-textile-high-20261101.md).
13. Eleventh model batch (2026-11-01): added High for the two Medieval 21 woodworking workshops and the Medieval 22 tannery, preserving the default CE tannery variant. See [verification and previews](bv-woodworking-tannery-high-20261101.md).
14. Twelfth model batch (2026-11-01): added High for the two Medieval 23 small boats and the Medieval 25 public granary, preserving the default CE public-granary variant. See [verification and previews](bv-boat-public-granary-high-20261101.md).
15. Thirteenth model batch (2026-11-01): added High for the two Medieval 26 civic halls and the Medieval 27 cloth merchants hall, preserving the default CE cloth-hall variant. See [verification and previews](bv-civic-cloth-hall-high-20261101.md).
16. Fourteenth model batch (2026-11-01): added High for the four Medieval 28 craft guild halls and the Medieval 29 stone yard. Guild halls share the cloth hall architecture profile, masonry supports and east stair; trade dressing is a separate part. Preserved default CE variants. See [verification and previews](bv-guild-stone-yard-high-20261101.md).
17. Fifteenth model batch (2026-11-01): added High for the Medieval 30 lime kiln and Medieval 31 bleaching field, each with three independently inspectable components. Preserved default CE variants. See [verification, sources and previews](bv-kiln-bleaching-high-20261101.md).
18. Sixteenth model batch (2026-11-01): added High for the remaining Medieval 32 domestic ranges and the Medieval 34 pottery workshop. Reused monastery buildings/cloister, workshop shelter/benches and shared masonry kiln passages. Added independent component views and preserved original Low factories. See [verification, sources and previews](bv-domestic-pottery-high-20261101.md).
19. Harbor prerequisite (2026-11-01): investigated historical crane sites and cargo transfer, and audited independent ship/crane placement plus the 2D/3D arm-length mismatch. Implemented the initial cargo-quay/lighter contract for flat sea ports, fixed-radius reach/depth/rigging/approach checks and shared 2D/3D crane dimensions; validated three waiting ships and a broadside lighter in CE. Added Medieval 35 High for treadwheel and hand-winch cranes with four components, shared BV/CE construction dimensions, quality-sensitive CE adoption and prototype disposal. See [verification and previews](bv-harbor-cranes-high-20261101.md) and [CE harbor crane planning](../plan/ce-harbor-cranes-and-cargo-berths.md); river/relief sites and furled sailing rigs remain follow-up work. Next is Medieval 36 town gallows. Continue component inspection of named landmarks; regional houses, standalone props and the Codex basilica remain later batches.
20. Regenerate this report after each batch. Verify geometry, dimensions, projections, ownership and BV selection. Relabelling or subdividing an existing basic model does not complete High.

## First-batch verification (2026-11-01 JST)

- Related Vitest tests: modelComparison (5), adoption (3), barnDetails (5), all passed. The new doorway ray test initially detected a central post obstruction; the post was removed and the five barn tests passed on rerun.
- TypeScript: `npx tsc --noEmit` passed. Biome checks passed for changed source files; `git diff --check` passed.
- Live BV: all three models switched between Low and High with Codex authorship and separate complexity columns. Basic timber fence and town wall displayed Low; explicit citadel/bridge previews retained High.
- Browser console: no model/application errors; an unrelated favicon.ico 404 was observed.

| Model | Low triangles | High triangles | High meshes |
| --- | ---: | ---: | ---: |
| Timber farm barn | 2,310 | 11,780 | 5 |
| Threshing barn | 1,134 | 13,688 | 7 |
| Open hay shelter | 1,228 | 8,592 | 5 |

## Missing Codex High candidates

| Category | ID | Model | Quality evidence |
| --- | --- | --- | --- |
| Medieval 44 | `stupa-chorten` | Stupa chorten | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `cremation-pyre-platform` | Cremation pyre platform | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `tower-of-silence` | Tower of silence | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `ancestral-hall` | Ancestral hall | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `stepped-tumuli-mounds` | Stepped tumuli mounds | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `columbarium-walls` | Columbarium walls | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `cairns-and-steles` | Cairns and steles | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `flat-ground-markers` | Flat ground markers | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `terrace-horseshoe` | Terrace horseshoe | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `linear-avenue-monuments` | Linear avenue monuments | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `bone-cleaning-table` | Bone cleaning table | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `incense-candle-stand` | Incense candle stand | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `high-stone-wall` | High stone wall | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `low-curb-or-hedge` | Low curb or hedge | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `ditch-and-rampart` | Ditch and rampart | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `monumental-gate-pylon` | Monumental gate pylon | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `mourning-cloister` | Mourning cloister | single/default; assumed Low - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 45 | `jettied-town-house` | Jettied timber town house | single/default; assumed Low - [source](../../src/buildings/medieval/45-jettied-housesModels.ts) |
| Medieval 45 | `double-jettied-merchant-house` | Double-jettied merchant house | single/default; assumed Low - [source](../../src/buildings/medieval/45-jettied-housesModels.ts) |
| Medieval 45 | `corner-jettied-shop-house` | Corner-jettied shop and dwelling | single/default; assumed Low - [source](../../src/buildings/medieval/45-jettied-housesModels.ts) |
| Romanesque landmark | `conques` | Sainte-Foy Abbey Church, Conques | base only; documented low-resolution - [source](../../src/buildings/landmarks/conques.ts) |
| Romanesque landmark | `durham` | Durham Cathedral | base only; documented low-resolution - [source](../../src/buildings/landmarks/durham.ts) |
| Imaginary landmark | `floating-island` | Floating island (FMG mountain terrain) | base only; documented low-resolution - [source](../../src/buildings/landmarks/floatingIsland.ts) |
| Romanesque landmark | `mariaLaach` | Maria Laach Abbey Church | base only; documented low-resolution - [source](../../src/buildings/landmarks/mariaLaach.ts) |
| Romanesque landmark | `modena` | Modena Cathedral | base only; documented low-resolution - [source](../../src/buildings/landmarks/modena.ts) |
| Romanesque landmark | `pisa` | Pisa Cathedral | base only; documented low-resolution - [source](../../src/buildings/landmarks/pisa.ts) |
| Romanesque landmark | `saintSernin` | Basilica of Saint-Sernin, Toulouse | base only; documented low-resolution - [source](../../src/buildings/landmarks/saintSernin.ts) |
| Romanesque landmark | `santAmbrogio` | Basilica of Sant'Ambrogio, Milan | base only; documented low-resolution - [source](../../src/buildings/landmarks/santAmbrogio.ts) |
| Romanesque landmark | `santiago` | Santiago de Compostela Cathedral, Romanesque study | base only; documented low-resolution - [source](../../src/buildings/landmarks/santiago.ts) |
| Romanesque landmark | `speyer` | Speyer Cathedral | base only; documented low-resolution - [source](../../src/buildings/landmarks/speyer.ts) |
| Imaginary landmark | `tower-of-babel` | Tower of Babel (Valckenborch, 1594) | base only; documented low-resolution - [source](../../src/buildings/landmarks/towerOfBabel.ts) |
| Imaginary landmark | `tower-of-babel-hourglass` | Tower of Babel (hourglass road terraces) | base only; documented low-resolution - [source](../../src/buildings/landmarks/towerOfBabelHourglass.ts) |
| Romanesque landmark | `vezelay` | Vezelay Basilica | base only; documented low-resolution - [source](../../src/buildings/landmarks/vezelay.ts) |
| Catalogue | `basilica-temple` | Basilica temple | catalogueMassing; Low - [source](../../src/buildings/catalogue/basilica-temple.json) |
| Catalogue | `beaumaris` | Beaumaris Castle | catalogueMassing; Low - [source](../../src/buildings/catalogue/beaumaris.json) |
| Catalogue | `castel-del-monte` | Castel del Monte | catalogueMassing; Low - [source](../../src/buildings/catalogue/castel-del-monte.json) |
| Catalogue | `fixture-courtyard-keep` | Schematic courtyard keep | catalogueMassing; Low - [source](../../src/buildings/catalogue/fixture-courtyard-keep.json) |
| Catalogue | `krak-inner-ward` | Krak des Chevaliers — schematic inner ward | catalogueMassing; Low - [source](../../src/buildings/catalogue/krak-inner-ward.json) |
| Catalogue | `langeais-keep` | Langeais keep | catalogueMassing; Low - [source](../../src/buildings/catalogue/langeais-keep.json) |
| Catalogue | `loches-donjon` | Loches donjon | catalogueMassing; Low - [source](../../src/buildings/catalogue/loches-donjon.json) |
| Catalogue | `nunney` | Nunney Castle | catalogueMassing; Low - [source](../../src/buildings/catalogue/nunney.json) |
| Catalogue | `orford-keep` | Orford keep | catalogueMassing; Low - [source](../../src/buildings/catalogue/orford-keep.json) |
| Catalogue | `vincennes-donjon` | Vincennes donjon and chemise | catalogueMassing; Low - [source](../../src/buildings/catalogue/vincennes-donjon.json) |
| Catalogue | `white-tower` | White Tower | catalogueMassing; Low - [source](../../src/buildings/catalogue/white-tower.json) |
| Direct BV study | `pont-du-gard` | Pont du Gard | single/default; assumed Low - [source](../../src/buildings/aqueducts/pontDuGard.ts) |
| Direct BV study | `st-georges-chapel` | St George's Chapel · Windsor Castle | single/default; assumed Low - [source](../../src/buildings/chapels/stGeorgesChapel.ts) |
| Direct BV study | `town-curtain-wall` | Stone curtain wall | single/default; assumed Low - [source](../../src/buildings/fortifications/codexTownWalls.ts) |
| Direct BV study | `town-mural-tower` | Round mural tower | single/default; assumed Low - [source](../../src/buildings/fortifications/codexTownWalls.ts) |
| Direct BV study | `town-gate` | Twin-tower town gate | single/default; assumed Low - [source](../../src/buildings/fortifications/codexTownWalls.ts) |
| Direct BV study | `medieval-town-gatehouse` | Gatehouse with guard quarters | single/default; assumed Low - [source](../../src/buildings/fortifications/gatehouse.ts) |
| Direct BV study | `town-curtain-wall` | Stone curtain wall | single/default; assumed Low - [source](../../src/buildings/fortifications/townWalls.ts) |
| Direct BV study | `town-mural-tower` | Round mural tower | single/default; assumed Low - [source](../../src/buildings/fortifications/townWalls.ts) |
| Direct BV study | `town-gate` | Twin-tower town gate | single/default; assumed Low - [source](../../src/buildings/fortifications/townWalls.ts) |
| Direct BV study | `rectangular` | Barbican · Rectangular forecourt | single/default; assumed Low - [source](../../src/buildings/fortresses/barbicans.ts) |
| Direct BV study | `horseshoe` | Barbican · Horseshoe side entry | single/default; assumed Low - [source](../../src/buildings/fortresses/barbicans.ts) |
| Direct BV study | `polygonal` | Barbican · Polygonal bent approach | single/default; assumed Low - [source](../../src/buildings/fortresses/barbicans.ts) |
| Direct BV study | `circular-neck` | Barbican · Circular court and neck | single/default; assumed Low - [source](../../src/buildings/fortresses/barbicans.ts) |
| Direct BV study | `bojnice` | Bojnice Castle | single/default; assumed Low - [source](../../src/buildings/fortresses/bojnice.ts) |
| Direct BV study | `chambord` | Château de Chambord | single/default; assumed Low - [source](../../src/buildings/fortresses/chambord.ts) |
| Direct BV study | `krak-des-chevaliers` | Krak des Chevaliers | single/default; assumed Low - [source](../../src/buildings/fortresses/krak.ts) |
| Regional house | `regional-mediterranean` | mediterranean | explicit high/low factory; Opus only; Claude Opus 5.5 - [source](../../src/buildings/houses/regionalHouses.ts) |
| Regional house | `regional-atlantic` | atlantic | explicit high/low factory; Opus only; Claude Opus 5.5 - [source](../../src/buildings/houses/regionalHouses.ts) |
| Regional house | `regional-northern-wooded` | northern-wooded | explicit high/low factory; Opus only; Claude Opus 5.5 - [source](../../src/buildings/houses/regionalHouses.ts) |
| Regional house | `regional-northern-urban` | northern-urban | explicit high/low factory; Opus only; Claude Opus 5.5 - [source](../../src/buildings/houses/regionalHouses.ts) |
| Regional house | `regional-stone-upland` | stone-upland | explicit high/low factory; Opus only; Claude Opus 5.5 - [source](../../src/buildings/houses/regionalHouses.ts) |
| Direct BV study | `post-mill` | Medieval post mill | single/default; assumed Low - [source](../../src/buildings/mills/postMill.ts) |
| Direct BV study | `tower-mill` | Stone tower windmill | single/default; assumed Low - [source](../../src/buildings/mills/towerMill.ts) |
| Direct BV study | `waterMillLowBankShallowForward` | Low-bank watermill · 0.25 m · Flow +X | single/default; assumed Low - [source](../../src/buildings/mills/waterMill.ts) |
| Direct BV study | `waterMillLowBankShallowReverse` | Low-bank watermill · 0.25 m · Flow -X | single/default; assumed Low - [source](../../src/buildings/mills/waterMill.ts) |
| Direct BV study | `waterMillLowBankDeepForward` | Low-bank watermill · 0.85 m · Flow +X | single/default; assumed Low - [source](../../src/buildings/mills/waterMill.ts) |
| Direct BV study | `waterMillLowBankDeepReverse` | Low-bank watermill · 0.85 m · Flow -X | single/default; assumed Low - [source](../../src/buildings/mills/waterMill.ts) |
| Direct BV study | `water-mill` | Medieval European watermill | single/default; assumed Low - [source](../../src/buildings/mills/waterMill.ts) |
| Direct BV study | `medieval-containers-barrel-empty` | Staved wooden barrel · empty | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-barrel-closed` | Staved wooden barrel · closed | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-barrel-loaded` | Staved wooden barrel · loaded | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-crate-empty` | Planked wooden crate · empty | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-crate-closed` | Planked wooden crate · closed | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-crate-loaded` | Planked wooden crate · loaded | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-sack-empty` | Hemp cloth sack · empty | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-sack-closed` | Hemp cloth sack · closed | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-sack-loaded` | Hemp cloth sack · loaded | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-basket-empty` | Woven wicker basket · empty | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-basket-closed` | Woven wicker basket · closed | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `medieval-containers-basket-loaded` | Woven wicker basket · loaded | single/default; assumed Low - [source](../../src/buildings/props/medievalContainers.ts) |
| Direct BV study | `barge` | River barge | single/default; assumed Low - [source](../../src/buildings/ships/barge.ts) |
| Direct BV study | `carrack` | Carrack | single/default; assumed Low - [source](../../src/buildings/ships/carrack.ts) |
| Direct BV study | `galleon` | Galleon | single/default; assumed Low - [source](../../src/buildings/ships/galleon.ts) |
| Direct BV study | `opus-galleon` | Galleon | explicit high/low factory; Claude Opus 5.5 - [source](../../src/buildings/ships/opusGalleon.ts) |
| Direct BV study | `sloop` | Sloop | single/default; assumed Low - [source](../../src/buildings/ships/sloop.ts) |
| Direct BV study | `battering-ram` | Medieval European battering ram | single/default; assumed Low - [source](../../src/buildings/siege/batteringRam.ts) |
| Direct BV study | `early-field-cannon` | Early European field cannon | single/default; assumed Low - [source](../../src/buildings/siege/earlyFieldCannon.ts) |
| Direct BV study | `siege-tower` | Medieval European siege tower | single/default; assumed Low - [source](../../src/buildings/siege/siegeTower.ts) |
| Direct BV study | `trebuchet` | Trebuchet | single/default; assumed Low - [source](../../src/buildings/siege/trebuchet.ts) |
| Direct BV study | `inn` | inn | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `blacksmith` | blacksmith | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `tavern` | tavern | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `bakery` | bakery | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `apothecary` | apothecary | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `stable` | stable | single/default; assumed Low - [source](../../src/buildings/signs/hangingSign.ts) |
| Direct BV study | `basilica-temple` | Basilica temple | explicit high/low factory; Claude Opus 5.5 - [source](../../src/buildings/temples/basilicaTemple.ts) |
| Direct BV study | `covered-wagon` | Covered wagon | single/default; assumed Low - [source](../../src/buildings/vehicles/coveredWagon.ts) |
| Direct BV study | `airship` | Airship | single/default; assumed Low - [source](../../src/buildings/vehicles/industrialVehicles.ts) |
| Direct BV study | `hot-air-balloon` | Hot air balloon | single/default; assumed Low - [source](../../src/buildings/vehicles/industrialVehicles.ts) |
| Direct BV study | `steam-locomotive` | Steam locomotive | single/default; assumed Low - [source](../../src/buildings/vehicles/industrialVehicles.ts) |
| Direct BV study | `medieval-wagon` | Medieval European freight wagon | single/default; assumed Low - [source](../../src/buildings/vehicles/medievalWagon.ts) |
| Direct BV study | `minecart` | Timber mining cart | single/default; assumed Low - [source](../../src/buildings/vehicles/minecart.ts) |
| Direct BV study | `noble-carriage` | Medieval European noble carriage | single/default; assumed Low - [source](../../src/buildings/vehicles/nobleCarriage.ts) |
| Direct BV study | `war-wagon` | Medieval European war wagon | single/default; assumed Low - [source](../../src/buildings/vehicles/warWagon.ts) |
| Direct BV study | `medieval-well` | Medieval European well | single/default; assumed Low - [source](../../src/buildings/wells/medievalWell.ts) |
| Direct BV study | `public-water-basins-publicBasin` | Public stone water basin | single/default; assumed Low - [source](../../src/buildings/wells/publicWaterBasin.ts) |
| Direct BV study | `public-water-basins-spring` | Spring collection basin | single/default; assumed Low - [source](../../src/buildings/wells/publicWaterBasin.ts) |
| Direct BV study | `public-water-basins-washhouse` | Communal washing place | single/default; assumed Low - [source](../../src/buildings/wells/publicWaterBasin.ts) |
| Direct BV study | `medieval-lumber-yard` | Medieval European lumber yard | single/default; assumed Low - [source](../../src/buildings/yards/medievalLumberYard.ts) |

## Codex High available

| Category | ID | Model | Quality evidence |
| --- | --- | --- | --- |
| Medieval 02 | `timber-fence` | Timber rail fence | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/02-boundariesModels.ts) |
| Medieval 02 | `wattle-fence` | Woven wattle fence | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/02-boundariesModels.ts) |
| Medieval 02 | `simple-timber-gate` | Braced timber wicket gate | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/02-boundariesModels.ts) |
| Medieval 03 | `farm-barn` | Timber farm barn | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/03-barnsModels.ts) |
| Medieval 03 | `threshing-barn` | Threshing barn and work floor | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/03-barnsModels.ts) |
| Medieval 03 | `hay-shelter` | Open hay shelter | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/03-barnsModels.ts) |
| Medieval 04 | `village-stable` | Stable with divided stalls | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/04-animal-housingModels.ts) |
| Medieval 04 | `cattle-byre` | Stone cattle byre | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/04-animal-housingModels.ts) |
| Medieval 04 | `pigsty` | Pigsty with exercise pen | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/04-animal-housingModels.ts) |
| Medieval 04 | `chicken-coop` | Raised chicken coop | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/04-animal-housingModels.ts) |
| Medieval 05 | `fodder-trough` | Timber fodder manger | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/05-troughsModels.ts) |
| Medieval 05 | `stone-water-trough` | Stone livestock water trough | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/05-troughsModels.ts) |
| Medieval 06 | `market-produce-stall` | Produce stall with cloth awning | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/06-market-stallsModels.ts) |
| Medieval 06 | `market-goods-booth` | Covered cloth and goods booth | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/06-market-stallsModels.ts) |
| Medieval 07 | `half-timber-farmhouse` | Half-timbered farmhouse | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/07-dwellingsModels.ts) |
| Medieval 07 | `stone-cottage` | Stone cottage and lean-to | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/07-dwellingsModels.ts) |
| Medieval 07 | `plastered-small-house` | Small plastered town house | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/07-dwellingsModels.ts) |
| Medieval 08 | `merchant-shop-house` | Merchant shop and dwelling | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/08-shop-housesModels.ts) |
| Medieval 08 | `artisan-shop-house` | Street workshop and lodging | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/08-shop-housesModels.ts) |
| Medieval 09 | `two-wheel-farm-cart` | Two-wheel farm cart | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/09-hand-cartsModels.ts) |
| Medieval 09 | `wooden-wheelbarrow` | Single-wheel wooden barrow | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/09-hand-cartsModels.ts) |
| Medieval 09 | `two-person-handbarrow` | Two-person carrying barrow | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/09-hand-cartsModels.ts) |
| Medieval 10 | `bread-bakehouse` | Detached bread bakehouse | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/10-bakeriesModels.ts) |
| Medieval 10 | `town-bakery` | Bakery and bread shop | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/10-bakeriesModels.ts) |
| Medieval 10 | `communal-bread-oven` | Communal bread oven shelter | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/10-bakeriesModels.ts) |
| Medieval 11 | `open-smithy` | Open forge and smithy | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/11-smithiesModels.ts) |
| Medieval 11 | `farriers-workshop` | Farrier workshop and shoeing stock | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/11-smithiesModels.ts) |
| Medieval 12 | `roadside-inn` | Roadside inn with stable court | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/12-innsModels.ts) |
| Medieval 12 | `courtyard-hostelry` | Courtyard hostelry | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/12-innsModels.ts) |
| Medieval 13 | `covered-firewood-stack` | Covered split-firewood stack | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/13-fuel-storageModels.ts) |
| Medieval 13 | `brushwood-faggots` | Bound brushwood faggots | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/13-fuel-storageModels.ts) |
| Medieval 13 | `charcoal-bin` | Covered charcoal store | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/13-fuel-storageModels.ts) |
| Medieval 14 | `parish-church` | Small parish church and bell tower | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/14-parish-churchesModels.ts) |
| Medieval 14 | `village-chapel` | Village chapel with bellcote | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/14-parish-churchesModels.ts) |
| Medieval 15 | `town-brewery` | Town brewery and copper yard | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/15-breweriesModels.ts) |
| Medieval 15 | `ale-brewhouse` | Small ale brewhouse | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/15-breweriesModels.ts) |
| Medieval 16 | `raised-timber-granary` | Raised timber granary | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/16-granariesModels.ts) |
| Medieval 16 | `stone-grain-store` | Stone grain storage house | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/16-granariesModels.ts) |
| Medieval 17 | `merchant-warehouse` | Merchant warehouse and loading hoist | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/17-warehousesModels.ts) |
| Medieval 17 | `riverside-goods-store` | Small riverside goods store | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/17-warehousesModels.ts) |
| Medieval 18 | `livestock-market-pens` | Divided livestock market pens | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/18-livestock-marketsModels.ts) |
| Medieval 19 | `plain-stone-grave-marker` | Plain stone grave marker | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/19-grave-markersModels.ts) |
| Medieval 19 | `wooden-grave-cross` | Wooden grave cross | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/19-grave-markersModels.ts) |
| Medieval 19 | `churchyard-slabs` | Churchyard ledger slabs and markers | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/19-grave-markersModels.ts) |
| Medieval 20 | `weavers-workshop` | Weaver workshop and treadle loom | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/20-textile-leather-workshopsModels.ts) |
| Medieval 20 | `tailors-workshop` | Tailor workshop and cutting table | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/20-textile-leather-workshopsModels.ts) |
| Medieval 20 | `cobblers-workshop` | Cobbler workshop and shoe lasts | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/20-textile-leather-workshopsModels.ts) |
| Medieval 21 | `coopers-workshop` | Cooper workshop and assembly stand | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/21-woodworking-workshopsModels.ts) |
| Medieval 21 | `joiners-workshop` | Joiner workshop and woodworking bench | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/21-woodworking-workshopsModels.ts) |
| Medieval 22 | `tanners-yard` | Tannery vats and drying frames | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/22-tanneriesModels.ts) |
| Medieval 23 | `small-fishing-boat` | Small clinker fishing boat | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/23-small-boatsModels.ts) |
| Medieval 23 | `open-rowing-boat` | Open river rowing boat | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/23-small-boatsModels.ts) |
| Medieval 25 | `public-granary` | Public municipal granary | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/25-public-granariesModels.ts) |
| Medieval 26 | `medieval-town-hall` | Town hall with assembly loggia | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/26-civic-hallsModels.ts) |
| Medieval 26 | `covered-market-hall` | Open market hall and meeting loft | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/26-civic-hallsModels.ts) |
| Medieval 27 | `cloth-guild-hall` | Cloth merchants' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/27-cloth-hallsModels.ts) |
| Medieval 28 | `leather-guild-hall` | Leatherworkers' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/28-craft-guild-hallsModels.ts) |
| Medieval 28 | `woodworking-guild-hall` | Carpenters' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/28-craft-guild-hallsModels.ts) |
| Medieval 28 | `masonry-guild-hall` | Masons' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/28-craft-guild-hallsModels.ts) |
| Medieval 28 | `metallurgy-guild-hall` | Smiths' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/28-craft-guild-hallsModels.ts) |
| Medieval 29 | `masons-stone-yard` | Stone yard and mason work shelter | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/29-stone-yardsModels.ts) |
| Medieval 30 | `masonry-lime-kiln` | Masonry lime kiln and charging bank | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/30-lime-kilnsModels.ts) |
| Medieval 31 | `linen-bleaching-field` | Linen bleaching ground and drying racks | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/31-bleaching-fieldsModels.ts) |
| Medieval 32 | `abbey` | Abbey church, cloister and domestic ranges | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/32-abbey-living-quartersModels.ts) |
| Medieval 32 | `abbey-domestic-range` | Abbey cloister and domestic ranges | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/32-abbey-living-quartersModels.ts) |
| Medieval 33 | `mendicant-friary` | Urban mendicant friary | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/33-friariesModels.ts) |
| Medieval 34 | `potters-workshop` | Potter workshop, kiln, and drying shelves | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/34-pottery-workshopsModels.ts) |
| Medieval 35 | `harbor-treadwheel-crane` | Timber harbor treadwheel crane | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/35-harbor-cranesModels.ts) |
| Medieval 35 | `harbor-winch-crane` | Hand-winch loading crane | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/35-harbor-cranesModels.ts) |
| Medieval 36 | `permanent-town-gallows` | Permanent timber gallows | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/36-gallowsModels.ts) |
| Medieval 37 | `glassworkers-guild-hall` | Glassworkers' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/37-glassworkers-hallsModels.ts) |
| Medieval 38 | `early-printing-workshop` | Early printing workshop | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/38-printing-modelsModels.ts) |
| Medieval 38 | `printers-guild-hall` | Printers' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/38-printing-modelsModels.ts) |
| Medieval 39 | `instrument-makers-guild-hall` | Instrument makers' guild hall | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/39-instrument-makers-hallsModels.ts) |
| Medieval 40 | `sand-storage-yard` | Sand storage and loading yard | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/40-sand-yardsModels.ts) |
| Medieval 41 | `orthodox-monastery` | Eastern European Orthodox monastery | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/41-orthodox-monasteriesModels.ts) |
| Medieval 42 | `balkan-caravanserai` | Ottoman Balkan caravanserai | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/42-caravanseraisModels.ts) |
| Medieval 44 | `ossuary-charnel-house` | Ossuary charnel house | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `preaching-cross-calvary` | Preaching cross calvary | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `mausoleum-dome` | Mausoleum dome | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 44 | `skull-shelf` | Skull shelf | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/44-cemetery-facilitiesModels.ts) |
| Medieval 46 | `citadel-ravelin` | Citadel ravelin with open gateways · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `citadel-barracks` | Citadel barracks · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `citadel-command` | Citadel command · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `citadel-service` | Citadel service · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `citadel-magazine` | Citadel magazine · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `earthen-courtyard-caravanserai` | Earthen courtyard caravanserai · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 46 | `wayside-courtyard-inn` | Wayside courtyard inn · high detail | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/46-citadel-and-lodgingModels.ts) |
| Medieval 47 | `modular-stone-arch-bridge` | Modular stone arch bridge · 96 m | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Medieval 47 | `modular-stone-arch-bridge-long` | Modular stone arch bridge · 600 m | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Medieval 47 | `modular-timber-trestle-bridge` | Modular timber trestle bridge · 72 m | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Medieval 47 | `modular-lifting-river-bridge` | Modular river bridge with lifting span · 96 m | quality: high; detailed factory; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Medieval 47 | `timber-rope-suspension-bridge` | Rope suspension bridge · Footbridge · 48 m | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Medieval 47 | `timber-rope-suspension-bridge-long` | Rope suspension bridge · Packhorse bridge · 96 m | variants: high/ultra; Codex GPT-6.1 Sol - [source](../../src/buildings/medieval/47-modular-river-bridgesModels.ts) |
| Gothic landmark | `amiens` | Amiens Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/amiens.ts) |
| Imaginary landmark | `babel-spire` | Babel spire (narrow tower and satellite towers) | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/babelSpire.ts) |
| Gothic landmark | `brugesCityHall` | Bruges City Hall | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/brugesCityHall.ts) |
| Gothic landmark | `burgos` | Burgos Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/burgos.ts) |
| Gothic landmark | `chartres` | Chartres Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/chartres.ts) |
| Gothic landmark | `cologne` | Cologne Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/cologne.ts) |
| Gothic landmark | `milan` | Duomo di Milano | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/milan.ts) |
| Gothic landmark | `notre-dame-paris` | Notre-Dame de Paris | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/notreDame.ts) |
| Gothic landmark | `reims` | Reims Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/reims.ts) |
| Gothic landmark | `sainteChapelle` | Sainte-Chapelle, Paris | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/sainteChapelle.ts) |
| Gothic landmark | `salisbury` | Salisbury Cathedral | highDetail/ultraDetail; Codex GPT-6.1 Sol - [source](../../src/buildings/landmarks/salisbury.ts) |
| Direct BV study | `polygon-houses` | Polygonal and narrow houses | explicit high/low factory; Codex GPT-6.1 Sol - [source](../../src/buildings/houses/polygonHouses.ts) |
| Direct BV study | `earthen-houses` | Earthen flat-roof houses | explicit high/low factory; Codex GPT-6.1 Sol - [source](../../src/buildings/houses/earthenHouses.ts) |
