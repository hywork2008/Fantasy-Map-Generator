import * as d3 from "d3";
import { hsl, interpolateRound, lab, max, mean, pointer, range, select } from "d3";
import { aleaPRNG } from "../components/AleaPRNG";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Biomes } from "../modules/biomes";
import type { Burg } from "../modules/burgs-generator";
import { Burgs } from "../modules/burgs-generator";
import type { Culture } from "../modules/cultures-generator";
import { Cultures } from "../modules/cultures-generator";
import { Features } from "../modules/features";
import { Ice } from "../modules/ice";
import { Lakes } from "../modules/lakes";
import { Markers } from "../modules/markers-generator";
import { Military } from "../modules/military-generator";
import { OceanLayers } from "../modules/ocean-layers";
import type { Province } from "../modules/provinces-generator";
import { Provinces } from "../modules/provinces-generator";
import { Religions } from "../modules/religions-generator";
import { Rivers } from "../modules/river-generator";
import { Routes } from "../modules/routes-generator";
import { States } from "../modules/states-generator";
import type { Zone } from "../modules/zones-generator";
import { Zones } from "../modules/zones-generator";
import { drawFeatures } from "../renderers";
import {
  createTypedArray,
  ensureEl,
  findCell,
  generateSeed,
  getGridPolygon,
  link,
  minmax,
  rn,
  showPrompt,
  unique
} from "../utils";
import { getColorScheme } from "../utils/colorUtils";
import { HeightmapEditorHistoryClass as HeightmapEditorHistory } from "./HeightmapEditorHistory";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

// ─── Module-level state ───────────────────────────────────────────────────────

let editHeightmapLayers: string[] = [];
let heightmapHistory: InstanceType<typeof HeightmapEditorHistory> | undefined;

// ─── Main entry point ─────────────────────────────────────────────────────────

