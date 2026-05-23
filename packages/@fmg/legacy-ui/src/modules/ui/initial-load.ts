// @ts-nocheck
type InitialLoadDeps = {
  WARN: boolean;
  ERROR: boolean;
  ensureEl: (id: string) => any;
  ldb: { get: (key: string) => Promise<any> };
  uploadMap: (blob: Blob) => void;
  loadMapFromURL: (url: string, mode: number) => void;
  showUploadErrorMessage: (message: string, details?: string) => void;
  applyStyleOnLoad: () => Promise<void>;
  generate: (options?: any) => Promise<void>;
  applyLayersPreset: () => void;
  drawLayers: () => void;
  fitMapToScreen: () => void;
  focusOn: () => void;
  toggleAssistant: () => void;
};

export async function checkLoadParametersFlow(deps: InitialLoadDeps) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  if (params.get("maplink")) {
    deps.WARN && console.warn("Load map from URL");
    const maplink = params.get("maplink") as string;
    const pattern = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
    const valid = pattern.test(maplink);
    if (valid) {
      setTimeout(() => {
        deps.loadMapFromURL(maplink, 1);
      }, 1000);
      return;
    }

    deps.showUploadErrorMessage("Map link is not a valid URL", maplink);
  }

  if (params.get("seed")) {
    deps.WARN && console.warn("Generate map for seed");
    await generateMapOnLoadFlow(deps);
    return;
  }

  if ((deps.ensureEl("onloadBehavior") as HTMLSelectElement)?.value === "lastSaved") {
    try {
      const blob = await deps.ldb.get("lastMap");
      if (blob) {
        deps.WARN && console.warn("Loading last stored map");
        deps.uploadMap(blob);
        return;
      }
    } catch (error) {
      deps.ERROR && console.error(error);
    }
  }

  deps.WARN && console.warn("Generate random map");
  await generateMapOnLoadFlow(deps);
}

export async function generateMapOnLoadFlow(deps: Pick<
  InitialLoadDeps,
  "applyStyleOnLoad" | "generate" | "applyLayersPreset" | "drawLayers" | "fitMapToScreen" | "focusOn" | "toggleAssistant"
>) {
  await deps.applyStyleOnLoad();
  await deps.generate();
  deps.applyLayersPreset();
  deps.drawLayers();
  deps.fitMapToScreen();
  deps.focusOn();
  deps.toggleAssistant();
}

type FocusDeps = {
  pack: any;
  graphWidth: number;
  graphHeight: number;
  zoomTo: (x: number, y: number, z?: number, d?: number) => void;
  findBurgForMFCG: (params: URLSearchParams) => void;
};

export function focusOnFlow({ pack, graphWidth, graphHeight, zoomTo, findBurgForMFCG }: FocusDeps) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const fromMGCG = params.get("from") === "MFCG" && document.referrer;
  if (fromMGCG) {
    if (params.get("seed")?.length === 13) {
      const burgSeed = (params.get("seed") as string).slice(-4);
      params.set("burg", burgSeed);
    } else {
      findBurgForMFCG(params);
      return;
    }
  }

  const scaleParam = params.get("scale");
  const cellParam = params.get("cell");
  const burgParam = params.get("burg");

  if (scaleParam || cellParam || burgParam) {
    const scale = +scaleParam! || 8;

    if (cellParam) {
      const cell = +params.get("cell")!;
      const [x, y] = pack.cells.p[cell];
      zoomTo(x, y, scale, 1600);
      return;
    }

    if (burgParam) {
      const burg = Number.isNaN(+burgParam) ? pack.burgs.find((burg: any) => burg.name === burgParam) : pack.burgs[+burgParam];
      if (!burg) return;

      const { x, y } = burg;
      zoomTo(x, y, scale, 1600);
      return;
    }

    const x = +params.get("x")! || graphWidth / 2;
    const y = +params.get("y")! || graphHeight / 2;
    zoomTo(x, y, scale, 1600);
  }
}

type SelectMfcgDeps = {
  pack: any;
  d3: any;
  ERROR: boolean;
  burgLabels: any;
  zoomTo: (x: number, y: number, z?: number, d?: number) => void;
  invokeActiveZooming: () => void;
  tip: (message: string, autoHide?: boolean, type?: "info" | "warn" | "error" | "success", timeout?: number) => void;
};

export function findBurgForMFCGFlow(
  { pack, d3, ERROR, burgLabels, zoomTo, invokeActiveZooming, tip }: SelectMfcgDeps,
  params: URLSearchParams
) {
  const cells = pack.cells;
  const burgs = pack.burgs;
  if (pack.burgs.length < 2) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  const size = +params.get("size")!;
  const coast = +params.get("coast")!;
  const port = +params.get("port")!;
  const river = +params.get("river")!;

  let selection = defineSelection(coast, port, river);
  if (!selection.length) selection = defineSelection(coast, !port, !river);
  if (!selection.length) selection = defineSelection(!coast, 0, !river);
  if (!selection.length) selection = [burgs[1]];

  function defineSelection(coastVal: number, portVal: number, riverVal: number) {
    if (portVal && riverVal) return burgs.filter((b: any) => b.port && cells.r[b.cell]);
    if (!portVal && coastVal && riverVal) return burgs.filter((b: any) => !b.port && cells.t[b.cell] === 1 && cells.r[b.cell]);
    if (!coastVal && !riverVal) return burgs.filter((b: any) => cells.t[b.cell] !== 1 && !cells.r[b.cell]);
    if (!coastVal && riverVal) return burgs.filter((b: any) => cells.t[b.cell] !== 1 && cells.r[b.cell]);
    if (coastVal && riverVal) return burgs.filter((b: any) => cells.t[b.cell] === 1 && cells.r[b.cell]);
    return [];
  }

  const selected = d3.scan(selection, (a: any, b: any) => Math.abs(a.population - size) - Math.abs(b.population - size));
  const burgId = selection[selected].i;
  if (!burgId) {
    ERROR && console.error("Cannot select a burg for MFCG");
    return;
  }

  const b = burgs[burgId];
  const referrer = new URL(document.referrer);
  for (const p of referrer.searchParams) {
    if (p[0] === "name") b.name = p[1];
    else if (p[0] === "size") b.population = +p[1];
    else if (p[0] === "seed") b.MFCG = +p[1];
    else if (p[0] === "shantytown") b.shanty = +p[1];
    else b[p[0]] = +p[1];
  }
  if (params.get("name") && params.get("name") !== "null") b.name = params.get("name");

  const label = burgLabels.select(`[data-id='${burgId}']`);
  if (label.size()) {
    label
      .text(b.name)
      .classed("drag", true)
      .on("mouseover", function () {
        d3.select(this).classed("drag", false);
        label.on("mouseover", null);
      });
  }

  zoomTo(b.x, b.y, 8, 1600);
  invokeActiveZooming();
  tip(`Here stands the glorious city of ${b.name}`, true, "success", 15000);
}
