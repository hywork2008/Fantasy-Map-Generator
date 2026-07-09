import type { SimulationContext } from "../context/simulationContext";
import type { RenderMode, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { UITourModule } from "../services/ui-tour";
import type { Grid } from "../utils/graphUtils";
import type { ExtensionAPI } from "./extension-api";
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
  setRenderMode(mode: RenderMode): void;
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
  /** Advances the world's simulation clock by deltaYears and runs all registered time-tick hooks. */
  advanceTime(deltaYears: number): void;
}

export interface FMGNamespace {
  readonly world: WorldContext;
  readonly view: ViewContext;
  readonly actions: FMGActionsAPI;
  /** Live simulation clock (currentYear, era, tickCount). */
  readonly simulation: SimulationContext;
  /** Dependency-injection API for dynamically loaded extensions. */
  readonly extensionAPI: ExtensionAPI;
}

declare global {
  interface Window {
    fmg: FMGNamespace;
  }
}
