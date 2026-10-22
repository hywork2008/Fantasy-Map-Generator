# BV structural review — 2026-10-21

## Scope and method

Reviewed the BV registrations in `src/building-viewer/main.ts`: all 10 Romanesque and 10 Gothic landmark definitions, the detailed Notre-Dame variant, all 76 medieval task models, St George's Chapel, Chambord, the registered ships, mills, vehicles, siege engines, well, water basins, lumber yard, containers, hanging signs, 10 catalogue massing records and both Krak hill-study phases.

The inventory below contains **150 rendering cases**, including display variants and a blank sign reference; it does not represent 150 distinct buildings. Containers cover all four kinds in all three states. Signs cover all six presets plus the blank reference, collectively covering every available shape, material and symbol. Water basins cover all three kinds. Every case was rendered and inspected from two opposite oblique directions using the actual model factories. Changed assemblies received additional frontal inspection, ray checks and/or bounds checks.

Roman antiquity (Pont du Gard), the Romantic Bojnice reconstruction, the test fixture and the unregistered caravel are outside this request. The deprecated City Generator was not inspected.

This is an exterior geometry review, not historical-source verification or a structural engineering assessment. Solid massing, opaque window/door inlays, intersecting nave/transept volumes and omitted interiors are intentional where the model descriptions specify an exterior study. Catalogue massing intentionally omits the floor-plan openings; those records are not detailed walkable interiors.

## Confirmed defects corrected

| Area | Defect | Correction |
| --- | --- | --- |
| Shared medieval hall | A full-height front post bisected the door; open fronts also placed the middle post through counters or loom parts. Wide doors could overlap the default windows, and low upper floors placed windows above the wall. | Clear front access, skip windows across doors, fit windows below the eaves. Added offset entrances and whole-hall rotation for the affected assemblies. |
| Parish church / village chapel | Central buttress blocked the entrance. Lancet panels were directly behind buttresses. | Removed the entrance buttress and separated the window and buttress bays. |
| Chapel / friary bells | Bells were buried below the main roof surface. | Raised the bellcotes above the roof and added yokes/supports; connected the chapel cross to its roof. Added civic bell supports as well. |
| Civic and guild halls | Exterior stairs ended beside a closed end wall, with a disconnected landing and a central upper door obscured by emblems. | Aligned stairs, landing and an offset doorway. Connected the town/cloth balconies to the landing and aligned their floor heights. Moved banners away from windows. |
| Merchant / artisan shop houses | Broad work windows and shutters overlapped the central entrance and automatic ground-floor windows. | Moved the entrance to the right, retained separate upper windows and moved stock out of the entrance. |
| Abbey, friary, Orthodox monastery and Balkan caravanserai | Side ranges reused front-facing narrow halls; caravanserai side doors faced another range's solid rear wall. | Turned the side ranges toward the court and aligned their roof ridges with the long axis; turned the corresponding galleries consistently. |
| Sainte-Chapelle | Seven apse buttresses stood directly in front of the seven tall glazing bays. | Put the intermediate buttresses between bays; retained the existing end buttresses. |
| Brewery / warehouse / bakeries | Barrels, a crate or a work table obstructed the entrance approach. | Moved cargo and work tables outside the doorway corridor. The earlier brewery/shelter roof clearance was retained and rechecked. |
| Chicken coop | The access ramp ended against a fully boarded front. | Added a real low animal opening at the ramp head. |
| Produce stall | Equal-height posts pierced the low edge of the tilted awning and stopped short of its high edge. | Matched post heights to the awning slope and added supporting rails. |
| Inns / weaver / tailor / farrier / joiner | Floating benches, garment rail, textile stock, horseshoes and frame saw lacked modeled supports. | Added legs, plinth, racks, hangers and rails. |

## Validation

- `npx vitest run src/buildings`: 54 files / 283 tests passed initially; the new Sainte-Chapelle clearance test needed its glass selection and sampling point corrected (the central mullion is intentional).
- After the shared window adjustment: `npx vitest run src/buildings/medieval src/buildings/landmarks/sainteChapelle.clearance.test.ts`: medieval tests passed (160 tests); the corrected Sainte-Chapelle test subsequently passed in its own run (1 test).
- After adding workshop supports and balcony access: `MEDIEVAL_MODEL_TASK=11,20,21,26,27 npx vitest run src/buildings/medieval/modelContracts.test.ts src/buildings/medieval/structuralClearance.test.ts`: 26 passed.
- After final bakery/bell-support adjustments: `MEDIEVAL_MODEL_TASK=10,14,26 npx vitest run src/buildings/medieval/modelContracts.test.ts src/buildings/medieval/structuralClearance.test.ts`: 20 passed.
- In total, all **284 distinct building tests** reached a passing result; successful unaffected tests were not repeatedly rerun.
- Biome checked the changed TypeScript files. `git diff --check` checked whitespace.

