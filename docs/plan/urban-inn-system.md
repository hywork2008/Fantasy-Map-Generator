# Urban Inns / Lodging Facilities

| Field | Value |
| :--- | :--- |
| **Status** | In progress — PR-I1 and Edit Burg Overview portion of PR-I2 implemented 2026-08-02 |
| **Date** | 2026-08-02 |
| **Owner** | Economy extension (`src/extensions/economy/`) |
| **Depends on** | [urban-housing-system.md](./urban-housing-system.md), [guild-city-bases.md](./guild-city-bases.md) (Burg Editor extension-tab host support) |
| **Related** | [population-food-supply.md](../simulation/population-food-supply.md), [city-generator/algorithm.md](./city-generator/algorithm.md) |

## Overview

An inn is a **short-stay commercial facility**, not an alternate dwelling ledger. It gives a Burg an observable stock of buildings, rooms, beds, common-room places, and animal spaces. It can later receive travellers, seasonal workers, and job-seeking newcomers for a bounded stay, but it must never make an otherwise full city able to retain unlimited new residents.

The system has two purposes that must remain separate:

1. **World simulation:** represent lodgings, markets, travellers, and future temporary arrivals without inventing permanent houses.
2. **World flavour:** make a town legible as having one roadside inn, several market inns, a busy quayside hostelry, or a large caravanserai. The same data must also support deliberately non-historical fantasy and JRPG presentation.

