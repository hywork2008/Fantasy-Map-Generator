# Frontier start modes

Frontier worlds have two distinct opening stories. Both leave most of the map as wilderness, but they disagree about ships, landing sites, and whether sea lanes exist on day one.

This document is the living spec. Implementation lives in:

| Concern | Module |
| :--- | :--- |
| Option + defaults | `src/types/WorldState.ts`, `src/store/optionsState.ts`, `src/utils/frontierStartMode.ts` |
| Capital landmass / landing | `src/generators/frontierStartPlacement.ts` |
| True ocean port | `src/utils/oceanPort.ts` |
| Sea lanes | `src/generators/routes-generator.ts` |
| Starter hulls | `src/extensions/shipbuilding/generators/initialFleet.ts` |
| UI | Options → Generation (`GenerationSettingsTab`) |

Related: [`docs/plan/frontier-expansion.md`](../plan/frontier-expansion.md), [`docs/plan/shipbuilding-initial-fleet.md`](../plan/shipbuilding-initial-fleet.md), [`docs/plan/harbor-siting.md`](../plan/harbor-siting.md).

---

## 1. The two archetypes

Option: `worldContext.options.frontierStartMode` (`"landOrigin"` \| `"seaborne"`).

Shown only when Settlement pattern is **Frontier**. Other patterns ignore the field. Missing or invalid values migrate to `"landOrigin"`.

| Mode | Story | Ships at start | Sea lanes at start |
| :--- | :--- | :--- | :--- |
| **Land origin** (default) | Humanity arose on this continent. Nobody has crossed an ocean yet. | None | None |
| **Seaborne landing** | The starting states arrived from off-map and beached on a new land. | Yes, at true ocean ports | Yes, only between those ports |

A shipyard is a *place that can build hulls* (ocean haven + timber). It is not a ship. A port is *geography* (a harbor). Neither implies a fleet.

**Invariant:** no ocean-going hulls ⇒ no generated searoutes. Ports and shipyard candidates may still exist as geography.

---

## 2. Observed bad starts (why this exists)

Frontier games with three states produced mixed, unreadable openings:

1. Inland river burg, `burg.port` set via lake/river drain, no shipyard
2. True coast, port + shipyard
3. True coast, port, no shipyard (not enough forest)
4. Inland river, no port, no shipyard
5. Coastal *cell* but burg sitting on the cell centroid, no port
6. One-cell isle, port, no shipyard — boxed in unless the player immediately boats out

Vessel assets followed the ordinary (non-frontier) rule and seeded hulls to every true ocean port. Sea lanes followed a weaker rule (`burg.port` + any haven) and appeared even when the state had no hulls and no shipyard.

Case 6 is the worst play experience: a one-cell isle is finished on turn one, and the next action is an ocean crossing. Slightly larger isles have the same problem a few years later. Islands remain valid *later* as defensive colonies; they are not valid *starting homelands*.

---

## 3. Starting landmass

Both frontier modes place capitals only on land that can support years of overland expansion.

### 3.1 Hard rejects

- Land feature with `cells <= 1` (the one-cell isle).
- Water features (never a capital cell).

### 3.2 Soft minimum, then relax

```
minCells = max(80, startingRealmSize × 6)
```

`startingRealmSize` is the Starting realm slider (1–30). A capital-only start still wants ~80 remaining wilderness cells on the same landmass. A 30-cell core wants a landmass of at least 180 cells so the first expansion years stay on land.

If the map cannot supply that many large landmasses, the sitter relaxes in order:

`requested → 40 → 16 → 4 → 2`

It never relaxes to 1. If even that fails, leftover nodes on `cells > 1` land are used as a last resort.

Lake islands follow the same size rule. A one-cell lake islet is rejected for the same boxed-in reason.

Towns (non-capitals) are **not** filtered. Small islands may receive later burgs; they are colonization targets, not starting homelands.

### 3.3 Seaborne extra constraint

A seaborne capital must land on a cell that is, or can be snapped to, a **true ocean harbor** on the same landmass (prefer the same foundation region):

- land cell
- `cells.haven` points at water whose feature `type === "ocean"` (this includes seas and gulfs; those are `group`, not `type`)
- `cells.harbor > 0`

The burg is then placed on that harbor cell so `Burgs.shift` / `selectPorts` can make it a real sea port. Inland river mouths and lake-drain “ports” do not count.

