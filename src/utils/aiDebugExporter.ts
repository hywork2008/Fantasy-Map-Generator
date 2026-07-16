import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import {
  BordersRenderer,
  BurgIconsRenderer,
  BurgLabelsRenderer,
  MilitaryRenderer,
  ProvincesRenderer,
  StateLabelsRenderer
} from "../renderers";
import type { Snapshot, SnapshotData } from "../store/debugSnapshotState";
import { layerIsOn } from "./nodeUtils";

/**
 * Extracts the relevant dynamic state for AI debugging.
 * Doing a deep clone of the arrays to ensure they are snapshots, not references.
 */
export function captureSnapshotData(): SnapshotData {
  return {
    simulation: JSON.parse(JSON.stringify(simulationContext)),
    states: worldContext.pack.states.map(s => ({
      i: s.i,
      name: s.name,
      diplomacy: JSON.parse(JSON.stringify(s.diplomacy || [])),
      campaigns: JSON.parse(JSON.stringify(s.campaigns || [])),
      military: JSON.parse(JSON.stringify(s.military || []))
    })),
    burgs: worldContext.pack.burgs.map(b => ({
      i: b.i,
      state: b.state,
      name: b.name,
      population: b.population,
      demographics: JSON.parse(JSON.stringify(b.demographics || {}))
    })),
    provinces: worldContext.pack.provinces.map(p => ({
      i: p.i,
      state: p.state,
      name: p.name
    }))
  };
}

/**
 * Overwrites the current world context with the given snapshot data,
 * then triggers map redraws to visualize the past state.
 */
export function restoreSnapshot(snapshotData: SnapshotData): void {
  // Restore simulation context
  Object.assign(simulationContext, snapshotData.simulation);
  worldContext.options.year = simulationContext.currentYear;

  // Restore states (only overwrite the properties we captured, keeping static data intact)
  for (const sData of snapshotData.states) {
    const state = worldContext.pack.states[sData.i];
    if (state) {
      state.diplomacy = JSON.parse(JSON.stringify(sData.diplomacy));
      state.campaigns = JSON.parse(JSON.stringify(sData.campaigns));
      state.military = JSON.parse(JSON.stringify(sData.military));
    }
  }

  // Restore burgs
  for (const bData of snapshotData.burgs) {
    if (bData.i === undefined) continue;
    const burg = worldContext.pack.burgs[bData.i];
    if (burg) {
      burg.state = bData.state;
      burg.population = bData.population;
      if (burg.demographics) {
        Object.assign(burg.demographics, JSON.parse(JSON.stringify(bData.demographics)));
      } else {
        burg.demographics = JSON.parse(JSON.stringify(bData.demographics));
      }
    }
  }

  // Restore provinces
  for (const pData of snapshotData.provinces) {
    const province = worldContext.pack.provinces[pData.i];
    if (province) {
      province.state = pData.state;
    }
  }

  // Redraw the relevant map layers based on the restored data
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleLabels")) {
    StateLabelsRenderer.render(worldContext, viewContext, appServices);
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
  }
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleMilitary")) MilitaryRenderer.render(worldContext, viewContext, appServices);

  // Dispatch event so UI can update the calendar
  document.dispatchEvent(
    new CustomEvent("fmg:simulation-updated", {
      detail: { currentYear: simulationContext.currentYear, era: simulationContext.era }
    })
  );
}

/**
 * Sends the selected snapshots to the Vite dev server plugin to be saved to disk.
 */
export async function exportSnapshotsToAPI(snapshots: Snapshot[]): Promise<boolean> {
  try {
    const response = await fetch("/api/dev/dump-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(snapshots, null, 2)
    });

    if (!response.ok) {
      console.error("Failed to export state to API", await response.text());
      return false;
    }

    const data = await response.json();
    console.log("Successfully exported to", data.file);
    return true;
  } catch (err) {
    console.error("Error during state export", err);
    return false;
  }
}