The new regression checks cover medieval door-face visibility, civic stair/door/balcony continuity, exposed bells, the coop entrance, awning support, entrance cargo/work-table clearance and unobstructed Sainte-Chapelle glazing. Existing tests cover declared bounds, grounding, finite meshes and projections, resource disposal, and model-specific geometry.

## Rendering inventory

| Case | Group | Model / display variant |
| --- | --- | --- |
| 1 | Romanesque / Gothic | Amiens Cathedral |
| 2 | Romanesque / Gothic | Bruges City Hall |
| 3 | Romanesque / Gothic | Burgos Cathedral |
| 4 | Romanesque / Gothic | Chartres Cathedral |
| 5 | Romanesque / Gothic | Cologne Cathedral |
| 6 | Romanesque / Gothic | Sainte-Foy Abbey Church, Conques |
| 7 | Romanesque / Gothic | Durham Cathedral |
| 8 | Romanesque / Gothic | Maria Laach Abbey Church |
| 9 | Romanesque / Gothic | Duomo di Milano |
| 10 | Romanesque / Gothic | Modena Cathedral |
| 11 | Romanesque / Gothic | Notre-Dame de Paris |
| 12 | Romanesque / Gothic | Notre-Dame de Paris · high detail |
| 13 | Romanesque / Gothic | Pisa Cathedral |
| 14 | Romanesque / Gothic | Reims Cathedral |
| 15 | Romanesque / Gothic | Basilica of Saint-Sernin, Toulouse |
| 16 | Romanesque / Gothic | Sainte-Chapelle, Paris |
| 17 | Romanesque / Gothic | Salisbury Cathedral |
| 18 | Romanesque / Gothic | Basilica of Sant'Ambrogio, Milan |
| 19 | Romanesque / Gothic | Santiago de Compostela Cathedral, Romanesque study |
| 20 | Romanesque / Gothic | Speyer Cathedral |
| 21 | Romanesque / Gothic | Vezelay Basilica |
| 22 | Medieval tasks | Timber rail fence |
| 23 | Medieval tasks | Woven wattle fence |
| 24 | Medieval tasks | Braced timber wicket gate |
| 25 | Medieval tasks | Timber farm barn |
| 26 | Medieval tasks | Threshing barn and work floor |
| 27 | Medieval tasks | Open hay shelter |
| 28 | Medieval tasks | Stable with divided stalls |
| 29 | Medieval tasks | Stone cattle byre |
| 30 | Medieval tasks | Pigsty with exercise pen |
| 31 | Medieval tasks | Raised chicken coop |
| 32 | Medieval tasks | Timber fodder manger |
| 33 | Medieval tasks | Stone livestock water trough |
| 34 | Medieval tasks | Produce stall with cloth awning |
| 35 | Medieval tasks | Covered cloth and goods booth |
| 36 | Medieval tasks | Half-timbered farmhouse |
| 37 | Medieval tasks | Stone cottage and lean-to |
| 38 | Medieval tasks | Small plastered town house |
| 39 | Medieval tasks | Merchant shop and dwelling |
| 40 | Medieval tasks | Street workshop and lodging |
| 41 | Medieval tasks | Two-wheel farm cart |
| 42 | Medieval tasks | Single-wheel wooden barrow |
| 43 | Medieval tasks | Two-person carrying barrow |
| 44 | Medieval tasks | Detached bread bakehouse |
| 45 | Medieval tasks | Bakery and bread shop |
| 46 | Medieval tasks | Communal bread oven shelter |
| 47 | Medieval tasks | Open forge and smithy |
| 48 | Medieval tasks | Farrier workshop and shoeing stock |
| 49 | Medieval tasks | Roadside inn with stable court |
| 50 | Medieval tasks | Courtyard hostelry |
| 51 | Medieval tasks | Covered split-firewood stack |
| 52 | Medieval tasks | Bound brushwood faggots |
| 53 | Medieval tasks | Covered charcoal store |
| 54 | Medieval tasks | Small parish church and bell tower |
| 55 | Medieval tasks | Village chapel with bellcote |
| 56 | Medieval tasks | Town brewery and copper yard |
| 57 | Medieval tasks | Small ale brewhouse |
| 58 | Medieval tasks | Raised timber granary |
| 59 | Medieval tasks | Stone grain storage house |
| 60 | Medieval tasks | Merchant warehouse and loading hoist |
| 61 | Medieval tasks | Small riverside goods store |
| 62 | Medieval tasks | Divided livestock market pens |
| 63 | Medieval tasks | Plain stone grave marker |
| 64 | Medieval tasks | Wooden grave cross |
| 65 | Medieval tasks | Churchyard ledger slabs and markers |
| 66 | Medieval tasks | Weaver workshop and treadle loom |
| 67 | Medieval tasks | Tailor workshop and cutting table |
| 68 | Medieval tasks | Cobbler workshop and shoe lasts |
| 69 | Medieval tasks | Cooper workshop and assembly stand |
| 70 | Medieval tasks | Joiner workshop and woodworking bench |
| 71 | Medieval tasks | Tannery vats and drying frames |
| 72 | Medieval tasks | Small clinker fishing boat |
| 73 | Medieval tasks | Open river rowing boat |
| 74 | Medieval tasks | Public municipal granary |
| 75 | Medieval tasks | Town hall with assembly loggia |
| 76 | Medieval tasks | Open market hall and meeting loft |
| 77 | Medieval tasks | Cloth merchants' guild hall |
| 78 | Medieval tasks | Leatherworkers' guild hall |
| 79 | Medieval tasks | Carpenters' guild hall |
| 80 | Medieval tasks | Masons' guild hall |
| 81 | Medieval tasks | Smiths' guild hall |
| 82 | Medieval tasks | Stone yard and mason work shelter |
| 83 | Medieval tasks | Masonry lime kiln and charging bank |
| 84 | Medieval tasks | Linen bleaching ground and drying racks |
| 85 | Medieval tasks | Abbey cloister and domestic ranges |
| 86 | Medieval tasks | Urban mendicant friary |
| 87 | Medieval tasks | Potter workshop, kiln, and drying shelves |
| 88 | Medieval tasks | Timber harbor treadwheel crane |
| 89 | Medieval tasks | Hand-winch loading crane |
| 90 | Medieval tasks | Permanent timber gallows |
| 91 | Medieval tasks | Glassworkers' guild hall |
| 92 | Medieval tasks | Early printing workshop |
| 93 | Medieval tasks | Printers' guild hall |
| 94 | Medieval tasks | Instrument makers' guild hall |
| 95 | Medieval tasks | Sand storage and loading yard |
| 96 | Medieval tasks | Eastern European Orthodox monastery |
| 97 | Medieval tasks | Ottoman Balkan caravanserai |
| 98 | Dedicated models / blank sign | stGeorgesChapel |
| 99 | Dedicated models / blank sign | chambord |
| 100 | Dedicated models / blank sign | carrack |
| 101 | Dedicated models / blank sign | galleon |
| 102 | Dedicated models / blank sign | sloop |
| 103 | Dedicated models / blank sign | barge |
| 104 | Dedicated models / blank sign | postMill |
| 105 | Dedicated models / blank sign | towerMill |
| 106 | Dedicated models / blank sign | waterMill |
| 107 | Dedicated models / blank sign | medievalWagon |
| 108 | Dedicated models / blank sign | coveredWagon |
| 109 | Dedicated models / blank sign | nobleCarriage |
| 110 | Dedicated models / blank sign | warWagon |
| 111 | Dedicated models / blank sign | minecart |
| 112 | Dedicated models / blank sign | trebuchet |
| 113 | Dedicated models / blank sign | batteringRam |
| 114 | Dedicated models / blank sign | earlyFieldCannon |
| 115 | Dedicated models / blank sign | medievalWell |
| 116 | Dedicated models / blank sign | publicWaterBasin |
| 117 | Dedicated models / blank sign | medievalLumberYard |
| 118 | Dedicated models / blank sign | hangingSign |
| 119 | Catalogue massing | Basilica temple |
| 120 | Catalogue massing | Beaumaris Castle |
| 121 | Catalogue massing | Castel del Monte |
| 122 | Catalogue massing | Krak des Chevaliers — schematic inner ward |
| 123 | Catalogue massing | Langeais keep |
| 124 | Catalogue massing | Loches donjon |
| 125 | Catalogue massing | Nunney Castle |
| 126 | Catalogue massing | Orford keep |
| 127 | Catalogue massing | Vincennes donjon and chemise |
| 128 | Catalogue massing | White Tower |
| 129 | Container state | barrel empty |
| 130 | Container state | barrel closed |
| 131 | Container state | barrel loaded |
| 132 | Container state | crate empty |
| 133 | Container state | crate closed |
| 134 | Container state | crate loaded |
| 135 | Container state | sack empty |
| 136 | Container state | sack closed |
| 137 | Container state | sack loaded |
| 138 | Container state | basket empty |
| 139 | Container state | basket closed |
| 140 | Container state | basket loaded |
| 141 | Sign preset | sign inn |
| 142 | Sign preset | sign blacksmith |
| 143 | Sign preset | sign tavern |
| 144 | Sign preset | sign bakery |
| 145 | Sign preset | sign apothecary |
| 146 | Sign preset | sign stable |
| 147 | Water basin variant | spring |
| 148 | Water basin variant | washhouse |
| 149 | Krak phase | Krak hospitalier-1270 |
| 150 | Krak phase | Krak mamluk-1302 |