The medieval German baseline is a guide for functional distinctions, not a claim that every generated number is a historical census. In late medieval German cities, a `guest` could be legally distinct from citizens and other residents, and might have to live with a host rather than own property. This supports a separate transient state, but does **not** imply that long-term migrants belong in inns forever. [Urban Differences, University of Mainz](https://urban-difference.uni-mainz.de/mittlere-und-neuere-geschichte/). Inns and taverns were closely connected with markets, merchant lodging, meals, goods storage, and exchange, which supports market and route signals in placement. [Kerntke, *Taverne und Markt*](https://orlis.difu.de/handle/difu/550148).

### Implementation map (current)

| Concern | File |
| :--- | :--- |
| Facility type, class, and totals | `src/extensions/economy/generators/innFacilityTypes.ts` |
| Deterministic seed and aggregate helpers | `src/extensions/economy/generators/innFacilities.ts` |
| Economy slice accessors | `src/extensions/economy/economyContext.ts` |
| Initialization, full regenerate, enable bootstrap, and clear | `src/extensions/economy/index.tsx` |
| Archive validation and Burg-reference policy | `src/runtime/extensionStateSlices.ts` |
| Edit Burg summary | `burgEconomySummary.ts` → `BurgEditorDialog.tsx` |

## Goals

1. Store how many inn **buildings** a Burg has, rather than only a synthetic lodging-capacity number.
2. Store rooms, beds, common-room seats, and stable spaces so a large shared-room inn and a small private-room inn are meaningfully different.
3. Generate a small, deterministic facility mix from Burg size and connectivity, then update it gradually through construction and decline.
4. Show a compact inn summary in **Edit Burg** and provide an Inns detail tab when Burg Editor extension tabs land.
5. Keep historical, high-fantasy, and JRPG-like inns as presentation profiles over the same mechanics.
6. Leave permanent dwellings, formal Guild Chapters, and caravanserai Burg groups as distinct concepts.

## Non-goals (v1)

- Individual named innkeepers, room assignments, nightly prices, or a city-detail polygon for every inn.
- A traveller pathfinding system, tourism simulation, or a generic “hotel” that bypasses food and housing constraints.
- Counting inn beds as permanent `dwellingStock`, or adding `inns` fields to host `Burg`.
- Replacing the existing `caravanserai` Burg group. A caravanserai Burg may own lodging facilities, but is not itself a single inn record.
- Replacing the Guild Chapters design. Guild halls and inns can be neighbours in a later city scene, but have independent ledgers and lifecycles.

## Core decisions

| ID | Decision | Why |
| :--- | :--- | :--- |
| IN-1 | Inns live in `simulation.extensions.economy.innFacilities`, keyed by `burgId`. | They are economic facilities and must not pollute host `Burg`. |
| IN-2 | The stored unit is an aggregate **facility class per Burg**, with `buildingCount`, rooms, beds, common seats, and stable spaces. | It exposes visible building counts without the cost of individual building agents. |
| IN-3 | Inn beds are transient capacity only. They never contribute to `dwellingStock`, `requiredDwellings`, or `effectiveCapacity`. | Prevents an inn-heavy city from absorbing permanent population without housing. |
| IN-4 | Long-stay migrants transition from `temporaryLodgers` to ordinary tenants / residents only when permanent housing capacity exists. | A migrant's legal or social status is not equivalent to sleeping in an inn indefinitely. |
| IN-5 | Use a functional `InnClass` plus a presentation `LodgingStyle`; do not duplicate simulation types for “historical”, “fantasy”, and “JRPG”. | Balance remains comparable while generated names and visual flavour can vary. |
| IN-6 | The Burg Editor has one compact Overview row now and a registered **Inns** tab for detail after the shared tab host is implemented. | The overview stays scannable; future Guilds can remain a separate tab. |
| IN-7 | v1 seeds facilities and displays them. Food/drink demand, inn employment, and occupancy arrive only with a traveller / temporary-lodger system. | Avoids double-counting the existing broad service-employment estimate. |

## Terms

| Term | Meaning | Counts as permanent population? |
| :--- | :--- | :--- |
| **Inn facility** | Physical commercial lodging stock: buildings, rooms, beds, seats, stables. | No |
| **Traveller** | Passing merchant, pilgrim, envoy, adventuring party, etc.; stays days or weeks. | No |
| **Temporary lodger** | Seasonal worker or job seeker using an inn while seeking a long-term arrangement; bounded stay. | No |
| **Tenant / boarder** | Long-term resident who rents a dwelling room or boards with a household. This is housing, not inn stock. | Yes |
| **Caravanserai Burg** | Existing Burg group / map identity; particularly favourable for a caravanserai-class facility. | N/A |

## Data model

```ts
// src/extensions/economy/generators/innFacilityTypes.ts

export type InnClass = "wayside" | "market" | "waterside" | "grand" | "caravanserai";

/** Changes names and flavour only; capacity and economic rules come from InnClass. */
export type LodgingStyle = "medievalCentralEuropean" | "highFantasy" | "jrpg";

/** One aggregate facility class in one Burg; not an individual named building. */
export interface InnFacility {
  burgId: number;
  innClass: InnClass;
  /** Number of buildings of this class, always an integer >= 1. */
  buildingCount: number;
  /** Lockable/private rooms across all buildings. */
  privateRooms: number;
  /** Beds in shared rooms and lofts; private-room beds are included separately below. */
  sharedBeds: number;
  /** Beds in private rooms, normally one to three per room. */
  privateBeds: number;
  /** Seats in taprooms, dining rooms, courtyards, and covered porches. */
  commonSeats: number;
  /** Animal places: hitching, stalls, or a caravan courtyard. */
  stableSpaces: number;
  /** Current persistent quality, 0..1. It is not a presentation style. */
  condition: number;
}

export interface InnStayLedger {
  burgId: number;
  /** Guests who remain after the current monthly settlement; transient only. */
  transientGuests: number;
  /** Job-seeking/seasonal people whose maximum stay is limited by policy. */
  temporaryLodgers: number;
  /** Simulation month in which the oldest temporary-lodger cohort must resolve. */
  oldestLodgerDeadlineMonth: number | null;
}
```

`InnStayLedger` is deferred until actual travel or migration queues exist. `InnFacility` is enough for the first generation/UI milestone.

### Derived values

```text
buildingCount = Σ facility.buildingCount
privateRooms  = Σ facility.privateRooms
beds          = Σ (facility.privateBeds + facility.sharedBeds)
commonSeats   = Σ facility.commonSeats
stableSpaces  = Σ facility.stableSpaces

availableTransientBeds = max(0, beds - transientGuests - temporaryLodgers)
```

No value above appears in `ConstructionOperation.dwellingStock`. A bed is not a dwelling and is not a promise of a household's future home.

## Facility classes and presentation

`InnClass` has a mechanical identity. `LodgingStyle` changes the display name, short description, and future city-scene dressing only.

| Class | Typical role | Building form | Historical label | High-fantasy label | JRPG label |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `wayside` | Road stop, small village trade | 1–2 timber or stone buildings | Wayside inn / alehouse | Hearth Inn | Village Inn |
| `market` | Market-day visitors and local merchants | Inn with yard, kitchen, and a few rooms | Market inn | Wayfarers’ Rest | Town Inn |
| `waterside` | Quay, river landing, or sea port traffic | Lodging plus storehouse/yard | Quay inn | Lantern Quay House | Harbor Inn |
| `grand` | Capital, fair, major market, embassy traffic | Several buildings or a deep street-front plot | Great inn / hostelry | Crown & Compass | Grand Inn |
| `caravanserai` | Long-distance overland caravans | Enclosed court, shared rooms, many animal places | Caravanserai | Caravan Court | Caravan Rest |

The important design choice is that **“Adventurers’ Inn” is a label, not a Guild Chapter**. It may have a quest-board visual later, but must not create or replace the formal guild hall planned in `guild-city-bases.md`.

### Starter capacity bundles

These are deliberately broad flavour/balance ranges, not historical measurements. Generation chooses a deterministic point within the appropriate range and scales it by `buildingCount`.

| Class | Buildings | Private rooms / building | Total beds / building | Common seats / building | Stable spaces / building |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Wayside | 1–2 | 0–2 | 4–10 | 8–24 | 2–8 |
| Market | 1–4 | 2–6 | 10–24 | 20–56 | 4–14 |
| Waterside | 1–5 | 3–8 | 16–36 | 28–72 | 2–12 |
| Grand | 1–3 | 8–20 | 36–90 | 60–180 | 8–30 |
| Caravanserai | 1–2 | 0–8 | 30–100 | 40–160 | 20–80 |

Shared beds are the default for smaller and road-oriented facilities. This matters because a town can have twenty beds while having only two private rooms; the UI should never report “20 rooms” from “20 beds”.

## Generation and lifecycle

### Eligibility and suitability

Only active, non-fort Burgs may receive normal inn facilities. The generator reads existing Burg / Economy facts but mutates only the Economy slice.

| Signal | Effect |
| :--- | :--- |
| Market-bearing Burg | Baseline eligibility; a small market settlement may have one wayside or market inn. |
| Population and market scale | Raises the expected number of buildings, not the capacity of one implausibly large inn. |
| `port` / navigable river / active searoute | Raises waterside-inn suitability. |
| Road and caravan traffic | Raises wayside/market suitability; a future traffic model replaces the current route proxy. |
| Capital, fair, high trade employment | Raises grand-inn suitability. |
| Existing `burg.group === "caravanserai"` | Guarantees one caravanserai-class facility if the Burg is active. |
| Fort | No normal inn facility in v1. A future military lodging system owns barracks, not inns. |

Generation uses deterministic, key-based randomness from the map seed plus `burgId` and class. It must not consume global generation RNG in a way that changes unrelated map output.

### Count first, capacity second

The generator must decide an expected **number of buildings** before drawing rooms/beds:

```text
facilityScore = market + connectivity + tradeScale + capitalOrFair + groupBonus

buildingCount(class) = bounded deterministic integer derived from facilityScore
capacity(class)      = buildingCount × class bundle, with deterministic per-building variation
```

This prevents a hamlet from obtaining a single 70-bed “inn” merely because a capacity formula scaled directly from population. It also means that a prosperous port is visibly a district of several modest inns before it becomes a grand hostelry.

### Initial target mix

| Burg situation | Expected mix at seed |
| :--- | :--- |
| Small market village | Often 0; if traffic/market signal is present, 1 wayside or market inn |
| Ordinary town | 1–3 market inns; waterside inn if relevant |
| Trade hub or port | Several market/waterside inns; rare grand inn |
| Capital or major fair city | Several market/waterside inns plus 1+ grand inn |
| Caravanserai group | 1 caravanserai facility, optionally supplemented by a market inn |

“Often 0” is intentional. A generic Burg is not guaranteed an inn just because the UI could display one. In `highFantasy` or `jrpg` presentation, the **probability and labels may be more generous**, but this is an explicit world-style option rather than a hidden historical override.

### Annual settlement (future phase)

After the initial display-only milestone, annual settlement may add, expand, close, or deteriorate facilities.

```text
desiredBuildings = f(population, connectivity, trade, style policy)
constructionOpportunity = available builders × material coverage

if buildings < desiredBuildings and constructionOpportunity > threshold:
  add or expand one facility class

if buildings > desiredBuildings after sustained population/trade decline:
  reduce condition first; remove a building only after a long decay period
```

Facility construction must consume the same Wood/Stone/Brick market goods as other construction in a later phase, but it must be a separate work order from permanent dwellings. It cannot silently spend or create `dwellingStock`.

## Population and lodging contract

### Admission order

```text
arriving person / cohort
  ├─ permanent residential capacity exists → resident/tenant pathway
  ├─ otherwise transient inn bed exists → temporary-lodger pathway (time limited)
  └─ otherwise → keep searching, return, frontier application, or existing failure path
```

Temporary lodging is a safety valve for short shocks, not the steady-state destination of city growth.

| Rule | Contract |
| :--- | :--- |
| Maximum stay | Default one simulation year; seasonal visitors may use a shorter policy. |
| Population | Temporary lodgers do not enter `burg.population`, demographic cohorts, or permanent workforce until settled. |
| Food | Once the stay ledger exists, guests consume a small, explicit market-food demand; no free sustenance. |
| Work | A future system may allow seasonal work, but must keep it separate from permanent employment demand and wages. |
| Resolution | At deadline: find permanent housing, move on, return to mobile cohort resolution, or use a dedicated relief/settlement rule. Never silently remain forever. |

Long-term migrants may become tenants or boarders without ever becoming full citizens. That should be a **residence-status** distinction, not an inn-occupancy distinction.

## Guild and city-facility relationship

Guild Chapters and inns share a Burg and can both be shown in its editor, but neither owns the other.

```text
GuildKnowledgeStock → formal GuildChapter        (organisation / technique)
InnFacility         → InnStayLedger (future)    (commercial lodging)
ConstructionOperation → dwellingStock            (permanent housing)
```

- A guild hall is never counted as a bed source unless a future explicit guild-hostel feature creates a separate `InnFacility`.
- An inn does not manufacture a formal Guild Chapter, even if its style is “Adventurers’ Inn”.
- The proposed `BurgEditor` extension-tab host from `guild-city-bases.md` is shared infrastructure. Economy may register **Inns** and later **Guilds** as independently enabled tabs.

## Edit Burg UI

The dialog's job is quick urban inspection, not management. New user-facing strings remain English until i18n exists.

### Overview row (first UI milestone)

Place this after `Construction jobs` and before demography rows:

```text
Inns: 3 buildings · 12 rooms · 44 beds · 18 stable spaces
```

Tooltip:

```text
Commercial short-stay lodging. Beds are not permanent homes and do not raise housing capacity.
```

Show `—` when Economy is disabled or the Burg has no inn facility, and `None` when Economy is enabled but generation produced zero facilities. That distinction lets the player tell “feature unavailable” from “this town has no inn”.

### Inns tab (after shared tab-host milestone)

The Inns tab is a compact ledger rather than a fantasy shop screen.

```text
┌ Inns ──────────────────────────────────────────┐
│ Lodging       Buildings  Rooms  Beds  Stables   │
│ Market Inn          2       7     30      10    │
│ Quay Inn            1       4     18       4    │
│                                                  │
│ Total               3      11     48      14    │
│ Common-room seats: 74                         │
│ Temporary beds free: —  (travel system absent) │
└──────────────────────────────────────────────────┘
```

The visual signature is the **lodging ledger**: building count comes first, while rooms/beds/stables read as capacities attached to physical places. It deliberately avoids cards, faux parchment, or decorative tavern imagery in a dense editor dialog.

`LodgingStyle` changes labels in this table—e.g. `Market Inn` → `Wayfarers’ Rest` or `Town Inn`—but not its columns. A future city-detail renderer may choose signs, lanterns, roof forms, courtyards, and quest-board dressing from the same style.

### UI integration

1. Extend `BurgEconomySummary` with an `inns` summary string.
2. Populate it in `burgEconomySummary.ts` from a pure `getInnSummary(burgId)` reader.
3. Add the Overview row in `BurgEditorDialog.tsx`; no direct Economy import in the host component.
4. Once the tab host in Guild plan PR-2 is available, register `BurgEditorInnsTab.tsx` from Economy `init()` using `registerEditorTab({ editorId: "burgEditor", ... })`.
5. Filter by enabled extension in the host exactly as specified by Guild plan KD-5/KD-8. Disable or cleanup must hide the tab without removing host data.

## Architecture and persistence

| Concern | Location |
| :--- | :--- |
| Types and pure capacity aggregation | `src/extensions/economy/generators/innFacilityTypes.ts`, `innFacilities.ts` |
| Slice getters/setters and migration | `src/extensions/economy/economyContext.ts`, economy-slice validation |
| Initial seeded facility generation | Economy `economy.initialization` map-ready task, after Markets/Production are available |
| Annual settlement / optional occupancy | Economy simulation system only |
| Burg Editor summary and Inns tab | Economy summary hook / registered extension tab |
| City-detail buildings and signs | Future renderer or city-generator consumer; read-only view of facility data |

The initial seed must use Economy's map-ready task, not `fmg:generate-post-core`, because the Economy initialization pipeline owns the relevant market and production state. On clear/disable, clear `innFacilities` and `innStayLedger`; on load, normalize missing fields to empty arrays. Preserve valid facilities across ordinary regeneration unless the target regeneration explicitly rebuilds Economy facilities.

## Test plan

| Area | Required checks |
| :--- | :--- |
| Type/data | Every facility has integer `buildingCount >= 1`; all capacities are finite and non-negative. |
| Pure generation | Same seed + Burg inputs produces identical mix; fort receives none; caravanserai group receives caravanserai facility. |
| Scaling | Higher traffic/trade adds buildings before creating a disproportionately large single facility. |
| Housing isolation | Changing inn beds never changes `dwellingStock`, `buildingStock`, or `effectiveCapacity`. |
| Lifecycle | Clear/disable empties both inn arrays; archive without inn data normalizes safely. |
| UI | Overview distinguishes `—` from `None`; totals equal facility sums; disabled Economy hides Inns tab. |
| Future stays | Lodger deadline resolves; no stay can remain past its deadline; temporary guests never silently enter permanent population. |

## Delivery plan

### PR-I1 — facility ledger and deterministic seed — implemented

- Add types, Economy slice accessors, validation/migration, pure generator, and tests.
- Seed from `economy.initialization`; clear on Economy cleanup.
- No occupancy, food demand, or employment effects.

### PR-I2 — Burg Editor observability — Overview row implemented; Inns tab deferred

- Add `Inns` summary to `BurgEconomySummary` and the Edit Burg Overview row.
- Add the Inns tab after shared `BurgEditor` extension tabs from Guild plan PR-2 are present.
- No editing controls in v1.

### PR-I3 — annual facility lifecycle

- Add slow construction/decline based on actual connectivity and economic demand.
- Integrate material costs as an explicit non-dwelling construction work order.

### PR-I4 — travellers and temporary lodgers

- Add `InnStayLedger`, market food demand, bounded temporary stays, and resolution into permanent housing or existing mobile-cohort outcomes.
- Add no permanent population or capacity shortcut.

### PR-I5 — city-detail / visual variants (optional)

- Consume `InnFacility` read-only in the city generator.
- Render signs, stables, courtyards, waterfront storage, and style-specific fantasy/JRPG dressing without changing simulation values.

## Open tuning questions

1. Should `LodgingStyle` be global world configuration, culture-derived, or selected per Burg? Default: global world style with culture-derived naming only.
2. Which current route/traffic proxies are reliable enough before a dedicated traveller system exists? Default: market, port, searoute, Burg group, and trade employment only.
3. Should a major fair be a persistent Burg field or an event? Default: event later; v1 uses capital/trade proxies.
4. Should an inn facility have a direct treasury/owner model? Default: no; integrate only after ordinary service-business accounting is modelled.
