type ShowStatisticsDeps = {
  ensureEl: (id: string) => any;
  heightmapTemplates: Record<string, unknown>;
  locked: (settingId: string) => boolean;
  seed: string;
  graphWidth: number;
  graphHeight: number;
  grid: any;
  pack: any;
  mapSizeValue: string | number;
  culturesSetValue: string;
  mapHistory: any[];
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
  const heightmap = ensureEl("templateInput").value;
  const isTemplate = heightmap in heightmapTemplates;
  const heightmapType = isTemplate ? "template" : "precreated";
  const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

  const stats = `  Seed: ${seed}
    Canvas size: ${graphWidth}x${graphHeight} px
    Heightmap: ${heightmap}
    Template: ${isRandomTemplate}${heightmapType}
    Points: ${grid.points.length}
    Cells: ${pack.cells.i.length}
    Map size: ${mapSizeValue}%
    States: ${pack.states.length - 1}
    Provinces: ${pack.provinces.length - 1}
    Burgs: ${pack.burgs.length - 1}
    Religions: ${pack.religions.length - 1}
    Culture set: ${culturesSetValue}
    Cultures: ${pack.cultures.length - 1}`;

  const mapId = Date.now();
  setMapId(mapId);
  mapHistory.push({ seed, width: graphWidth, height: graphHeight, template: heightmap, created: mapId });
  INFO && console.info(stats);

  window.dispatchEvent(new CustomEvent("map:generated", { detail: { seed, mapId } }));
}

type UndrawDeps = {
  viewbox: any;
  ensureEl: (id: string) => any;
  resetNotes: () => void;
  unfog: () => void;
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
  unfog();
}

type RegenerateDeps = {
  WARN: boolean;
  ensureEl: (id: string) => any;
  showLoading: () => void;
  hideLoading: () => void;
  closeDialogs: (except?: string) => void;
  setCustomization: (value: number) => void;
  resetZoom: (duration?: number) => void;
  undraw: () => void;
  generate: (options?: any) => Promise<void>;
  drawLayers: () => void;
  ThreeD: { options?: { isOn?: boolean }; redraw?: () => void };
  isWorldConfiguratorVisible: () => boolean;
  editWorld: () => void;
  fitMapToScreen: () => void;
  clearMainTip: () => void;
};

export async function regenerateMapFlow(options: any, deps: RegenerateDeps) {
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
  debounceFn: (fn: (options: any) => Promise<void>, delay: number) => (options: any) => void,
  deps: RegenerateDeps
) {
  return debounceFn(async (options: any) => {
    await regenerateMapFlow(options, deps);
  }, 250);
}
