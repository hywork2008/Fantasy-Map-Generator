/**
 * Minimal window.fmg type declarations for E2E tests.
 * Intentionally avoids importing from src/ to prevent moduleResolution conflicts.
 * See src/types/fmg.d.ts for the authoritative definitions used by application code.
 */

interface FMGTestBurg {
  removed: boolean;
  cell: number;
  port: number;
  x: number;
  y: number;
  [key: string]: unknown;
}

interface FMGTestZone {
  cells: number[];
  [key: string]: unknown;
}

interface FMGTestCells {
  i: number[];
  h: number[];
  harbor: number[];
  c: number[][];
  p: Array<[number, number]>;
  [key: string]: unknown;
}

interface FMGTestPack {
  cells: FMGTestCells;
  burgs: FMGTestBurg[];
  states: unknown[];
  cultures: unknown[];
  religions: unknown[];
  provinces: unknown[];
  rivers: unknown[];
  markers: unknown[];
  notes: unknown[];
  zones: FMGTestZone[];
  [key: string]: unknown;
}

interface FMGTestSvgSelection {
  select(selector: string): FMGTestSvgSelection;
  style(property: string, value: string | null): FMGTestSvgSelection;
}

declare global {
  interface Window {
    /** Test-only flag set in click-edit.spec.ts to detect map:generated event timing */
    __fmgMapLoaded?: boolean;
    fmg: {
      readonly world: {
        readonly pack: FMGTestPack;
        readonly grid: Record<string, unknown>;
        readonly seed: string;
        readonly mapId: number;
        readonly graphWidth: number;
        readonly graphHeight: number;
        readonly options: Record<string, unknown>;
        readonly mapCoordinates: Record<string, unknown>;
        [key: string]: unknown;
      };
      readonly view: {
        readonly svg: FMGTestSvgSelection;
        readonly svgWidth: number;
        readonly svgHeight: number;
        readonly scale: number;
        readonly viewX: number;
        readonly viewY: number;
        [key: string]: unknown;
      };
      readonly actions: {
        generate(options?: { seed?: string; graph?: unknown }): Promise<void>;
        zoomTo(x: number, y: number, scale: number, duration?: number): void;
        resetZoom(duration?: number): void;
        setRenderMode(mode: "svg" | "webglHybrid"): void;
        toggleLayer(id: string, event?: MouseEvent): void;
        handleLayersPresetChange(preset: string): void;
        getWorldState(): unknown;
        layerIsOn(id: string): boolean;
        toggleLabels(event?: MouseEvent): void;
        toggleBurgIcons(event?: MouseEvent): void;
        editBurg(id?: number): void;
        getGeoJsonZones(): object;
        UITour: { start(): void };
        [key: string]: unknown;
      };
    };
  }
}

export {};
