type SetSeedDeps = {
  mapHistory: any[];
  locationHref: string;
  generateSeed: () => string;
  ensureEl: (id: string) => any;
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

type LakesDeps = {
  TIME: boolean;
  ensureEl: (id: string) => any;
  grid: any;
  d3: any;
};

export function addLakesInDeepDepressionsFlow({ TIME, ensureEl, grid, d3 }: LakesDeps) {
  TIME && console.time("addLakesInDeepDepressions");
  const elevationLimit = +ensureEl("lakeElevationLimitOutput").value;
  if (elevationLimit === 80) return;

  const { cells, features } = grid;
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

    features.push({ i: f, land: false, border: false, type: "lake" });
  }

  TIME && console.timeEnd("addLakesInDeepDepressions");
}

type NearSeaDeps = {
  ensureEl: (id: string) => any;
  grid: any;
  TIME: boolean;
};

export function openNearSeaLakesFlow({ ensureEl, grid, TIME }: NearSeaDeps) {
  if (ensureEl("templateInput").value === "Atoll") return;

  const cells = grid.cells;
  const features = grid.features;
  if (!features.find((f: any) => f.type === "lake")) return;
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

type GenerateDeps = {
  INFO: boolean;
  WARN: boolean;
  ERROR: boolean;
  getSeed: () => string;
  setSeed: (precreatedSeed?: string) => void;
  getGrid: () => any;
  setGrid: (grid: any) => void;
  resetPack: () => void;
  invokeActiveZooming: () => void;
  applyGraphSize: () => void;
  randomizeOptions: () => void;
  shouldRegenerateGrid: (grid: any, expectedSeed: any) => boolean;
  generateGrid: () => any;
  HeightmapGenerator: { generate: (grid: any) => Promise<any> };
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
  drawScaleBar: (scaleBar: any, scale: number) => void;
  scaleBar: any;
  scale: number;
  rn: (value: number, digits?: number) => number;
  showStatistics: () => void;
  parseError: (error: any) => string;
  clearMainTip: () => void;
  alertMessage: HTMLElement;
  cleanupData: () => void;
  regenerateMap: (source: string) => void;
  jqueryDialog: (options: any) => void;
  generationModules: {
    Features: any;
    Rivers: any;
    Biomes: any;
    Ice: any;
    Cultures: any;
    Burgs: any;
    States: any;
    Routes: any;
    Religions: any;
    Provinces: any;
    Lakes: any;
    Military: any;
    Markers: any;
    Zones: any;
    Names: any;
  };
};

export async function generateMapFlow(deps: GenerateDeps, options?: { seed?: string; graph?: any }) {
  try {
    const timeStart = performance.now();
    const { seed: precreatedSeed, graph: precreatedGraph } = options || {};

    deps.invokeActiveZooming();
    deps.setSeed(precreatedSeed);
    deps.INFO && console.group(`Generated Map ${deps.getSeed()}`);

    deps.applyGraphSize();
    deps.randomizeOptions();

    let grid = deps.getGrid();
    if (deps.shouldRegenerateGrid(grid, precreatedSeed)) grid = precreatedGraph || deps.generateGrid();
    else delete grid.cells.h;
    grid.cells.h = await deps.HeightmapGenerator.generate(grid);
    deps.setGrid(grid);
    deps.resetPack();

    deps.generationModules.Features.markupGrid();
    deps.addLakesInDeepDepressions();
    deps.openNearSeaLakes();

    deps.OceanLayers();
    deps.defineMapSize();
    deps.calculateMapCoordinates();
    deps.calculateTemperatures();
    deps.generatePrecipitation();

    deps.reGraph();
    deps.generationModules.Features.markupPack();
    deps.createDefaultRuler();

    deps.generationModules.Rivers.generate();
    deps.generationModules.Biomes.define();
    deps.generationModules.Features.defineGroups();

    deps.generationModules.Ice.generate();

    deps.rankCells();
    deps.generationModules.Cultures.generate();
    deps.generationModules.Cultures.expand();

    deps.generationModules.Burgs.generate();
    deps.generationModules.States.generate();
    deps.generationModules.Routes.generate();
    deps.generationModules.Religions.generate();

    deps.generationModules.Burgs.specify();
    deps.generationModules.States.collectStatistics();
    deps.generationModules.States.defineStateForms();

    deps.generationModules.Provinces.generate();
    deps.generationModules.Provinces.getPoles();

    deps.generationModules.Rivers.specify();
    deps.generationModules.Lakes.defineNames();

    deps.generationModules.Military.generate();
    deps.generationModules.Markers.generate();
    deps.generationModules.Zones.generate();

    deps.drawScaleBar(deps.scaleBar, deps.scale);
    deps.generationModules.Names.getMapName();

    deps.WARN && console.warn(`TOTAL: ${deps.rn((performance.now() - timeStart) / 1000, 2)}s`);
    deps.showStatistics();
    deps.INFO && console.groupEnd(`Generated Map ${deps.getSeed()}`);
  } catch (error: any) {
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
          (window as any).$(this).dialog("close");
        },
        Ignore: function () {
          (window as any).$(this).dialog("close");
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });
  }
}
