import type { GenerationModules } from "./generation-deps";

export type EnsureInputElement = HTMLInputElement & {
  value: string;
};

export type SeedHistoryEntry = {
  created?: number;
};

export type SetSeedDeps = {
  mapHistory: SeedHistoryEntry[] | unknown[];
  locationHref: string;
  generateSeed: () => string;
  ensureEl: (id: string) => EnsureInputElement;
  aleaPRNG: (seed: string) => () => number;
};

export function setSeedFlow({ mapHistory, locationHref, generateSeed, ensureEl, aleaPRNG }: SetSeedDeps, precreatedSeed?: string) {
  let seed = precreatedSeed;

  if (!seed) {
    const first = !mapHistory[0];
    const params = new URL(locationHref).searchParams;
    const urlSeed = params.get("seed") || "";
    if (first && params.get("from") === "MFCG" && urlSeed.length === 13) seed = urlSeed.slice(0, -4);
    else if (first && urlSeed) seed = urlSeed;
    else seed = generateSeed();
  }

  ensureEl("optionsSeed").value = seed;
  Math.random = aleaPRNG(seed);
  return seed;
}

export type LakesDeps = {
  TIME: boolean;
  ensureEl: (id: string) => EnsureInputElement;
  grid: unknown;
  d3: {
    min: (values: number[]) => number;
  };
};

export type LakeFeature = {
  type: string;
  land: boolean;
  border: boolean;
};

export type LakeGrid = {
  cells: {
    i: number[];
    c: number[][];
    h: number[];
    b: number[];
    t: number[];
    f: number[];
  };
  features: LakeFeature[];
};

export function addLakesInDeepDepressionsFlow({ TIME, ensureEl, grid, d3 }: LakesDeps) {
  TIME && console.time("addLakesInDeepDepressions");
  const lakeGrid = grid as LakeGrid;
  const elevationLimit = +ensureEl("lakeElevationLimitOutput").value;
  if (elevationLimit === 80) return;

  const { cells, features } = lakeGrid;
  const { c, h, b } = cells;

  for (const i of cells.i) {
    if (b[i] || h[i] < 20) continue;

    const minHeight = d3.min(c[i].map((cellId: number) => h[cellId]));
    if (h[i] > minHeight) continue;

    let deep = true;
    const threshold = h[i] + elevationLimit;
    const queue = [i];
    const checked: boolean[] = [];
    checked[i] = true;

    while (deep && queue.length) {
      const q = queue.pop();

      for (const n of c[q]) {
        if (checked[n]) continue;
        if (h[n] >= threshold) continue;
        if (h[n] < 20) {
          deep = false;
          break;
        }

        checked[n] = true;
        queue.push(n);
      }
    }

    if (deep) {
      const lakeCells = [i].concat(c[i].filter((cellId: number) => h[cellId] === h[i]));
      addLake(lakeCells);
    }
  }

  function addLake(lakeCells: number[]) {
    const f = features.length;

    lakeCells.forEach(i => {
      cells.h[i] = 19;
      cells.t[i] = -1;
      cells.f[i] = f;
      c[i].forEach((n: number) => !lakeCells.includes(n) && (cells.t[n] = 1));
    });

    // @ts-ignore Lake feature structure
    features.push({ i: f, land: false, border: false, type: "lake" });
  }

  TIME && console.timeEnd("addLakesInDeepDepressions");
}

export type NearSeaDeps = {
  ensureEl: (id: string) => EnsureInputElement;
  grid: unknown;
  TIME: boolean;
};

export function openNearSeaLakesFlow({ ensureEl, grid, TIME }: NearSeaDeps) {
  const lakeGrid = grid as LakeGrid;
  if (ensureEl("templateInput").value === "Atoll") return;

  const cells = lakeGrid.cells;
  const features = lakeGrid.features;
  if (!features.find(f => f.type === "lake")) return;
  TIME && console.time("openLakes");
  const LIMIT = 22;

  for (const i of cells.i) {
    const lakeFeatureId = cells.f[i];
    if (features[lakeFeatureId].type !== "lake") continue;

    check_neighbours: for (const c of cells.c[i]) {
      if (cells.t[c] !== 1 || cells.h[c] > LIMIT) continue;

      for (const n of cells.c[c]) {
        const ocean = cells.f[n];
        if (features[ocean].type !== "ocean") continue;
        removeLake(c, lakeFeatureId, ocean);
        break check_neighbours;
      }
    }
  }

  function removeLake(thresholdCellId: number, lakeFeatureId: number, oceanFeatureId: number) {
    cells.h[thresholdCellId] = 19;
    cells.t[thresholdCellId] = -1;
    cells.f[thresholdCellId] = oceanFeatureId;
    cells.c[thresholdCellId].forEach((c: number) => {
      if (cells.h[c] >= 20) cells.t[c] = 1;
    });

    cells.i.forEach((i: number) => {
      if (cells.f[i] === lakeFeatureId) cells.f[i] = oceanFeatureId;
    });
    features[lakeFeatureId].type = "ocean";
  }

  TIME && console.timeEnd("openLakes");
}

