import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Monster } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { rand } from "../utils";
import { biomePredatorScaleForMode, rebuildDangerField } from "./dangerField";
import { getThreatSpawnProfile } from "./threatProfiles";

export const Threats = {
  generate(worldContext: WorldContext, _viewContext: ViewContext, _appServices: AppServices, _state: WorldState) {
    const { pack } = worldContext;
    const { cells } = pack;

    // Initialize danger array
    cells.danger = new Uint8Array(cells.i.length);
    pack.monsters = [];

    const culturesSet = useOptionsState.getState().culturesSet;
    const profile = getThreatSpawnProfile(culturesSet);
    if (!profile) return;

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

    for (const band of profile.bands) {
      if (band.max <= 0 && band.min <= 0) continue;
      const hi = Math.max(band.min, band.max);
      const lo = Math.min(band.min, band.max);
      const count = rand(lo, hi);
      for (let i = 0; i < count; i++) spawnMonster(band.rarity, band.power, band.type);
    }

    pack.monsters = monsters;
    // Monsters + Phase 5 forest/mountain predators (no markers for the latter).
    rebuildDangerField(cells, monsters, profile.threatCalculation, {
      biomesData: worldContext.biomesData,
      biomePredatorScale: biomePredatorScaleForMode(profile.mode),
      // Generation runs before states; flag kept explicit for annual rebuilds.
      reducePredatorsOnGovernedLand: true
    });
  },

  appendCasualtyNotes(worldContext: WorldContext) {
    const { pack } = worldContext;
    const { cells, monsters } = pack;
    if (!monsters || !pack.markers || !worldContext.notes) return;

    const populationRate = useOptionsState.getState().populationRate;
    const initialPopulationSaturation = useOptionsState.getState().initialPopulationSaturation / 100;
    const culturesSet = useOptionsState.getState().culturesSet;
    const profile = getThreatSpawnProfile(culturesSet);
    const threatCalculation = profile?.threatCalculation ?? useOptionsState.getState().threatCalculation;

    // Calculate meanArea once for capacity formula
    let totalArea = 0;
    for (let i = 0; i < cells.i.length; i++) totalArea += cells.area[i];
    const meanArea = totalArea / cells.i.length || 1;

    for (const m of monsters) {
      if (m.rarity < 3) continue; // Only rarity >= 3 have notes

      // Find the marker ID for this monster
      // The marker is created in Threats.generate at the exact cell
      const marker = pack.markers.find(mark => mark.cell === m.cell && mark.type === "monster");
      if (!marker) continue;

      const note = worldContext.notes.find(n => n.id === `marker${marker.i}`);
      if (!note) continue;

      // Re-calculate this monster's AoE to estimate deaths
      let totalLostPop = 0;
      const start = m.cell;
      const power = m.power;
      const queue = [{ cell: start, dist: 0 }];
      const visited = new Set<number>([start]);

      while (queue.length > 0) {
        const { cell, dist } = queue.shift()!;
        const d = Math.max(0, power - dist);

        if (d > 0) {
          let dangerVal = 0;
          if (threatCalculation === "max") {
            dangerVal = d * 5;
          } else if (threatCalculation === "nonlinear") {
            dangerVal = Math.round(255 * (d / power) ** 2);
          } else {
            dangerVal = d * 4;
          }

          // Estimate what the suitability (s) of this cell would have been without the monster
          // using a simplified version of the rankCells formula:
          const baseScore = worldContext.biomesData.habitability[cells.biomeCode[cell]] || 0;
          if (baseScore > 0) {
            const potential_s = Math.max(0, baseScore - (cells.h[cell] - 50) / 5);

            // The danger multiplier in rankCells is: multiplier = Math.max(0, 1 - danger / 200)
            // So the 's' lost to this danger is: potential_s * Math.min(1, dangerVal / 200)
            const lost_s = potential_s * Math.min(1, dangerVal / 200);

            const lostCapacity = (lost_s * cells.area[cell]) / meanArea;
            const lostPop = lostCapacity * initialPopulationSaturation * populationRate;
            totalLostPop += lostPop;
          }

          for (const n of cells.c[cell]) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push({ cell: n, dist: dist + 1 });
            }
          }
        }
      }

      if (totalLostPop > 0) {
        // Assume 20% of the lost capacity are actual direct deaths/casualties,
        // while the remaining 80% represents people who simply migrated away or never settled there.
        const deaths = Math.floor(Math.round(totalLostPop * 0.2));
        const deathStr = deaths.toLocaleString();

        note.legend += `\n\nHistorians estimate that the presence of this creature has resulted in the deaths of approximately ${deathStr} people, with countless more displaced from the surrounding region.`;
      }
    }
  }
};