export function editHeightmap(options?: { mode?: string; tool?: string }): void {
  const { mode, tool } = options || {};
  restartHistory();
  viewbox.selectAll("#heights").remove();
  viewbox.insert("g", "#terrs").attr("id", "heights");

  if (!mode) showModeDialog();
  else enterHeightmapEditMode(mode);

  if (modules.editHeightmap) return;
  modules.editHeightmap = true;

  ensureEl("paintBrushes").addEventListener("click", openBrushesPanel);
  ensureEl("applyTemplate").addEventListener("click", openTemplateEditor);
  ensureEl("convertImage").addEventListener("click", openImageConverter);
  ensureEl("heightmapPreview").addEventListener("click", toggleHeightmapPreview);
  ensureEl("heightmap3DView").addEventListener("click", changeViewMode);
  ensureEl("finalizeHeightmap").addEventListener("click", finalizeHeightmap);
  ensureEl("renderOcean").addEventListener("click", mockHeightmap);
  ensureEl("templateUndo").addEventListener("click", undoHistory);
  ensureEl("templateRedo").addEventListener("click", redoHistory);

  function showModeDialog() {
    alertMessage.innerHTML = `Heightmap is a core element on which all other data (rivers, burgs, states etc) is based. So the best edit approach is to
    <i>erase</i> the secondary data and let the system automatically regenerate it on edit completion.
    <p><i>Erase</i> mode also allows you Convert an Image into a heightmap or use Template Editor.</p>
    <p>You can <i>keep</i> the data, but you won't be able to change the coastline.</p>
    <p>Try <i>risk</i> mode to change the coastline and keep the data. The data will be restored as much as possible, but it can cause unpredictable errors.</p>
    <p>Please <span class="pseudoLink" onclick="saveMap('machine')">save the map</span> before editing the heightmap!</p>
    <p style="margin-bottom: 0">Check out ${link("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Heightmap-customization", "wiki")} for guidance.</p>`;

    $("#alert").dialog({
      resizable: false,
      title: "Edit Heightmap",
      width: "28em",
      buttons: {
        Erase: () => enterHeightmapEditMode("erase"),
        Keep: () => enterHeightmapEditMode("keep"),
        Risk: () => enterHeightmapEditMode("risk"),
        Cancel: function (this: Element) {
          $(this).dialog("close");
        }
      }
    });
  }

  function enterHeightmapEditMode(mode: string) {
    editHeightmapLayers = Array.from(mapLayers.querySelectorAll("li:not(.buttonoff)")).map(
      node => (node as HTMLElement).id
    );
    editHeightmapLayers.forEach(l => {
      ensureEl(l).click();
    });

    customization = 1;
    closeDialogs();
    tip('Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap', true);

    ensureEl("options")
      .querySelectorAll<HTMLElement>(".tabcontent")
      .forEach(tabcontent => {
        tabcontent.style.display = "none";
      });
    ensureEl("options").querySelector<HTMLElement>(".tab > .active")!.classList.remove("active");
    ensureEl("customizationMenu").style.display = "block";
    ensureEl("toolsTab").classList.add("active");
    heightmapEditMode.innerHTML = mode;

    if (mode === "erase") {
      undraw();
      (cellTypeFilter as HTMLSelectElement).value = "all";
    } else if (mode === "keep") {
      viewbox.selectAll("#landmass, #lakes").style("display", "none");
      (cellTypeFilter as HTMLSelectElement).value = "land";
    } else if (mode === "risk") {
      defs.selectAll("#land, #water").selectAll("path").remove();
      defs.select("#featurePaths").selectAll("path").remove();
      viewbox.selectAll("#coastline use, #lakes path, #oceanLayers path").remove();
      (cellTypeFilter as HTMLSelectElement).value = "all";
    }

    applyTemplate.style.display = mode === "erase" ? "inline-block" : "none";
    convertImage.style.display = mode === "erase" ? "inline-block" : "none";
    allowErosionBox.style.display = mode === "keep" ? "none" : "inline-block";

    if (!sessionStorage.getItem("noExitButtonAnimation")) {
      sessionStorage.setItem("noExitButtonAnimation", "true");
      exitCustomization.style.opacity = "0";
      const width = 12 * +uiSize.value * 11;
      exitCustomization.style.right = `${(svgWidth - width) / 2}px`;
      exitCustomization.style.bottom = `${svgHeight / 2}px`;
      exitCustomization.style.transform = "scale(2)";
      exitCustomization.style.display = "block";
      d3.select("#exitCustomization")
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .transition()
        .duration(2000)
        .ease(d3.easeSinInOut)
        .style("right", "10px")
        .style("bottom", "10px")
        .style("transform", "scale(1)");
    } else {
      exitCustomization.style.display = "block";
    }

    turnButtonOn("toggleHeight");
    (layersPreset as HTMLSelectElement).value = "heightmap";
    layersPreset.disabled = true;
    mockHeightmap();

    viewbox.on("touchmove", moveCursor).on("mousemove", moveCursor);
    svg.on("dblclick.zoom", null);

    if (tool === "templateEditor") openTemplateEditor();
    else if (tool === "imageConverter") openImageConverter();
    else openBrushesPanel();
  }

  function moveCursor(this: SVGElement, event: MouseEvent): void {
    const [x, y] = pointer(event, this);
    const cell = findGridCell(x, y, grid);
    heightmapInfoX.innerHTML = String(rn(x));
    heightmapInfoY.innerHTML = String(rn(y));
    heightmapInfoCell.innerHTML = String(cell);
    heightmapInfoHeight.innerHTML = `${grid.cells.h[cell]} (${getHeight(grid.cells.h[cell])})`;
    if ((tooltip as HTMLElement).dataset.main) showMainTip();

    const pressed = ensureEl("brushesButtons").querySelector<HTMLButtonElement>("button.pressed");
    if (!pressed) return;

    if (pressed.id === "brushLine") {
      debug.select("line").attr("x2", x).attr("y2", y);
      return;
    }
    if (pressed.id === "brushFill") {
      removeCircle();
      return;
    }
    moveCircle(x, y, (heightmapBrushRadius as HTMLInputElement).valueAsNumber);
  }

  function getHeight(h: number): string {
    const unit = (heightUnit as HTMLSelectElement).value;
    let unitRatio = 3.281;
    if (unit === "m") unitRatio = 1;
    else if (unit === "f") unitRatio = 0.5468;

    let height = -990;
    if (h >= 20) height = (h - 18) ** +(heightExponentInput as HTMLInputElement).value;
    else if (h < 20 && h > 0) height = ((h - 20) / h) * 50;

    return `${rn(height * unitRatio)} ${unit}`;
  }

  function finalizeHeightmap(): void {
    if (viewbox.select("#heights").selectAll("*").size() < 200) {
      tip("Insufficient land area. There should be at least 200 land cells!", false, "error");
      return;
    }
    if (ensureEl("imageConverter").offsetParent) {
      tip("Please exit the Image Conversion mode first", false, "error");
      return;
    }

    heightmapHistory = undefined;
    redo!.disabled = templateRedo.disabled = true;
    undo!.disabled = templateUndo.disabled = true;

    customization = 0;
    customizationMenu.style.display = "none";
    if (ensureEl("options").querySelector<HTMLElement>(".tab > button.active")?.id === "toolsTab")
      toolsContent.style.display = "block";
    layersPreset.disabled = false;
    exitCustomization.style.display = "none";

    restoreDefaultEvents?.();
    clearMainTip();
    closeDialogs();
    resetZoom();

    if (document.getElementById("preview")) document.getElementById("preview")!.remove();
    if (document.getElementById("canvas3d")) enterStandardView();

    const mode = heightmapEditMode.innerHTML;
    if (mode === "erase") regenerateErasedData();
    else if (mode === "keep") restoreKeptData();
    else if (mode === "risk") restoreRiskedData();

    drawFeatures(worldContext, viewContext, appServices);
    viewbox.selectAll("#heights").remove();

    turnButtonOff("toggleHeight");
    document
      .getElementById("mapLayers")!
      .querySelectorAll("li")
      .forEach(e => {
        const wasOn = editHeightmapLayers.includes((e as HTMLElement).id);
        if ((wasOn && !layerIsOn((e as HTMLElement).id)) || (!wasOn && layerIsOn((e as HTMLElement).id)))
          (e as HTMLElement).click();
      });
    if (!layerIsOn("toggleBorders")) borders.selectAll("path").remove();
    if (!layerIsOn("toggleStates")) regions.selectAll("path").remove();
    if (!layerIsOn("toggleRivers")) rivers.selectAll("*").remove();

    getCurrentPreset();
  }

  function regenerateErasedData(): void {
    INFO && console.group("Edit Heightmap");
    TIME && console.time("regenerateErasedData");

    pack.cultures = [];
    pack.burgs = [];
    pack.states = [];
    pack.provinces = [];
    pack.religions = [];

    const erosionAllowed = (allowErosion as HTMLInputElement).checked;
    Features.markupGrid();
    if (erosionAllowed) {
      addLakesInDeepDepressions();
      openNearSeaLakes();
    }
    OceanLayers();
    calculateTemperatures();
    generatePrecipitation();
    reGraph();
    Features.markupPack();

    const state = getWorldState();
    Rivers.generate(worldContext, viewContext, appServices, state, erosionAllowed);

    if (!erosionAllowed) {
      for (const i of pack.cells.i) {
        const g = pack.cells.g[i];
        if (pack.cells.h[i] !== grid.cells.h[g] && pack.cells.h[i] >= 20 === grid.cells.h[g] >= 20)
          pack.cells.h[i] = grid.cells.h[g];
      }
    }

    Biomes.define(state);
    Features.defineGroups();
    rankCells();
    Cultures.generate(worldContext, viewContext, appServices, state);
    Cultures.expand(state);
    Burgs.generate(worldContext, viewContext, appServices, state);
    States.generate(worldContext, viewContext, appServices, state);
    Routes.generate(worldContext, viewContext, appServices, state);
    Religions.generate(worldContext, viewContext, appServices, state);
    Burgs.specify(worldContext, viewContext, appServices, state);
    States.collectStatistics(state);
    States.defineStateForms(state);
    Provinces.generate(worldContext, viewContext, appServices, state);
    Provinces.getPoles(state);
    Rivers.specify(worldContext, viewContext, appServices, state);
    Lakes.defineNames(state);
    Ice.generate(worldContext, viewContext, appServices, state);
    Military.generate(worldContext, viewContext, appServices, state);
    Markers.generate(worldContext, viewContext, appServices, state);
    Zones.generate(worldContext, viewContext, appServices, state);

    TIME && console.timeEnd("regenerateErasedData");
    INFO && console.groupEnd();
  }

  function restoreKeptData(): void {
    viewbox.selectAll("#landmass, #lakes").style("display", null);
    for (const i of pack.cells.i) {
      pack.cells.h[i] = grid.cells.h[pack.cells.g[i]];
    }
  }

  function restoreRiskedData(): void {
    INFO && console.group("Edit Heightmap");
    TIME && console.time("restoreRiskedData");
    const erosionAllowed = (allowErosion as HTMLInputElement).checked;

    const l = grid.cells.i.length;
    const biome = new Uint8Array(l);
    const pop = new Uint16Array(l);
    const routesMap: Record<number, Record<number, number>> = {};
    const s = new Uint16Array(l);
    const burg = new Uint16Array(l);
    const stateArr = new Uint16Array(l);
    const province = new Uint16Array(l);
    const culture = new Uint16Array(l);
    const religion = new Uint16Array(l);
    const fl = new Uint16Array(l);
    const r = new Uint16Array(l);
    const conf = new Uint8Array(l);

    for (const i of pack.cells.i) {
      const g = pack.cells.g[i];
      biome[g] = pack.cells.biome[i];
      culture[g] = pack.cells.culture[i];
      pop[g] = pack.cells.pop[i];
      routesMap[g] = pack.cells.routes[i];
      s[g] = pack.cells.s[i];
      stateArr[g] = pack.cells.state[i];
      province[g] = pack.cells.province[i];
      burg[g] = pack.cells.burg[i];
      religion[g] = pack.cells.religion[i];
      if (!erosionAllowed) {
        fl[g] = pack.cells.fl[i];
        r[g] = pack.cells.r[i];
        conf[g] = pack.cells.conf[i];
      }
    }

    for (const i of grid.cells.i) {
      if (!burg[i]) continue;
      if (grid.cells.h[i] < 20) grid.cells.h[i] = 20;
    }

    for (const c of pack.cultures as (Culture & { x?: number; y?: number })[]) {
      if (!c.i || c.removed) continue;
      const p = pack.cells.p[c.center!] as [number, number];
      c.x = p[0];
      c.y = p[1];
    }

    const zoneGridCellsMap = new Map<number, number[]>();
    for (const zone of pack.zones as Zone[]) {
      if (!zone.cells?.length) continue;
      const zoneGridCells = zone.cells.map(i => pack.cells.g[i]);
      zoneGridCellsMap.set(zone.i, unique(zoneGridCells));
    }

    Features.markupGrid();
    if (erosionAllowed) addLakesInDeepDepressions();
    OceanLayers();
    calculateTemperatures();
    generatePrecipitation();
    reGraph();
    Features.markupPack();

    if (erosionAllowed) {
      const worldState = getWorldState();
      Rivers.generate(worldContext, viewContext, appServices, worldState, true);
      Features.defineGroups();
    }

    const n = pack.cells.i.length;
    pack.cells.pop = new Float32Array(n);
    pack.cells.routes = {};
    pack.cells.s = new Uint16Array(n);
    pack.cells.burg = new Uint16Array(n);
    pack.cells.state = new Uint16Array(n);
    pack.cells.province = new Uint16Array(n);
    pack.cells.culture = new Uint16Array(n);
    pack.cells.religion = new Uint16Array(n);
    pack.cells.biome = new Uint8Array(n);

    if (!erosionAllowed) {
      pack.cells.r = new Uint16Array(n);
      pack.cells.conf = new Uint8Array(n);
      pack.cells.fl = new Uint16Array(n);
    }

    for (const i of pack.cells.i) {
      const g = pack.cells.g[i];
      const isLand = pack.cells.h[i] >= 20;

      if (!erosionAllowed) {
        pack.cells.r[i] = r[g];
        pack.cells.conf[i] = conf[g];
        pack.cells.fl[i] = fl[g];
      }

      pack.cells.biome[i] =
        isLand && biome[g]
          ? biome[g]
          : Biomes.getId(grid.cells.prec[g], grid.cells.temp[g], pack.cells.h[i], Boolean(pack.cells.r[i]));

      if (!isLand) continue;
      pack.cells.culture[i] = culture[g];
      pack.cells.pop[i] = pop[g];
      pack.cells.routes[i] = routesMap[g];
      pack.cells.s[i] = s[g];
      pack.cells.state[i] = stateArr[g];
      pack.cells.province[i] = province[g];
      pack.cells.religion[i] = religion[g];
    }

    const findBurgCell = (x: number, y: number): number => {
      const i = findCell(x, y);
      if (pack.cells.h[i] >= 20) return i;
      const dist = pack.cells.c[i].map((c: number) =>
        pack.cells.h[c] < 20 ? Infinity : (pack.cells.p[c][0] - x) ** 2 + (pack.cells.p[c][1] - y) ** 2
      );
      return pack.cells.c[i][d3.leastIndex(dist) ?? 0];
    };

    for (const b of pack.burgs as Burg[]) {
      if (!b.i || b.removed) continue;
      b.cell = findBurgCell(b.x!, b.y!);
      b.feature = pack.cells.f[b.cell];
      pack.cells.burg[b.cell] = b.i!;
      if (!b.capital && pack.cells.h[b.cell] < 20) Burgs.remove(b.i);
      if (b.capital) pack.states[b.state!].center = b.cell;
    }

    for (const p of pack.provinces as Province[]) {
      if (!p.i || p.removed) continue;
      const provCells = Array.from(pack.cells.i).filter(i => pack.cells.province[i] === p.i);
      if (!provCells.length) {
        const st = p.state;
        const stateProvs = pack.states[st].provinces as number[];
        if (stateProvs.includes(p.i)) stateProvs.splice(stateProvs.indexOf(p.i), 1);
        p.removed = true;
        continue;
      }
      if (p.burg && !pack.burgs[p.burg].removed) p.center = pack.burgs[p.burg].cell;
      else {
        p.center = provCells[0];
        p.burg = pack.cells.burg[p.center];
      }
    }

    for (const c of pack.cultures as (Culture & { x?: number; y?: number })[]) {
      if (!c.i || c.removed) continue;
      c.center = findCell(c.x!, c.y!);
    }

    const worldState = getWorldState();
    if (erosionAllowed) {
      Rivers.specify(worldContext, viewContext, appServices, worldState);
      Lakes.defineNames(worldState);
    }

    const gridToPackMap = new Map<number, number[]>();
    for (const i of pack.cells.i) {
      const g = pack.cells.g[i];
      if (!gridToPackMap.has(g)) gridToPackMap.set(g, []);
      gridToPackMap.get(g)!.push(i);
    }

    for (const zone of pack.zones as Zone[]) {
      const gridCells = zoneGridCellsMap.get(zone.i);
      if (gridCells?.length) {
        const packCells = gridCells.flatMap(g => gridToPackMap.get(g) || []);
        zone.cells = unique(packCells);
      } else {
        zone.cells = [];
      }
    }

    Ice.generate(worldContext, viewContext, appServices, worldState);
    ice.selectAll("*").remove();

    TIME && console.timeEnd("restoreRiskedData");
    INFO && console.groupEnd();
  }

  function updateHeightmap(): void {
    const prev = heightmapHistory?.current as Uint8Array | undefined;
    const changed = prev ? (grid.cells.h as Uint8Array).reduce((s, h, i) => (h !== prev[i] ? s + 1 : s), 0) : 0;
    tip(`Cells changed: ${changed}`);
    if (!changed) return;

    if (prev && (cellTypeFilter as HTMLSelectElement).value === "land") {
      for (const i of grid.cells.i) {
        if (prev[i] < 20 || grid.cells.h[i] < 20) grid.cells.h[i] = prev[i];
      }
    }
    if (prev && (cellTypeFilter as HTMLSelectElement).value === "water") {
      for (const i of grid.cells.i) {
        if (prev[i] >= 20 || grid.cells.h[i] >= 20) grid.cells.h[i] = prev[i];
      }
    }

    mockHeightmap();
    updateHistory();
  }

  function getColor(value: number, scheme?: (t: number) => string): string {
    const s = scheme || getColorScheme(null);
    return s(1 - (value < 20 ? value - 5 : value) / 100);
  }

  function mockHeightmap(): void {
    const all = Array.from(grid.cells.i) as number[];
    const data = (renderOcean as HTMLInputElement).checked ? all : all.filter(i => grid.cells.h[i] >= 20);
    viewbox
      .select<SVGGElement>("#heights")
      .selectAll<SVGPolygonElement, number>("polygon")
      .data(data)
      .join("polygon")
      .attr("points", d => getGridPolygon(d).join(" "))
      .attr("id", d => `cell${d}`)
      .attr("fill", d => getColor(grid.cells.h[d]));
  }

  function mockHeightmapSelection(selection: number[]): void {
    const ocean = (renderOcean as HTMLInputElement).checked;
    const heights = viewbox.select<SVGGElement>("#heights");
    selection.forEach(i => {
      let cell = heights.select<SVGPolygonElement>(`#cell${i}`);
      if (!ocean && grid.cells.h[i] < 20) {
        cell.remove();
        return;
      }
      if (!cell.size())
        cell = heights
          .append<SVGPolygonElement>("polygon")
          .attr("points", getGridPolygon(i).join(" "))
          .attr("id", `cell${i}`);
      cell.attr("fill", getColor(grid.cells.h[i]));
    });
  }

  function updateStatistics(): void {
    const landCells = (grid.cells.h as Uint8Array).reduce((s, h) => (h >= 20 ? s + 1 : s), 0);
    ensureEl("landmassCounter").innerText = `${landCells} (${rn((landCells / grid.cells.i.length) * 100)}%)`;
    ensureEl("landmassAverage").innerText = String(rn(mean(Array.from(grid.cells.h)) ?? 0));
  }

  function updateHistory(noStat?: string): void {
    heightmapHistory!.push(grid.cells.h);
    undo!.disabled = templateUndo.disabled = !heightmapHistory!.canUndo;
    redo!.disabled = templateRedo.disabled = true;
    if (!noStat) {
      updateStatistics();
      if (document.getElementById("preview")) drawHeightmapPreview();
      if (document.getElementById("canvas3d")) ThreeD.redraw();
    }
  }

  function undoHistory(): void {
    const h = heightmapHistory!.undo();
    if (!h) return;
    grid.cells.h = h;
    undo!.disabled = templateUndo.disabled = !heightmapHistory!.canUndo;
    redo!.disabled = templateRedo.disabled = !heightmapHistory!.canRedo;
    mockHeightmap();
    updateStatistics();
    if (document.getElementById("preview")) drawHeightmapPreview();
    if (document.getElementById("canvas3d")) ThreeD.redraw();
  }

  function redoHistory(): void {
    const h = heightmapHistory!.redo();
    if (!h) return;
    grid.cells.h = h;
    undo!.disabled = templateUndo.disabled = !heightmapHistory!.canUndo;
    redo!.disabled = templateRedo.disabled = !heightmapHistory!.canRedo;
    mockHeightmap();
    updateStatistics();
    if (document.getElementById("preview")) drawHeightmapPreview();
    if (document.getElementById("canvas3d")) ThreeD.redraw();
  }

  function restartHistory(): void {
    heightmapHistory = new HeightmapEditorHistory();
    redo!.disabled = templateRedo.disabled = true;
    undo!.disabled = templateUndo.disabled = true;
    updateHistory();
  }

  // ─── Brushes panel ───────────────────────────────────────────────────────────

  function openBrushesPanel(): void {
    if ($("#brushesPanel").is(":visible")) return;
    $("#brushesPanel")
      .dialog({
        title: "Paint Brushes",
        resizable: false,
        position: { my: "right top", at: "right-10 top+10", of: "svg" }
      })
      .on("dialogclose", exitBrushMode);

    if (modules.openBrushesPanel) return;
    modules.openBrushesPanel = true;

    ensureEl("brushesButtons").addEventListener("click", (e: Event) => toggleBrushMode(e as MouseEvent));
    ensureEl("cellTypeFilter").addEventListener("change", cellTypeFilterChange);
    ensureEl("undo").addEventListener("click", undoHistory);
    ensureEl("redo").addEventListener("click", redoHistory);
    ensureEl("rescaleShow").addEventListener("click", () => {
      ensureEl("modifyButtons").style.display = "none";
      ensureEl("rescaleSection").style.display = "block";
    });
    ensureEl("rescaleHide").addEventListener("click", () => {
      ensureEl("modifyButtons").style.display = "block";
      ensureEl("rescaleSection").style.display = "none";
    });
    ensureEl("rescaler").addEventListener("change", (e: Event) =>
      rescale((e.target as HTMLInputElement).valueAsNumber)
    );
    ensureEl("rescaleCondShow").addEventListener("click", () => {
      ensureEl("modifyButtons").style.display = "none";
      ensureEl("rescaleCondSection").style.display = "block";
    });
    ensureEl("rescaleCondHide").addEventListener("click", () => {
      ensureEl("modifyButtons").style.display = "block";
      ensureEl("rescaleCondSection").style.display = "none";
    });
    ensureEl("rescaleExecute").addEventListener("click", rescaleWithCondition);
    ensureEl("smoothHeights").addEventListener("click", smoothAllHeights);
    ensureEl("disruptHeights").addEventListener("click", disruptAllHeights);
    ensureEl("brushClear").addEventListener("click", startFromScratch);

    function exitBrushMode(): void {
      const pressed = document.querySelector<HTMLElement>("#brushesButtons > button.pressed");
      if (pressed) pressed.classList.remove("pressed");
      viewbox.style("cursor", "default").on(".drag", null).on("click", clicked);
      debug.selectAll(".lineCircle").remove();
      removeCircle();
      ensureEl("brushesSliders").style.display = "none";
      ensureEl("lineSlider").style.display = "none";
    }

    function toggleBrushMode(event: MouseEvent): void {
      const button = (event.target as HTMLElement).closest<HTMLElement>("#brushesButtons > button");
      if (!button) return;
      if (button.classList.contains("pressed")) {
        exitBrushMode();
        return;
      }
      exitBrushMode();
      button.classList.add("pressed");
      toggleFillBrushUi(button.id === "brushFill");

      if (button.id === "brushLine") {
        ensureEl("lineSlider").style.display = "block";
        viewbox.style("cursor", "crosshair").on("click", placeLinearFeature);
      } else if (button.id === "brushFill") {
        ensureEl("brushesSliders").style.display = "block";
        viewbox.style("cursor", "crosshair").on("click", applyFillBrush);
      } else {
        ensureEl("brushesSliders").style.display = "block";
        viewbox
          .style("cursor", "crosshair")
          .call(
            d3
              .drag<SVGGElement, unknown>()
              .on("start", dragBrushStart)
              .on("drag", dragBrushDrag)
              .on("end", updateHeightmap)
          );
      }
    }

    function toggleFillBrushUi(isFillBrush: boolean): void {
      const radiusRow = ensureEl("heightmapBrushRadius").parentElement;
      if (radiusRow) radiusRow.style.display = isFillBrush ? "none" : "";
    }

    function placeLinearFeature(this: SVGElement, event: MouseEvent): void {
      const [x, y] = pointer(event, this);
      const toCell = findGridCell(x, y, grid);

      const lineCircle = debug.selectAll(".lineCircle");
      if (!lineCircle.size()) {
        debug.append("line").attr("id", "brushCircle").attr("x1", x).attr("y1", y).attr("x2", x).attr("y2", y);
        debug
          .append("circle")
          .attr("data-cell", toCell)
          .attr("class", "lineCircle")
          .attr("r", 6)
          .attr("cx", x)
          .attr("cy", y)
          .attr("fill", "yellow")
          .attr("stroke", "#333")
          .attr("stroke-width", 2);
        return;
      }

      const fromCell = +lineCircle.attr("data-cell");
      debug.selectAll("*").remove();
      const power = (heightmapLinePower as HTMLInputElement).valueAsNumber;
      if (power === 0) {
        tip("Power should not be zero", false, "error");
        return;
      }

      const heights = grid.cells.h as Uint8Array;
      const operation =
        power > 0
          ? HeightmapGenerator.addRange.bind(HeightmapGenerator)
          : HeightmapGenerator.addTrough.bind(HeightmapGenerator);
      HeightmapGenerator.setGraph(grid);
      operation("1", String(Math.abs(power)), "", "", fromCell, toCell);
      const changedHeights = HeightmapGenerator.getHeights() as Uint8Array;

      const selection: number[] = [];
      for (let i = 0; i < heights.length; i++) {
        if (changedHeights[i] === heights[i]) continue;
        if ((cellTypeFilter as HTMLSelectElement).value === "land" && heights[i] < 20) continue;
        if ((cellTypeFilter as HTMLSelectElement).value === "water" && heights[i] >= 20) continue;
        heights[i] = changedHeights[i];
        selection.push(i);
      }
      mockHeightmapSelection(selection);
      updateHistory();
    }

    function applyFillBrush(this: SVGElement, event: MouseEvent): void {
      const [x, y] = pointer(event, this);
      const start = findGridCell(x, y, grid);
      const startHeight = grid.cells.h[start];
      const isWaterFill = startHeight < 20;
      const MIN_FILL_CELLS = 3;

      if ((cellTypeFilter as HTMLSelectElement).value === "water") {
        tip("Fill brush is not available with 'only water cells' filter", false, "error");
        return;
      }
      if ((cellTypeFilter as HTMLSelectElement).value === "land" && isWaterFill) {
        tip("Land filter is active, water areas cannot be filled", false, "error");
        return;
      }

      const { selection, reachedBorder } = collectFillSelection(start, isWaterFill, startHeight);
      if (selection.length < MIN_FILL_CELLS) {
        tip("No enclosed area found to fill", false, "error");
        return;
      }
      if (isWaterFill && reachedBorder) {
        tip("Selected water area is open to map border and is not enclosed", false, "error");
        return;
      }

      const changed = applyConeToSelection(selection, isWaterFill, startHeight);
      if (!changed.length) return;
      mockHeightmapSelection(changed);
      updateHeightmap();
    }

    function collectFillSelection(
      start: number,
      isWaterFill: boolean,
      targetHeight: number
    ): { selection: number[]; reachedBorder: boolean } {
      const { h: heights, c: neighbors, i: cells } = grid.cells;
      const visited = new Uint8Array(cells.length);
      const stack = [start];
      const selection: number[] = [];
      let reachedBorder = false;

      while (stack.length) {
        const cell = stack.pop()!;
        if (visited[cell]) continue;
        visited[cell] = 1;
        if (!matchesFillTarget(heights[cell], isWaterFill, targetHeight)) continue;
        selection.push(cell);
        if (grid.cells.b[cell]) reachedBorder = true;
        (neighbors[cell] as number[]).forEach((next: number) => {
          if (!visited[next]) stack.push(next);
        });
      }
      return { selection, reachedBorder };
    }

    function matchesFillTarget(height: number, isWaterFill: boolean, targetHeight: number): boolean {
      return isWaterFill ? height < 20 : height === targetHeight;
    }

    function applyConeToSelection(selection: number[], isWaterFill: boolean, targetHeight: number): number[] {
      const power = (heightmapBrushPower as HTMLInputElement).valueAsNumber * 10;
      const { h: heights, c: neighbors, i: cells } = grid.cells;
      const inSelection = new Uint8Array(cells.length);
      const edgeDistance = new Uint16Array(cells.length);
      const changed: number[] = [];

      selection.forEach(cell => {
        inSelection[cell] = 1;
      });

      const queue: number[] = [];
      let head = 0;
      selection.forEach(cell => {
        const isEdgeCell = (neighbors[cell] as number[]).some((next: number) => !inSelection[next]);
        if (!isEdgeCell) return;
        inSelection[cell] = 2;
        queue.push(cell);
      });

      while (head < queue.length) {
        const cell = queue[head++];
        const nextDistance = edgeDistance[cell] + 1;
        (neighbors[cell] as number[]).forEach((next: number) => {
          if (inSelection[next] !== 1) return;
          inSelection[next] = 2;
          edgeDistance[next] = nextDistance;
          queue.push(next);
        });
      }

      const maxDist = max(selection, cell => edgeDistance[cell]) ?? 0;
      const baseHeight = isWaterFill ? 20 : targetHeight;

      selection.forEach(cell => {
        const ratio = maxDist ? edgeDistance[cell] / maxDist : 1;
        const rise = Math.max(1, Math.round(power * ratio));
        const nextHeight = minmax(baseHeight + rise, 0, 100);
        if (nextHeight === heights[cell]) return;
        heights[cell] = nextHeight;
        changed.push(cell);
      });
      return changed;
    }

    let _hbStart = 0;

    function dragBrushStart(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
      const [x, y] = pointer(event, this);
      _hbStart = findGridCell(x, y, grid);
    }

    function dragBrushDrag(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
      const r = (heightmapBrushRadius as HTMLInputElement).valueAsNumber;
      const p = pointer(event, this);
      moveCircle(p[0], p[1], r);
      if (~~event.sourceEvent.timeStamp % 5 !== 0) return;
      const inRadius = findGridAll(p[0], p[1], r);
      let sel = inRadius;
      if ((cellTypeFilter as HTMLSelectElement).value === "land") sel = inRadius.filter(i => grid.cells.h[i] >= 20);
      else if ((cellTypeFilter as HTMLSelectElement).value === "water")
        sel = inRadius.filter(i => grid.cells.h[i] < 20);
      if (sel?.length) changeHeightForSelection(sel, _hbStart);
    }

    function changeHeightForSelection(selection: number[], start: number): void {
      const power = (heightmapBrushPower as HTMLInputElement).valueAsNumber;
      const interp = interpolateRound(power, 1);
      const land = (cellTypeFilter as HTMLSelectElement).value === "land";
      const ocean = (cellTypeFilter as HTMLSelectElement).value === "water";
      const lim = (v: number) => minmax(v, land ? 20 : 0, ocean ? 19 : 100);
      const heights = grid.cells.h as Uint8Array;
      const brush = document.querySelector<HTMLElement>("#brushesButtons > button.pressed")!.id;

      if (brush === "brushRaise")
        selection.forEach(i => {
          heights[i] = !ocean && heights[i] < 20 ? 20 : lim(heights[i] + power);
        });
      else if (brush === "brushElevate")
        selection.forEach((i, d) => {
          heights[i] = lim(heights[i] + interp(d / Math.max(selection.length - 1, 1)));
        });
      else if (brush === "brushLower")
        selection.forEach(i => {
          heights[i] = lim(heights[i] - power);
        });
      else if (brush === "brushDepress")
        selection.forEach((i, d) => {
          heights[i] = lim(heights[i] - interp(d / Math.max(selection.length - 1, 1)));
        });
      else if (brush === "brushAlign")
        selection.forEach(i => {
          heights[i] = lim(heights[start]);
        });
      else if (brush === "brushSmooth")
        selection.forEach(i => {
          heights[i] = rn(
            ((mean(
              (grid.cells.c[i] as number[])
                .filter(c => (land ? heights[c] >= 20 : ocean ? heights[c] < 20 : true))
                .map(c => heights[c])
            ) ?? heights[i]) +
              heights[i] * (10 - power) +
              0.6) /
              (11 - power),
            1
          );
        });
      else if (brush === "brushDisrupt")
        selection.forEach(i => {
          heights[i] = heights[i] < 15 ? heights[i] : lim(heights[i] + power / 1.6 - Math.random() * power);
        });

      mockHeightmapSelection(selection);
    }

    function cellTypeFilterChange(): void {
      if ((cellTypeFilter as HTMLSelectElement).value === "land" && heightmapEditMode.innerHTML === "keep") {
        tip("You cannot change the coastline in 'Keep' edit mode", false, "error");
        (cellTypeFilter as HTMLSelectElement).value = "all";
      }
    }

    function rescale(v: number): void {
      const land = (cellTypeFilter as HTMLSelectElement).value === "land";
      const ocean = (cellTypeFilter as HTMLSelectElement).value === "water";
      const lim = (val: number) => minmax(val, 0, 100);
      grid.cells.h = (grid.cells.h as Uint8Array).map(h => {
        if (land && (h < 20 || h + v < 20)) return h;
        if (ocean && h >= 20) return h;
        const newH = lim(h + v);
        return ocean ? Math.min(newH, 19) : newH;
      });
      updateHeightmap();
      (ensureEl("rescaler") as HTMLInputElement).value = "0";
    }

    function rescaleWithCondition(): void {
      const range_ = `${(rescaleLower as HTMLInputElement).value}-${(rescaleHigher as HTMLInputElement).value}`;
      const operator = (conditionSign as HTMLSelectElement).value;
      const operand = (rescaleModifier as HTMLInputElement).valueAsNumber;
      if (Number.isNaN(operand)) {
        tip("Operand should be a number", false, "error");
        return;
      }
      if ((operator === "add" || operator === "subtract") && !Number.isInteger(operand)) {
        tip("Operand should be an integer", false, "error");
        return;
      }

      HeightmapGenerator.setGraph(grid);
      if (operator === "multiply") HeightmapGenerator.modify(range_, 0, operand, 0);
      else if (operator === "divide") HeightmapGenerator.modify(range_, 0, 1 / operand, 0);
      else if (operator === "add") HeightmapGenerator.modify(range_, operand, 1, 0);
      else if (operator === "subtract") HeightmapGenerator.modify(range_, -1 * operand, 1, 0);
      else if (operator === "exponent") HeightmapGenerator.modify(range_, 0, 1, operand);

      grid.cells.h = HeightmapGenerator.getHeights()!;
      updateHeightmap();
    }

    function smoothAllHeights(): void {
      HeightmapGenerator.setGraph(grid);
      HeightmapGenerator.smooth(4, 1.5);
      grid.cells.h = HeightmapGenerator.getHeights()!;
      updateHeightmap();
    }

    function disruptAllHeights(): void {
      grid.cells.h = (grid.cells.h as Uint8Array).map(h => (h < 15 ? h : minmax(h + 2.5 - Math.random() * 4, 0, 100)));
      updateHeightmap();
    }

    function startFromScratch(): void {
      if ((cellTypeFilter as HTMLSelectElement).value === "land") {
        tip("Not allowed when 'only land cells' filter is set", false, "error");
        return;
      }
      if ((cellTypeFilter as HTMLSelectElement).value === "water") {
        tip("Not allowed when 'only water cells' filter is set", false, "error");
        return;
      }
      const someHeights = (grid.cells.h as Uint8Array).some(h => h);
      if (!someHeights) {
        tip("Heightmap is already cleared, please do not click twice if not required", false, "error");
        return;
      }
      grid.cells.h = new Uint8Array(grid.cells.i.length);
      viewbox.select("#heights").selectAll("*").remove();
      updateHistory();
    }
  }

  // ─── Template editor ──────────────────────────────────────────────────────────

  function openTemplateEditor(): void {
    if ($("#templateEditor").is(":visible")) return;
    const $body = ensureEl("templateBody");

    $("#templateEditor").dialog({
      title: "Template Editor",
      minHeight: "auto" as unknown as number,
      width: "fit-content",
      resizable: false,
      position: { my: "right top", at: "right-10 top+10", of: "svg" }
    });

    if (modules.openTemplateEditor) return;
    modules.openTemplateEditor = true;

    $("#templateBody").sortable({
      items: "> div",
      handle: ".icon-resize-vertical",
      containment: "#templateBody",
      axis: "y"
    });

    $body.addEventListener("click", (ev: MouseEvent) => {
      const el = ev.target as HTMLElement;
      if (el.classList.contains("icon-check")) {
        el.classList.replace("icon-check", "icon-check-empty");
        el.parentElement!.style.opacity = "0.5";
        $body.dataset.changed = "1";
        return;
      }
      if (el.classList.contains("icon-check-empty")) {
        el.classList.replace("icon-check-empty", "icon-check");
        el.parentElement!.style.opacity = "1";
        return;
      }
      if (el.classList.contains("icon-trash-empty")) {
        el.parentElement!.remove();
        return;
      }
    });

    ensureEl("templateEditor").addEventListener("keypress", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        executeTemplate();
      }
    });

    ensureEl("templateTools").addEventListener("click", addStepOnClick);
    ensureEl("templateSelect").addEventListener("change", selectTemplate);
    ensureEl("templateRun").addEventListener("click", executeTemplate);
    ensureEl("templateSave").addEventListener("click", downloadTemplate);
    ensureEl("templateLoad").addEventListener("click", () => (templateToLoad as HTMLInputElement).click());
    ensureEl("templateToLoad").addEventListener("change", function (this: HTMLInputElement) {
      uploadFile(this, uploadTemplate);
    });

    function addStepOnClick(e: Event): void {
      const target = e.target as HTMLElement;
      if (target.tagName !== "BUTTON") return;
      const type = target.dataset.type!;
      ensureEl("templateBody").dataset.changed = "1";
      addStep(type);
    }

    function addStep(type: string, count?: string, dist?: string, arg4?: string, arg5?: string): void {
      const body = ensureEl("templateBody");
      body.insertAdjacentHTML("beforeend", getStepHTML(type, count, dist, arg4, arg5));

      const $elDist = body.querySelector<HTMLSelectElement>("div:last-child > span > .templateDist");
      if ($elDist) $elDist.addEventListener("change", setRange);

      if (dist && $elDist && $elDist.tagName === "SELECT") {
        for (const option of Array.from($elDist.options)) {
          if (option.value === dist) $elDist.value = dist;
        }
        if ($elDist.value !== dist) {
          const opt = document.createElement("option");
          opt.value = opt.innerHTML = dist;
          $elDist.add(opt);
          $elDist.value = dist;
        }
      }
    }

    function getStepHTML(type: string, count?: string, arg3?: string, arg4?: string, arg5?: string): string {
      const Trash = `<i class="icon-trash-empty pointer" data-tip="Click to remove the step"></i>`;
      const Hide = `<div class="icon-check" data-tip="Click to skip the step"></div>`;
      const Reorder = `<i class="icon-resize-vertical" data-tip="Drag to reorder"></i>`;
      const common = `<div data-type="${type}">${Hide}<div style="width:4em">${type}</div>${Trash}${Reorder}`;

      const TempY = `<span>y:<input class="templateY" data-tip="Placement range percentage along Y axis (minY-maxY)" value=${arg5 || "20-80"} /></span>`;
      const TempX = `<span>x:<input class="templateX" data-tip="Placement range percentage along X axis (minX-maxX)" value=${arg4 || "15-85"} /></span>`;
      const Height = `<span>h:<input class="templateHeight" data-tip="Blob maximum height, use hyphen to get a random number in range" value=${arg3 || "40-50"} /></span>`;
      const Count = `<span>n:<input class="templateCount" data-tip="Blobs to add, use hyphen to get a random number in range" value=${count || "1-2"} /></span>`;

      if (["Hill", "Pit", "Range", "Trough"].includes(type)) return `${common}${TempY}${TempX}${Height}${Count}</div>`;
      if (type === "Strait")
        return `${common}<span>d:<select class="templateDist" data-tip="Strait direction"><option value="vertical" selected>vertical</option><option value="horizontal">horizontal</option></select></span><span>w:<input class="templateCount" data-tip="Strait width, use hyphen to get a random number in range" value=${count || "2-7"} /></span></div>`;
      if (type === "Invert")
        return `${common}<span>by:<select class="templateDist" data-tip="Mirror heightmap along axis" style="width: 7.8em"><option value="x" selected>x</option><option value="y">y</option><option value="xy">both</option></select></span><span>n:<input class="templateCount" data-tip="Probability of inversion, range 0-1" value=${count || "0.5"} /></span></div>`;
      if (type === "Mask")
        return `${common}<span>f:<input class="templateCount" data-tip="Set masking fraction. 1 - full insulation (prevent land on map edges), 2 - half-insulation, etc. Negative number to inverse the effect" type="number" min=-10 max=10 value=${count || 1} /></span></div>`;
      if (type === "Add")
        return `${common}<span>to:<select class="templateDist" data-tip="Change only land or all cells"><option value="all" selected>all cells</option><option value="land">land only</option><option value="interval">interval</option></select></span><span>v:<input class="templateCount" data-tip="Add value to height of all cells (negative values are allowed)" type="number" value=${count || -10} min=-100 max=100 step=1 /></span></div>`;
      if (type === "Multiply")
        return `${common}<span>to:<select class="templateDist" data-tip="Change only land or all cells"><option value="all" selected>all cells</option><option value="land">land only</option><option value="interval">interval</option></select></span><span>v:<input class="templateCount" data-tip="Multiply all cells Height by the value" type="number" value=${count || 1.1} min=0 max=10 step=.1 /></span></div>`;
      if (type === "Smooth")
        return `${common}<span>f:<input class="templateCount" data-tip="Set smooth fraction. 1 - full smooth, 2 - half-smooth, etc." type="number" min=1 max=10 step=1 value=${count || 2} /></span></div>`;
      return `${common}</div>`;
    }

    function setRange(event: Event): void {
      const target = event.target as HTMLSelectElement;
      if (target.value !== "interval") return;
      showPrompt("Set a height interval. Avoid space, use hyphen as a separator", { default: "17-20" }, value => {
        const v = String(value);
        const opt = document.createElement("option");
        opt.value = opt.innerHTML = v;
        target.add(opt);
        target.value = v;
      });
    }

    function selectTemplate(e: Event): void {
      const body = ensureEl("templateBody");
      const steps = body.querySelectorAll("div").length;
      const changed = +body.getAttribute("data-changed")!;
      const template = (e.target as HTMLSelectElement).value;
      if (!steps || !changed) {
        changeTemplate(template);
        return;
      }

      alertMessage.innerHTML = "Are you sure you want to select a different template? All changes will be lost.";
      $("#alert").dialog({
        resizable: false,
        title: "Change Template",
        buttons: {
          Change: function (this: Element) {
            changeTemplate(template);
            $(this).dialog("close");
          },
          Cancel: function (this: Element) {
            $(this).dialog("close");
          }
        }
      });
    }

    function changeTemplate(template: string): void {
      const body = ensureEl("templateBody");
      body.setAttribute("data-changed", "0");
      body.innerHTML = "";
      const templateString = heightmapTemplates[template]?.template as string | undefined;
      if (!templateString) return;
      const steps = templateString.split("\n");
      if (!steps.length) {
        tip("Heightmap template: no steps defined", false, "error");
        return;
      }
      for (const step of steps) {
        const elements = step.trim().split(" ");
        addStep(elements[0], elements[1], elements[2], elements[3], elements[4]);
      }
    }

    function executeTemplate(): void {
      const steps = ensureEl("templateBody").querySelectorAll<HTMLElement>("#templateBody > div");
      if (!steps.length) return;

      const currentSeed = (ensureEl("templateSeed") as HTMLInputElement).value;
      const seed = (locked("templateSeed") && currentSeed) || generateSeed();
      Math.random = aleaPRNG(seed);
      (ensureEl("templateSeed") as HTMLInputElement).value = seed;

      grid.cells.h = createTypedArray({ maxValue: 100, length: grid.points.length });
      HeightmapGenerator.setGraph(grid);
      restartHistory();

      for (const step of Array.from(steps)) {
        if (step.style.opacity === "0.5") continue;
        const count = step.querySelector<HTMLInputElement>(".templateCount")?.value || "";
        const height = step.querySelector<HTMLInputElement>(".templateHeight")?.value || "";
        const dist = step.querySelector<HTMLInputElement>(".templateDist")?.value || "";
        const x = step.querySelector<HTMLInputElement>(".templateX")?.value || "";
        const y = step.querySelector<HTMLInputElement>(".templateY")?.value || "";
        const type = step.dataset.type;

        if (type === "Hill") HeightmapGenerator.addHill(count, height, x, y);
        else if (type === "Pit") HeightmapGenerator.addPit(count, height, x, y);
        else if (type === "Range") HeightmapGenerator.addRange(count, height, x, y);
        else if (type === "Trough") HeightmapGenerator.addTrough(count, height, x, y);
        else if (type === "Strait") HeightmapGenerator.addStrait(count, dist);
        else if (type === "Mask") HeightmapGenerator.mask(+count!);
        else if (type === "Invert") HeightmapGenerator.invert(+count!, dist);
        else if (type === "Add") HeightmapGenerator.modify(dist, +count!, 1);
        else if (type === "Multiply") HeightmapGenerator.modify(dist, 0, +count!);
        else if (type === "Smooth") HeightmapGenerator.smooth(+count!);

        grid.cells.h = HeightmapGenerator.getHeights()!;
        updateHistory("noStat");
      }

      grid.cells.h = HeightmapGenerator.getHeights()!;
      updateStatistics();
      mockHeightmap();
      if (document.getElementById("preview")) drawHeightmapPreview();
      if (document.getElementById("canvas3d")) ThreeD.redraw();
    }

    function downloadTemplate(): void {
      const body = ensureEl("templateBody");
      (body as HTMLElement).dataset.changed = "0";
      const steps = body.querySelectorAll<HTMLElement>("#templateBody > div");
      if (!steps.length) return;

      let data = "";
      for (const s of Array.from(steps)) {
        if (s.style.opacity === "0.5") continue;
        const type = s.getAttribute("data-type");
        const count = s.querySelector<HTMLInputElement>(".templateCount")?.value || "0";
        const arg3 =
          s.querySelector<HTMLInputElement>(".templateHeight")?.value ||
          s.querySelector<HTMLInputElement>(".templateDist")?.value ||
          "0";
        const x = s.querySelector<HTMLInputElement>(".templateX")?.value || "0";
        const y = s.querySelector<HTMLInputElement>(".templateY")?.value || "0";
        data += `${type} ${count} ${arg3} ${x} ${y}\r\n`;
      }
      downloadFile(data, `template_${Date.now()}.txt`);
    }

    function uploadTemplate(dataLoaded: string): void {
      const steps = dataLoaded.split("\r\n");
      if (!steps.length) {
        tip("Cannot parse the template, please check the file", false, "error");
        return;
      }
      (templateBody as HTMLElement).innerHTML = "";
      for (const s of steps) {
        const step = s.split(" ");
        if (step.length !== 5) {
          ERROR && console.error("Cannot parse step, wrong arguments count", s);
          continue;
        }
        addStep(step[0], step[1], step[2], step[3], step[4]);
      }
    }
  }

  // ─── Image converter ──────────────────────────────────────────────────────────

  function openImageConverter(): void {
    if ($("#imageConverter").is(":visible")) return;
    const color = getColorScheme(null);
    (imageToLoad as HTMLInputElement).click();
    closeDialogs("#imageConverter");

    $("#imageConverter").dialog({
      title: "Image Converter",
      maxHeight: svgHeight * 0.8,
      minHeight: "auto" as unknown as number,
      width: "20em",
      position: { my: "right top", at: "right-10 top+10", of: "svg" },
      beforeClose: closeImageConverter
    });

    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    canvas.width = graphWidth;
    canvas.height = graphHeight;
    document.body.insertBefore(canvas, optionsContainer);

    setOverlayOpacity(0);
    clearMainTip();
    tip("Image Converter is opened. Upload image and assign height value for each color", false, "warn");

    grid.cells.h = new Uint8Array(grid.cells.i.length);
    viewbox.select("#heights").selectAll("*").remove();
    updateHistory();

    if (modules.openImageConverter) return;
    modules.openImageConverter = true;

    select("#imageConverterPalette")
      .selectAll("div")
      .data(range(101))
      .enter()
      .append("div")
      .attr("data-color", (i: number) => i)
      .style("background-color", (i: number) => color(1 - (i < 20 ? i - 5 : i) / 100))
      .style("width", (i: number) => (i < 40 || i > 68 ? ".2em" : ".1em"))
      .on("touchmove mousemove", showPalleteHeight)
      .on("click", assignHeight);

    ensureEl("convertImageLoad").addEventListener("click", () => (imageToLoad as HTMLInputElement).click());
    ensureEl("imageToLoad").addEventListener("change", loadImage);
    ensureEl("convertAutoLum").addEventListener("click", () => autoAssing("lum"));
    ensureEl("convertAutoHue").addEventListener("click", () => autoAssing("hue"));
    ensureEl("convertAutoFMG").addEventListener("click", () => autoAssing("scheme"));
    ensureEl("convertColorsButton").addEventListener("click", setConvertColorsNumber);
    ensureEl("convertComplete").addEventListener("click", applyConversion);
    ensureEl("convertCancel").addEventListener("click", cancelConversion);
    ensureEl("convertOverlay").addEventListener("input", function (this: HTMLInputElement) {
      setOverlayOpacity(+this.value);
    });
    ensureEl("convertOverlayNumber").addEventListener("input", function (this: HTMLInputElement) {
      setOverlayOpacity(+this.value);
    });

    function showPalleteHeight(this: HTMLElement): void {
      const height = +this.getAttribute("data-color")!;
      (colorsSelectValue as HTMLElement).innerHTML = String(height);
      (colorsSelectFriendly as HTMLElement).innerHTML = getHeight(height);
      const former = (imageConverterPalette as HTMLElement).querySelector<HTMLElement>(".hoveredColor");
      if (former) former.className = "";
      this.className = "hoveredColor";
    }

    function loadImage(this: HTMLInputElement): void {
      const file = this.files![0];
      this.value = "";
      const reader = new FileReader();
      const img = new Image();
      img.id = "imageToConvert";
      img.style.display = "none";
      document.body.appendChild(img);
      img.onload = () => {
        const ctx = (ensureEl("canvas") as HTMLCanvasElement).getContext("2d")!;
        ctx.drawImage(img, 0, 0, graphWidth, graphHeight);
        heightsFromImage(+(convertColors as HTMLInputElement).value);
        resetZoom();
      };
      reader.onloadend = () => (img.src = reader.result as string);
      reader.readAsDataURL(file);
    }

    function heightsFromImage(count: number): void {
      const sourceImage = ensureEl("canvas") as HTMLCanvasElement;
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = grid.cellsX;
      sampleCanvas.height = grid.cellsY;
      sampleCanvas.getContext("2d")!.drawImage(sourceImage, 0, 0, grid.cellsX, grid.cellsY);

      const q = new RgbQuant({ colors: count });
      q.sample(sampleCanvas);
      const data = q.reduce(sampleCanvas);
      const pallete = q.palette(true);

      viewbox.select("#heights").selectAll("*").remove();
      select("#imageConverter").selectAll("div.color-div").remove();
      (colorsSelect as HTMLElement).style.display = "block";
      (colorsUnassigned as HTMLElement).style.display = "block";
      (colorsAssigned as HTMLElement).style.display = "none";
      sampleCanvas.remove();

      viewbox
        .select<SVGGElement>("#heights")
        .selectAll<SVGPolygonElement, number>("polygon")
        .data(Array.from(grid.cells.i))
        .join("polygon")
        .attr("points", d => getGridPolygon(d).join(" "))
        .attr("id", d => `cell${d}`)
        .attr("fill", d => `rgb(${data[d * 4]}, ${data[d * 4 + 1]}, ${data[d * 4 + 2]})`)
        .on("click", mapClicked);

      const palleteParsed = pallete as [number, number, number][];
      const colors = palleteParsed.map(p => `rgb(${p[0]}, ${p[1]}, ${p[2]})`);
      select("#colorsUnassignedContainer")
        .selectAll("div")
        .data(colors)
        .enter()
        .append("div")
        .attr("data-color", (i: string) => i)
        .style("background-color", (i: string) => i)
        .attr("class", "color-div")
        .on("click", colorClicked);

      (ensureEl("colorsUnassignedNumber") as HTMLElement).innerHTML = String(colors.length);
    }

    function mapClicked(this: SVGElement): void {
      const fill = this.getAttribute("fill");
      const palleteColor = (imageConverter as HTMLElement).querySelector<HTMLElement>(`div[data-color="${fill}"]`);
      palleteColor?.click();
    }

    function colorClicked(this: HTMLElement): void {
      viewbox.select("#heights").selectAll(".selectedCell").attr("class", null);
      const unselect = this.classList.contains("selectedColor");
      const selectedColor = (imageConverter as HTMLElement).querySelector<HTMLElement>("div.selectedColor");
      if (selectedColor) selectedColor.classList.remove("selectedColor");
      const hoveredColor = (imageConverterPalette as HTMLElement).querySelector<HTMLElement>("div.hoveredColor");
      if (hoveredColor) hoveredColor.classList.remove("hoveredColor");
      (colorsSelectValue as HTMLElement).innerHTML = (colorsSelectFriendly as HTMLElement).innerHTML = "0";
      if (unselect) return;
      this.classList.add("selectedColor");
      if (this.dataset.height) {
        const h = +this.dataset.height;
        (imageConverterPalette as HTMLElement)
          .querySelector<HTMLElement>(`div[data-color="${h}"]`)
          ?.classList.add("hoveredColor");
        (colorsSelectValue as HTMLElement).innerHTML = String(h);
        (colorsSelectFriendly as HTMLElement).innerHTML = getHeight(h);
      }
      const clr = this.getAttribute("data-color");
      viewbox.select("#heights").selectAll("polygon.selectedCell").classed("selectedCell", false);
      viewbox.select("#heights").selectAll(`polygon[fill='${clr}']`).classed("selectedCell", true);
    }

    function assignHeight(this: HTMLElement): void {
      const height = +this.dataset.color!;
      const rgb = color(1 - (height < 20 ? height - 5 : height) / 100);
      const selectedColor = (imageConverter as HTMLElement).querySelector<HTMLElement>("div.selectedColor")!;
      selectedColor.style.backgroundColor = rgb;
      selectedColor.setAttribute("data-color", rgb);
      selectedColor.setAttribute("data-height", String(height));

      viewbox
        .select("#heights")
        .selectAll<SVGElement, unknown>(".selectedCell")
        .each(function () {
          this.setAttribute("fill", rgb);
          this.setAttribute("data-height", String(height));
        });

      if (selectedColor.parentElement?.id === "colorsUnassignedContainer") {
        (colorsAssignedContainer as HTMLElement).appendChild(selectedColor);
        (colorsAssigned as HTMLElement).style.display = "block";
        (ensureEl("colorsUnassignedNumber") as HTMLElement).innerHTML = String(
          (colorsUnassignedContainer as HTMLElement).childElementCount - 2
        );
        (ensureEl("colorsAssignedNumber") as HTMLElement).innerHTML = String(
          (colorsAssignedContainer as HTMLElement).childElementCount - 2
        );
      }
    }

    function autoAssing(type: string): void {
      let unassigned = (colorsUnassignedContainer as HTMLElement).querySelectorAll<HTMLElement>("div");
      if (!unassigned.length) {
        heightsFromImage(+(convertColors as HTMLInputElement).value);
        unassigned = (colorsUnassignedContainer as HTMLElement).querySelectorAll<HTMLElement>("div");
        if (!unassigned.length) {
          tip("No unassigned colors. Please load an image and click the button again", false, "error");
          return;
        }
      }

      const getHeightByHue = (clr: string) => {
        let hue = hsl(clr).h;
        if (hue > 300) hue -= 360;
        if (hue > 170) return (Math.abs(hue - 250) / 3) | 0;
        return (Math.abs(hue - 250 + 20) / 3) | 0;
      };

      const getHeightByLum = (clr: string) => {
        const lum = lab(clr).l ?? 0;
        if (lum < 13) return ((lum / 13) * 20) | 0;
        return lum | 0;
      };

      const scheme = range(101).map(i => getColor(i));
      const hues = scheme.map(rgb => hsl(rgb).h | 0);
      const getHeightByScheme = (clr: string) => {
        const h = scheme.indexOf(clr);
        if (h !== -1) return h;
        const hue = hsl(clr).h;
        const closest = hues.reduce((prev, curr) => (Math.abs(curr - hue) < Math.abs(prev - hue) ? curr : prev));
        return hues.indexOf(closest);
      };

      const assinged: boolean[] = [];
      unassigned.forEach(el => {
        const clr = el.dataset.color!;
        const h = type === "hue" ? getHeightByHue(clr) : type === "lum" ? getHeightByLum(clr) : getHeightByScheme(clr);
        const colorTo = color(1 - (h < 20 ? (h - 5) / 100 : h / 100));
        viewbox.select("#heights").selectAll(`polygon[fill='${clr}']`).attr("fill", colorTo).attr("data-height", h);

        if (assinged[h]) {
          el.remove();
          return;
        }
        el.style.backgroundColor = el.dataset.color = colorTo;
        el.dataset.height = String(h);
        (colorsAssignedContainer as HTMLElement).appendChild(el);
        assinged[h] = true;
      });

      Array.from((colorsAssignedContainer as HTMLElement).children)
        .sort((a, b) => +(a as HTMLElement).dataset.height! - +(b as HTMLElement).dataset.height!)
        .forEach(line => {
          (colorsAssignedContainer as HTMLElement).appendChild(line);
        });

      (colorsAssigned as HTMLElement).style.display = "block";
      (colorsUnassigned as HTMLElement).style.display = "none";
      (ensureEl("colorsAssignedNumber") as HTMLElement).innerHTML = String(
        (colorsAssignedContainer as HTMLElement).childElementCount - 2
      );
    }

    function setConvertColorsNumber(): void {
      showPrompt(
        `Please set maximum number of colors. <br>An actual number is usually lower and depends on color scheme`,
        { default: +(convertColors as HTMLInputElement).value, step: 1, min: 3, max: 255 },
        value => {
          const number = +value;
          (convertColors as HTMLInputElement).value = String(number);
          heightsFromImage(number);
        }
      );
    }

    function setOverlayOpacity(v: number): void {
      (convertOverlay as HTMLInputElement).value = (convertOverlayNumber as HTMLInputElement).value = String(v);
      (ensureEl("canvas") as HTMLCanvasElement).style.opacity = String(v);
    }

    function applyConversion(): void {
      if ((colorsAssignedContainer as HTMLElement).childElementCount < 3) {
        tip("Please assign colors to heights first", false, "error");
        return;
      }
      viewbox
        .select("#heights")
        .selectAll<SVGElement, unknown>("polygon")
        .each(function () {
          const h = +(this as SVGElement).dataset.height! || 0;
          const i = +(this as SVGElement).id.slice(4);
          grid.cells.h[i] = h;
        });
      viewbox.select("#heights").selectAll("polygon").remove();
      updateHeightmap();
      restoreImageConverterState();
    }

    function cancelConversion(): void {
      restoreImageConverterState();
      viewbox.select("#heights").selectAll("polygon").remove();
      undoHistory();
    }

    function restoreImageConverterState(): void {
      const cnv = document.getElementById("canvas");
      if (cnv) cnv.remove();
      const img = document.getElementById("imageToConvert");
      if (img) img.remove();
      select("#imageConverter").selectAll("div.color-div").remove();
      (colorsAssigned as HTMLElement).style.display = "none";
      (colorsUnassigned as HTMLElement).style.display = "none";
      (colorsSelectValue as HTMLElement).innerHTML = (colorsSelectFriendly as HTMLElement).innerHTML = "0";
      viewbox.style("cursor", "default").on(".drag", null);
      tip('Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap', true);
      $("#imageConverter").dialog("destroy");
      openBrushesPanel();
    }

    function closeImageConverter(event: Event): void {
      event.preventDefault();
      event.stopPropagation();
      alertMessage.innerHTML = `Are you sure you want to close the Image Converter? Click "Cancel" to keep editing. Click "Complete" to apply the conversion and close the tool. Click "Close" to discard the conversion and restore the previous heightmap.`;
      $("#alert").dialog({
        resizable: false,
        title: "Close Image Converter",
        buttons: {
          Cancel: function (this: Element) {
            $(this).dialog("close");
          },
          Complete: function (this: Element) {
            $(this).dialog("close");
            applyConversion();
          },
          Close: function (this: Element) {
            $(this).dialog("close");
            restoreImageConverterState();
            viewbox.select("#heights").selectAll("polygon").remove();
            undoHistory();
          }
        }
      });
    }
  }

  // ─── Heightmap preview ────────────────────────────────────────────────────────

  function toggleHeightmapPreview(): void {
    const existing = document.getElementById("preview");
    if (existing) {
      existing.remove();
      return;
    }
    const preview = document.createElement("canvas");
    preview.id = "preview";
    preview.width = grid.cellsX;
    preview.height = grid.cellsY;
    document.body.insertBefore(preview, optionsContainer);
    preview.addEventListener("mouseover", () => tip("Heightmap preview. Click to download a screen-sized image"));
    preview.addEventListener("click", downloadPreview);
    drawHeightmapPreview();
  }

  function drawHeightmapPreview(): void {
    const canvas = document.getElementById("preview") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(grid.cellsX, grid.cellsY);

    (grid.cells.h as Uint8Array).forEach((height, i) => {
      const h = height < 20 ? Math.max(height / 1.5, 0) : height;
      const v = (h / 100) * 255;
      const n = i * 4;
      imageData.data[n] = v;
      imageData.data[n + 1] = v;
      imageData.data[n + 2] = v;
      imageData.data[n + 3] = 255;
    });
    ctx.putImageData(imageData, 0, 0);
  }

  function downloadPreview(): void {
    const preview = document.getElementById("preview") as HTMLCanvasElement;
    if (!preview) return;
    const dataURL = preview.toDataURL("image/png");
    const img = new Image();
    img.src = dataURL;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = graphWidth;
      canvas.height = graphHeight;
      document.body.insertBefore(canvas, optionsContainer);
      ctx.drawImage(img, 0, 0, graphWidth, graphHeight);
      const imgBig = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${getFileName("Heightmap")}.png`;
      link.href = imgBig;
      link.click();
      canvas.remove();
    };
  }
}

// ─── Global registration ───────────────────────────────────────────────────────
export function initHeightmapEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