export type GenerateDeps = {
  INFO: boolean;
  WARN: boolean;
  ERROR: boolean;
  getSeed: () => string;
  setSeed: (precreatedSeed?: string) => void;
  getGrid: () => unknown;
  setGrid: (grid: unknown) => void;
  resetPack: () => void;
  invokeActiveZooming: () => void;
  applyGraphSize: () => void;
  randomizeOptions: () => void;
  shouldRegenerateGrid: (grid: unknown, expectedSeed: unknown) => boolean;
  generateGrid: () => unknown;
  HeightmapGenerator: { generate: (grid: unknown) => Promise<unknown> };
  addLakesInDeepDepressions: () => void;
  openNearSeaLakes: () => void;
  OceanLayers: () => void;
  defineMapSize: () => void;
  calculateMapCoordinates: () => void;
  calculateTemperatures: () => void;
  generatePrecipitation: () => void;
  reGraph: () => void;
  createDefaultRuler: () => void;
  rankCells: () => void;
  drawScaleBar: (scaleBar: unknown, scale: number) => void;
  scaleBar: unknown;
  scale: number;
  rn: (value: number, digits?: number) => number;
  showStatistics: () => void;
  parseError: (error: unknown) => string;
  clearMainTip: () => void;
  alertMessage: HTMLElement;
  cleanupData: () => void;
  regenerateMap: (source: string) => void;
  jqueryDialog: (options: JqueryDialogOptions) => void;
  generationModules: GenerationModules;
};

export type GridState = {
  cells: {
    h?: unknown;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type JqueryDialogHost = {
  dialog: (action: string) => void;
};

export type JqueryDialogOptions = {
  resizable: boolean;
  title: string;
  width: string;
  buttons: {
    "Cleanup data": () => void;
    Regenerate: () => void;
    Ignore: () => void;
  };
  position: { my: string; at: string; of: string };
};

const jqueryRuntime = window as Window & {
  $: (target: unknown) => JqueryDialogHost;
};

export async function generateMapFlow(deps: GenerateDeps, options?: { seed?: string; graph?: unknown }) {
  try {
    const modules = deps.generationModules;
    const timeStart = performance.now();
    const { seed: precreatedSeed, graph: precreatedGraph } = options || {};

    deps.invokeActiveZooming();
    deps.setSeed(precreatedSeed);
    deps.INFO && console.group(`Generated Map ${deps.getSeed()}`);

    deps.applyGraphSize();
    deps.randomizeOptions();

    let gridState = deps.getGrid() as GridState;
    if (deps.shouldRegenerateGrid(gridState, precreatedSeed)) {
      gridState = (precreatedGraph || deps.generateGrid()) as GridState;
    } else {
      delete gridState.cells.h;
    }
    gridState.cells.h = await deps.HeightmapGenerator.generate(gridState);
    deps.setGrid(gridState);
    deps.resetPack();

    modules.Features.markupGrid();
    deps.addLakesInDeepDepressions();
    deps.openNearSeaLakes();

    deps.OceanLayers();
    deps.defineMapSize();
    deps.calculateMapCoordinates();
    deps.calculateTemperatures();
    deps.generatePrecipitation();

    deps.reGraph();
    modules.Features.markupPack();
    deps.createDefaultRuler();

    modules.Rivers.generate();
    modules.Biomes.define();
    modules.Features.defineGroups();

    modules.Ice.generate();

    deps.rankCells();
    modules.Cultures.generate();
    modules.Cultures.expand();

    modules.Burgs.generate();
    modules.States.generate();
    modules.Routes.generate();
    modules.Religions.generate();

    modules.Burgs.specify();
    modules.States.collectStatistics();
    modules.States.defineStateForms();

    modules.Provinces.generate();
    modules.Provinces.getPoles();

    modules.Rivers.specify();
    modules.Lakes.defineNames();

    modules.Military.generate();
    modules.Markers.generate();
    modules.Zones.generate();

    deps.drawScaleBar(deps.scaleBar, deps.scale);
    modules.Names.getMapName(false);

    deps.WARN && console.warn(`TOTAL: ${deps.rn((performance.now() - timeStart) / 1000, 2)}s`);
    deps.showStatistics();
    deps.INFO && console.groupEnd();
  } catch (error: unknown) {
    deps.ERROR && console.error(error);
    const parsedError = deps.parseError(error);
    deps.clearMainTip();

    deps.alertMessage.innerHTML = `An error has occurred on map generation. Please retry. <br />If error is critical, clear the stored data and try again.
      <p id="errorBox">${parsedError}</p>`;

    deps.jqueryDialog({
      resizable: false,
      title: "Generation error",
      width: "32em",
      buttons: {
        "Cleanup data": () => deps.cleanupData(),
        Regenerate: function () {
          deps.regenerateMap("generation error");
          jqueryRuntime.$(this).dialog("close");
        },
        Ignore: function () {
          jqueryRuntime.$(this).dialog("close");
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}
