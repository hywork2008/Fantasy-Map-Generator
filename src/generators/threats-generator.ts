import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Monster } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { rand } from "../utils";
import { biomePredatorScaleForMode, rebuildDangerField } from "./dangerField";
import {
  buildThreatBandsFromOptions,
  getThreatSpawnProfile,
  resolveThreatCalculation,
  resolveThreatCultureMode
} from "./threatProfiles";

export const Threats = {
  generate(worldContext: WorldContext, _viewContext: ViewContext, _appServices: AppServices, _state: WorldState) {
    const { pack } = worldContext;
    const { cells } = pack;

    // Initialize danger array
    cells.danger = new Uint8Array(cells.i.length);
    pack.monsters = [];

    const options = useOptionsState.getState();
    const culturesSet = options.culturesSet;
    const profile = getThreatSpawnProfile(culturesSet);
    // Options-driven bands (Danger tab). Null when culture set is non-fantasy.
    const bands = buildThreatBandsFromOptions(options, culturesSet);
    // Danger master switch off: leave cells.danger at all-zero (no spawns, no
    // field). dangerExpandPolicy's expand cost/ban then never triggers.
    if (!options.dangerEnabled || !profile || !bands) return;

    const monsters: Monster[] = [];
    const validCells = Array.from(cells.i).filter(i => cells.h[i] >= 20); // land only

    if (validCells.length === 0) return;

    const spawnMonster = (rarity: number, power: number, type: string) => {
      const cell = validCells[rand(validCells.length - 1)];
      const name = `${type} ${monsters.length}`;
      monsters.push({
        i: monsters.length,
        cell,
        name,
        rarity,
        power,
        basePower: power,
        type
      });

      if (rarity >= 3) {
        let icon = "👻";
        if (rarity === 4) icon = "🐲";
        else if (rarity === 5) icon = "🩸";

        if (!pack.markers) pack.markers = [];
        const markerId = pack.markers.length ? pack.markers[pack.markers.length - 1].i + 1 : 0;

        pack.markers.push({
          i: markerId,
          cell,
          x: cells.p[cell][0],
          y: cells.p[cell][1],
          type: "monster",
          icon
        });

        worldContext.notes.push({
          id: `marker${markerId}`,
          name,
          legend: `A terrifying ${type} of rarity ${rarity}.`
        });
      }
    };

    for (const band of bands) {
      if (band.max <= 0 && band.min <= 0) continue;
      const hi = Math.max(band.min, band.max);
      const lo = Math.min(band.min, band.max);
      const count = rand(lo, hi);
      for (let i = 0; i < count; i++) spawnMonster(band.rarity, band.power, band.type);
    }

    pack.monsters = monsters;
    const threatCalculation = resolveThreatCalculation(options);
    // Monsters + Phase 5 forest/mountain predators (no markers for the latter).
    rebuildDangerField(cells, monsters, threatCalculation, {
      biomesData: worldContext.biomesData,
      biomePredatorScale: biomePredatorScaleForMode(resolveThreatCultureMode(culturesSet)),
      // Generation runs before states; flag kept explicit for annual rebuilds.
      reducePredatorsOnGovernedLand: true
    });
  },

  appendCasualtyNotes(_worldContext: WorldContext) {
    // Lost settlement capacity is not a death toll.
    // docs/plan/dnd/danger-calculation.md
  },

  /**
   * Appends monsters generated after the normal Threats.generate pass (Deep Worms — docs/plan/
   * underground-realm-and-supernatural-areas.md §4.3a/§3.1 — need cave systems to exist first,
   * which run after Threats.generate in the pipeline) and rebuilds the danger field with the
   * same options generate() used, so the new monsters' influence is reflected before Cultures/
   * Settlement Foundation read `cells.danger`.
   */
  appendMonstersAndRebuildDanger(worldContext: WorldContext, newMonsters: readonly Monster[]) {
    if (!newMonsters.length) return;
    const { pack } = worldContext;
    const { cells } = pack;
    pack.monsters = [...(pack.monsters ?? []), ...newMonsters];

    const options = useOptionsState.getState();
    const threatCalculation = resolveThreatCalculation(options);
    rebuildDangerField(cells, pack.monsters, threatCalculation, {
      biomesData: worldContext.biomesData,
      biomePredatorScale: biomePredatorScaleForMode(resolveThreatCultureMode(options.culturesSet)),
      reducePredatorsOnGovernedLand: true
    });
  }
};
