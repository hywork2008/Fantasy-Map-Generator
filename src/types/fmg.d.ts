import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { UITourModule } from "../modules/ui-tour";
import type { Grid } from "../utils/graphUtils";
import type { WorldState } from "./WorldState";

/**
 * window.fmg — the single typed, intentional, externally observable API surface.
 * Assembled once in app.ts after all modules are fully initialized.
 * See AGENTS.md Section 6 for the design rationale and usage rules.
 */
export interface FMGActionsAPI {
  generate(options?: { seed?: string; graph?: Grid | null }): Promise<void>;
  regenerateMap(opts?: { seed?: string } | string): void;
  zoomTo(x: number, y: number, scale: number, duration?: number): void;
  resetZoom(duration?: number): void;
  toggleLayer(id: string, event?: MouseEvent): void;
  handleLayersPresetChange(preset: string): void;
  savePreset(): void;
  removePreset(): void;
  changeViewMode(event: MouseEvent): void;
  restoreDefaultEvents(): void;
  unselect(): void;
  getWorldState(): WorldState;
  UITour: UITourModule;
  layerIsOn(el: string): boolean;
  toggleLabels(event?: MouseEvent): void;
  toggleBurgIcons(event?: MouseEvent): void;
  saveGeoJsonZones(): void;
  getGeoJsonZones(): object;
  editBurg(id?: number): void;
}

export interface FMGNamespace {
  readonly world: WorldContext;
  readonly view: ViewContext;
  readonly actions: FMGActionsAPI;
}

declare global {
  interface Window {
    fmg: FMGNamespace;
  }
}