If no harbor exists on that landmass, the node is skipped until the land-size floor is relaxed. Only the last-resort path may leave a seaborne capital inland (rare; tiny/odd maps).

Land origin does **not** force the coast. Inland river, coastal cell without a formal port, and true ports are all legal as long as the landmass is large.

---

## 4. Ports, shipyards, hulls, searoutes

Four different facts. Do not treat them as one.

| Fact | Meaning | Who decides |
| :--- | :--- | :--- |
| Harbor / `burg.port` | This burg can load cargo onto water | `burgs-generator` (`selectPorts`) |
| Shipyard candidate | Ocean haven + nearby forest (`forestRatio ≥ 0.3`) | `computeShipyardCandidates` |
| Hull / vessel asset | An actual ship | `seedInitialFleets` or later construction |
| Searoute | A charted sea lane on the map | `Routes.generateSeaRoutes` and friends |

### 4.1 True ocean port

A burg is a true ocean port only when:

- `burg.port` is set
- `cells.haven[burg.cell]` exists
- that haven cell’s feature `type === "ocean"`

`burg.port` alone is not enough. Lake and river burgs often store the *downstream ocean* feature id via drain resolution (`Rivers.resolveDrainFeature` / `resolveLakePortFeature`). Those burgs are river or lake ports. They must not receive ocean hulls and must not open sea lanes.

### 4.2 Generation matrix

| Pattern / mode | Shipyard candidates | Seed hulls | Generated searoutes (sea + river-visual) |
| :--- | :--- | :--- | :--- |
| Frontier + land origin | Yes (geography) | No | No |
| Frontier + seaborne | Yes (geography) | Yes, true ocean ports of starting states | Yes, true ocean ports only |
| Marches / scattered / standard / dense | Unchanged | Unchanged | Unchanged, but sea lanes still require a true ocean port (not a drain port) |

River “searoutes” (`group: "searoutes"`, `navigation: "river"`) are visual river-trade lines. On land origin they are suppressed with the sea lanes: the player asked for no ships and the layer is the same `#searoutes` group. Directed river travel (`RiverNavigationGraph`) is a separate system and is not deleted.

### 4.3 Later in the game

Land-origin states may still *discover* shipbuilding: walk to a forested coast, found a port, complete a hull. When that happens, sea lanes should be charted (`Routes.connectPort` / a regenerate). That unlock is **not** part of map generation. Until a hull exists, `connectPort` on a land-origin frontier map must not paint a sea lane.

Seaborne states begin already past that gate.

Islands as defensive colonies are a mid-game choice: expand across the home landmass, build or keep ships, then hop. The generator must not force that hop on year zero.

---

## 5. Why the third state had searoutes but no yard and no hulls

Two independent bugs, both now closed for new frontier maps:

1. **Fleet seed used a stricter ocean check than sea-lane generation.** `seedInitialFleets` required `haven.type === "ocean"`. `generateSeaRoutes` only required `haven` to exist. A lake-shore or drain port with a haven joined the ocean `burg.port` group and received a sea lane, but no hulls and no shipyard (shipyards also require an ocean haven + forest).
2. **Frontier was treated like a filled historical world.** Vessel seeding ignored settlement pattern, so any true ocean port got the ordinary starter fleet.

Land origin now skips both hull seed and sea-lane generation. Sea-lane generation also filters to true ocean ports in every pattern, so a drain port can no longer open an ocean lane.

---

## 6. UI copy

Options → Generation, visible only for Settlement pattern = Frontier:

- **Frontier start:** Land origin (no ships) | Seaborne landing
- Tip: Land origin is humanity arising here — large homelands, no ships, no sea lanes. Seaborne landing beaches each state on a large coast with ships and sea lanes between those ports. Tiny isles are never starting homelands.

Starting realm (1–30 cells) still controls how much of the oikoumene is painted as state land. It does not override the landmass floor.

---

## 7. Persistence

- Zustand / localStorage key: `frontierStartMode`
- Written onto `worldContext.options` in `prepareGenerationStage` and settlement regenerate
- Archives: missing field → `"landOrigin"`
- Loaded maps keep whatever routes and hulls they already have; the option only affects the next Generate

---

## 8. Non-goals

- Auto-colonizing off-home islands at generation
- Forcing every seaborne capital to also be a shipyard (timber is geography; the landing party brought its hulls)
- Changing marches / scattered / standard start stories
- Simulating the off-map origin country of a seaborne landing
- Building river-boat assets as a substitute for ocean hulls on land origin
