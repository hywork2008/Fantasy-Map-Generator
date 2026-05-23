type EnsureElement = HTMLElement & {
  value?: string;
};

type HistoryEntry = {
  seed: string;
  width: number;
  height: number;
  template: string;
  created: number;
};

type GridLike = {
  points: { length: number };
};

type PackLike = {
  cells: { i: { length: number } };
  states: { length: number };
  provinces: { length: number };
  burgs: { length: number };
  religions: { length: number };
  cultures: { length: number };
};

type ShowStatisticsDeps = {
  ensureEl: (id: string) => EnsureElement;
  heightmapTemplates: Record<string, unknown>;
  locked: (settingId: string) => boolean;
  seed: string;
  graphWidth: number;
  graphHeight: number;
  grid: unknown;
  pack: unknown;
  mapSizeValue: string | number;
  culturesSetValue: string;
  mapHistory: HistoryEntry[] | unknown[];
  INFO: boolean;
  setMapId: (id: number) => void;
};

export function showStatisticsFlow({
  ensureEl,
  heightmapTemplates,
  locked,
  seed,
  graphWidth,
  graphHeight,
  grid,
  pack,
  mapSizeValue,
  culturesSetValue,
  mapHistory,
  INFO,
  setMapId
}: ShowStatisticsDeps) {
  const statsGrid = grid as GridLike;
  const statsPack = pack as PackLike;
  const heightmap = ensureEl("templateInput").value;
  const isTemplate = heightmap in heightmapTemplates;
  const heightmapType = isTemplate ? "template" : "precreated";
  const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

  const stats = `  Seed: ${seed}
    Canvas size: ${graphWidth}x${graphHeight} px
    Heightmap: ${heightmap}
    Template: ${isRandomTemplate}${heightmapType}
    Points: ${statsGrid.points.length}
    Cells: ${statsPack.cells.i.length}
    Map size: ${mapSizeValue}%
    States: ${statsPack.states.length - 1}
    Provinces: ${statsPack.provinces.length - 1}
    Burgs: ${statsPack.burgs.length - 1}
    Religions: ${statsPack.religions.length - 1}
    Culture set: ${culturesSetValue}
    Cultures: ${statsPack.cultures.length - 1}`;

  const mapId = Date.now();
  setMapId(mapId);
  mapHistory.push({ seed, width: graphWidth, height: graphHeight, template: heightmap, created: mapId } as HistoryEntry);
  INFO && console.info(stats);

  window.dispatchEvent(new CustomEvent("map:generated", { detail: { seed, mapId } }));
}

type UndrawDeps = {
  viewbox: {
    selectAll: (selector: string) => { remove: () => void };
  };
  ensureEl: (id: string) => HTMLElement;
  resetNotes: () => void;
  unfog?: () => void;
};

export function undrawFlow({ viewbox, ensureEl, resetNotes, unfog }: UndrawDeps) {
  viewbox
    .selectAll("path, circle, polygon, line, text, use, #texture > image, #zones > g, #armies > g, #ruler > g")
    .remove();
  ensureEl("deftemp")
    .querySelectorAll("path, clipPath, svg")
    .forEach((el: Element) => el.remove());
  ensureEl("coas").innerHTML = "";
  resetNotes();
  if (typeof unfog === "function") unfog();
}

type RegenerateDeps = {
  WARN: boolean;
  ensureEl: (id: string) => HTMLElement;
  showLoading: () => void;
  hideLoading: () => void;
  closeDialogs: (except?: string) => void;
  setCustomization: (value: number) => void;
  resetZoom: (duration?: number) => void;
  undraw: () => void;
  generate: (options?: unknown) => Promise<void>;
  drawLayers: () => void;
  ThreeD: { options?: { isOn?: boolean }; redraw?: () => void };
  isWorldConfiguratorVisible: () => boolean;
  editWorld: () => void;
  fitMapToScreen: () => void;
  clearMainTip: () => void;
};

export async function regenerateMapFlow(options: unknown, deps: RegenerateDeps) {
  deps.WARN && console.warn("Generate new random map");

  const cellsDesired = +deps.ensureEl("pointsInput").dataset.cells;
  const shouldShowLoading = cellsDesired > 10000;
  shouldShowLoading && deps.showLoading();

  deps.closeDialogs("#worldConfigurator, #options3d");
  deps.setCustomization(0);
  deps.resetZoom(1000);
  deps.undraw();
  await deps.generate(options);
  deps.drawLayers();
  if (deps.ThreeD.options?.isOn) deps.ThreeD.redraw?.();
  if (deps.isWorldConfiguratorVisible()) deps.editWorld();

  deps.fitMapToScreen();
  shouldShowLoading && deps.hideLoading();
  deps.clearMainTip();
}

export function createRegenerateMap(
  debounceFn: (
    fn: (options: unknown) => Promise<void>,
    delay: number
  ) => (options: unknown) => void,
  deps: RegenerateDeps
) {
  return debounceFn(async (options: unknown) => {
    await regenerateMapFlow(options, deps);
  }, 250);
}
