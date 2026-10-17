import { editorHtml, editorOptionText, editorText } from "../../i18n/editorMessages";
import {
  addLandmark,
  addSettlement,
  addSymbol,
  eraseAt,
  paintBiome,
  removeLandmark,
  removeSettlement,
  removeSymbol,
  setCellBorderOpacity,
  setCellBorderOrder,
  setForestDensityThreshold,
  setRiverWidthScale,
  setRouteWidthScale,
  setSettlementIconScale,
  toggleBiomeCells,
  toggleCellBorders,
  toggleContourElevations,
  toggleContours,
  toggleCultivation,
  updateContourInterval,
  updateLandmark,
  updateSettlement
} from "../core/commands";
import { generateStandaloneRegion } from "../core/gen/pipeline";
import { generateVoronoiSandbox, MAX_SANDBOX_CELLS, SANDBOX_BIOMES } from "../core/gen/voronoiSandbox";
import { pointInPolygon } from "../core/geometry";
import { RegionHistory } from "../core/history";
import {
  type BiomeKind,
  DEFAULT_REGION_SETTINGS,
  DEFAULT_RIVER_WIDTH_SCALE,
  DEFAULT_ROUTE_WIDTH_SCALE,
  DEFAULT_SETTLEMENT_ICON_SCALE,
  type IllustratedPalette,
  type Point,
  type RegionDocument,
  type RegionGenerationSettings,
  type RegionSettlement,
  type RegionTheme,
  type SymbolType
} from "../core/types";
import { exportRegionJson, exportRegionSvg, readRegionFile } from "../io/regionEditorFile";
import { clearRegionSite } from "../io/siteStore";
import { DEFAULT_RENDER_QUALITY, type RenderQuality } from "../render/biomeArt";
import { describeCell } from "../render/cellInfo";
import { ILLUSTRATED_PALETTES } from "../render/styles/themes";
import {
  applyTextScale,
  detailForZoom,
  forestMassOfRenderedDoc,
  renderRegionSvg,
  renderStatsOfRenderedDoc
} from "../render/svg";

/** FMG burgs-generator.ts の getDefaultGroups に準拠した都市種別（+ 旧 metropolis） */
function settlementTypeOptions(): ReadonlyArray<readonly [string, string]> {
  return [
    ["capital", editorText("regionEditor.messages.capital")],
    ["metropolis", editorText("regionEditor.messages.metropolis")],
    ["city", editorText("regionEditor.messages.city")],
    ["town", editorText("regionEditor.messages.town")],
    ["fort", editorText("regionEditor.messages.fort")],
    ["monastery", editorText("regionEditor.messages.monastery")],
    ["caravanserai", editorText("regionEditor.messages.caravanserai")],
    ["trading_post", editorText("regionEditor.messages.tradingPost")],
    ["village", editorText("regionEditor.messages.village")],
    ["hamlet", editorText("regionEditor.messages.hamlet")]
  ];
}

export type EditorTool = "select" | "brush" | "stamp" | "settlement" | "landmark" | "erase";

export function mountRegionEditor(
  root: HTMLElement,
  incomingDoc?: RegionDocument | null
): { dispose: () => void; getDocument: () => RegionDocument } {
  const initialDoc: RegionDocument = incomingDoc ?? generateStandaloneRegion(DEFAULT_REGION_SETTINGS);

  const history = new RegionHistory(initialDoc);

  let currentSettings: RegionGenerationSettings = {
    ...DEFAULT_REGION_SETTINGS,
    seed: initialDoc.seed,
    title: initialDoc.title,
    theme: initialDoc.decoration.theme
  };

  let activeTool: EditorTool = "select";
  let brushBiome: BiomeKind = "deciduous_forest";
  let brushRadius = 35;
  let stampType: SymbolType = "mountain_peak_major";

  let selectedId: string | null = null;
  let selectedKind: "settlement" | "landmark" | "symbol" | "route" | "river" | "cell" | null = null;

  // 描画品質（表示のみの設定。文書には保存しない）
  const QUALITY_KEY = "re.renderQuality";
  let quality: RenderQuality = DEFAULT_RENDER_QUALITY;
  try {
    if (localStorage.getItem(QUALITY_KEY) === "high") quality = "high";
  } catch {
    // localStorage が使えない環境ではデフォルトのまま
  }

  // ビューポート状態
  let zoom = 0.85;
  let renderedDetail = -1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let isDraggingTool = false;
  let downClientX = 0;
  let downClientY = 0;
  let startX = 0;
  let startY = 0;

  root.innerHTML = `
    <header class="re-header">
      <div class="re-header-left">
        <span class="re-title">${editorHtml("regionEditor.messages.regionEditor")}</span>
        <span class="re-badge" id="re-scale-badge">${editorHtml("regionEditor.messages.mapDimensionsKilometres", { value0: (history.current.bounds.widthMeters / 1000).toFixed(0), value1: (history.current.bounds.heightMeters / 1000).toFixed(0) })}</span>
      </div>
      <div class="re-actions">
        <button type="button" class="re-btn" id="btn-undo" title="${editorHtml("regionEditor.messages.undoCtrlZ")}">${editorHtml("regionEditor.messages.undo")}</button>
        <button type="button" class="re-btn" id="btn-redo" title="${editorHtml("regionEditor.messages.redoCtrlY")}">${editorHtml("regionEditor.messages.redo")}</button>
        <button type="button" class="re-btn primary" id="btn-regenerate">${editorHtml("regionEditor.messages.regenerate")}</button>
        <button type="button" class="re-btn" id="btn-load-json">${editorHtml("regionEditor.messages.load")}</button>
        <input type="file" id="re-file-input" accept=".json" style="display:none;" />
        <button type="button" class="re-btn" id="btn-save-json">${editorHtml("regionEditor.messages.saveJSON")}</button>
        <button type="button" class="re-btn" id="btn-export-svg">${editorHtml("regionEditor.messages.exportSVG")}</button>
        <button type="button" class="re-btn" id="btn-export-png">${editorHtml("regionEditor.messages.exportPNG")}</button>
        <button type="button" class="re-btn" id="btn-clear-site" title="${editorHtml("regionEditor.messages.deleteStoredRegionDataReceivedFromFMG")}">${editorHtml("regionEditor.messages.resetLinkedData")}</button>
      </div>
    </header>

    <div class="re-body">
      <aside class="re-toolbar">
        <button type="button" class="re-tool-btn active" data-tool="select" title="${editorHtml("regionEditor.messages.selectAndMoveV")}">👆</button>
        <button type="button" class="re-tool-btn" data-tool="brush" title="${editorHtml("regionEditor.messages.biomeBrushB")}">🖌</button>
        <button type="button" class="re-tool-btn" data-tool="stamp" title="${editorHtml("regionEditor.messages.symbolStampS")}">⛰</button>
        <button type="button" class="re-tool-btn" data-tool="settlement" title="${editorHtml("regionEditor.messages.placeSettlementsC")}">🏰</button>
        <button type="button" class="re-tool-btn" data-tool="landmark" title="${editorHtml("regionEditor.messages.placeDungeonsAndRuinsD")}">🗝</button>
        <button type="button" class="re-tool-btn" data-tool="erase" title="${editorHtml("regionEditor.messages.eraserE")}">🧹</button>
        <div style="height:1px; width:30px; background:var(--re-panel-border); margin:6px 0;"></div>
        <button type="button" class="re-tool-btn" id="btn-reset-view" title="${editorHtml("regionEditor.messages.resetView")}">🎯</button>
      </aside>

      <main class="re-viewport" id="re-viewport">
        <div class="re-canvas-container" id="re-canvas">
          <div id="re-svg-layer" style="width:100%; height:100%;"></div>
        </div>
      </main>

      <aside class="re-sidebar">
        <!-- ツール固有オプション -->
        <section class="re-panel-section" id="re-tool-options">
          <div class="re-section-title">${editorHtml("regionEditor.messages.toolSettings")}<span id="re-tool-name">${editorHtml("regionEditor.messages.select")}</span></div>
          <div id="re-tool-options-content">
            <div style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickMapElementsToViewAndEditTheirProperties")}</div>
          </div>
        </section>

        <!-- Voronoi 実験地図（FMG 連携なしでバイオーム別の森林を確認） -->
        <section class="re-panel-section">
          <div class="re-section-title">${editorHtml("regionEditor.messages.voronoiBiomeSandbox")}</div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.cellCount1", { value0: MAX_SANDBOX_CELLS })}</label>
            <input type="number" class="re-input" id="vs-count" min="1" max="${MAX_SANDBOX_CELLS}" value="1" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.mapSideLengthKm")}</label>
            <input type="number" class="re-input" id="vs-extent" min="1" max="200" value="10" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.elevationM")}</label>
            <input type="number" class="re-input" id="vs-elevation" min="0" max="5000" value="100" />
          </div>
          <div id="vs-biomes"></div>
          <button type="button" class="re-btn" id="btn-voronoi-random" style="width:100%; margin-top:6px;">${editorHtml("regionEditor.messages.randomiseBiomes")}</button>
          <button type="button" class="re-btn primary" id="btn-voronoi-sandbox" style="width:100%; margin-top:6px;">${editorHtml("regionEditor.messages.generateVoronoi")}</button>
        </section>

        <!-- 地方全体設定 -->
        <section class="re-panel-section">
          <div class="re-section-title">${editorHtml("regionEditor.messages.regionSettings")}</div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.title")}</label>
            <input type="text" class="re-input" id="input-title" value="${escapeHtml(history.current.title)}" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.seed")}</label>
            <input type="text" class="re-input" id="input-seed" value="${escapeHtml(history.current.seed)}" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.theme")}</label>
            <select class="re-select" id="select-theme">
              <option value="illustrated" ${history.current.decoration.theme === "illustrated" ? "selected" : ""}>${editorHtml("regionEditor.messages.illustratedBirdSEyeMountainsAndForests")}</option>
              <option value="schley" ${history.current.decoration.theme === "schley" ? "selected" : ""}>${editorHtml("regionEditor.messages.dAmpDSwordCoastMikeSchley")}</option>
              <option value="perilous" ${history.current.decoration.theme === "perilous" ? "selected" : ""}>${editorHtml("regionEditor.messages.perilousShoresWatabouPenDrawing")}</option>
              <option value="parchment" ${history.current.decoration.theme === "parchment" ? "selected" : ""}>${editorHtml("regionEditor.messages.antiqueParchment")}</option>
              <option value="monochrome" ${history.current.decoration.theme === "monochrome" ? "selected" : ""}>${editorHtml("regionEditor.messages.monochrome")}</option>
            </select>
          </div>
          <div class="re-form-row" id="row-illustrated-palette" style="${history.current.decoration.theme === "illustrated" ? "" : "display:none"}">
            <label>${editorHtml("regionEditor.messages.palette")}</label>
            <select class="re-select" id="select-illustrated-palette">
              ${(Object.entries(ILLUSTRATED_PALETTES) as [IllustratedPalette, { label: string }][])
                .map(
                  ([key, p]) =>
                    `<option value="${key}" ${(history.current.decoration.illustratedPalette ?? "sepia") === key ? "selected" : ""}>${p.label}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.renderQuality")}</label>
            <select class="re-select" id="select-quality">
              <option value="low" ${quality === "low" ? "selected" : ""}>${editorHtml("regionEditor.messages.lowFastTiledRendering")}</option>
              <option value="high" ${quality === "high" ? "selected" : ""}>${editorHtml("regionEditor.messages.highIndividualTreeCrowns")}</option>
            </select>
          </div>
        </section>

        <!-- 地形・等高線設定 -->
        <section class="re-panel-section">
          <div class="re-section-title">${editorHtml("regionEditor.messages.terrainAndContours")}</div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-contours" style="cursor:pointer;">${editorHtml("regionEditor.messages.showContours")}</label>
            <input type="checkbox" id="check-show-contours" ${history.current.terrain.showContours !== false ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-contour-elevations" style="cursor:pointer;">${editorHtml("regionEditor.messages.showElevations")}</label>
            <input type="checkbox" id="check-show-contour-elevations" ${history.current.terrain.showContourElevations === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-cell-borders" style="cursor:pointer;">${editorHtml("regionEditor.messages.showCellBorders")}</label>
            <input type="checkbox" id="check-show-cell-borders" ${history.current.terrain.showCellBorders === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-biome-cells" style="cursor:pointer;">${editorHtml("regionEditor.messages.biomeEditingViewSolidCellColours")}</label>
            <input type="checkbox" id="check-show-biome-cells" ${history.current.terrain.showBiomeCells === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.cellBorderStackingOrder")}</label>
            <select class="re-select" id="select-cell-border-order">
              <option value="top" ${history.current.terrain.cellBorderOrder !== "bottom" ? "selected" : ""}>${editorHtml("regionEditor.messages.top")}</option>
              <option value="bottom" ${history.current.terrain.cellBorderOrder === "bottom" ? "selected" : ""}>${editorHtml("regionEditor.messages.bottom")}</option>
            </select>
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.cellBorderOpacity01")}</label>
            <input type="number" class="re-input" id="input-cell-border-opacity" min="0" max="1" step="0.1" value="${history.current.terrain.cellBorderOpacity ?? 0.6}" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-cultivation" style="cursor:pointer;">${editorHtml("regionEditor.messages.showCultivatedLand")}</label>
            <input type="checkbox" id="check-show-cultivation" ${history.current.terrain.showCultivation === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="input-forest-threshold" title="${editorHtml("regionEditor.messages.drawForestsWhereBlurredDensityReachesThisValueLowerValues")}">${editorHtml("regionEditor.messages.forestDensityThreshold")}</label>
            <input type="number" id="input-forest-threshold" min="0.05" max="0.95" step="0.05" value="${history.current.terrain.forestDensityThreshold ?? 0.5}" style="width:60px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="input-settlement-icon-scale">${editorHtml("regionEditor.messages.settlementIconScale")}</label>
            <input type="number" id="input-settlement-icon-scale" min="1" step="1" value="${history.current.decoration.settlementIconScale ?? DEFAULT_SETTLEMENT_ICON_SCALE}" style="width:60px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="input-route-width-scale">${editorHtml("regionEditor.messages.roadScale")}</label>
            <input type="number" id="input-route-width-scale" min="0.5" step="0.5" value="${history.current.decoration.routeWidthScale ?? DEFAULT_ROUTE_WIDTH_SCALE}" style="width:60px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="input-river-width-scale">${editorHtml("regionEditor.messages.riverScale")}</label>
            <input type="number" id="input-river-width-scale" min="0.5" step="0.5" value="${history.current.decoration.riverWidthScale ?? DEFAULT_RIVER_WIDTH_SCALE}" style="width:60px;" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.contourInterval")}</label>
            <select class="re-select" id="select-contour-interval">
              <option value="25" ${history.current.terrain.contourIntervalMeters === 25 ? "selected" : ""}>${editorHtml("regionEditor.messages.25MFine")}</option>
              <option value="50" ${history.current.terrain.contourIntervalMeters === 50 ? "selected" : ""}>${editorHtml("regionEditor.messages.50MLowlands")}</option>
              <option value="100" ${!history.current.terrain.contourIntervalMeters || history.current.terrain.contourIntervalMeters === 100 ? "selected" : ""}>${editorHtml("regionEditor.messages.100MRollingTerrain")}</option>
              <option value="200" ${history.current.terrain.contourIntervalMeters === 200 ? "selected" : ""}>${editorHtml("regionEditor.messages.200MMountains")}</option>
              <option value="500" ${history.current.terrain.contourIntervalMeters === 500 ? "selected" : ""}>${editorHtml("regionEditor.messages.500MWideAlpineRegion")}</option>
            </select>
          </div>
          <div style="font-size:11px; line-height:1.6; color:var(--re-text-muted); margin-top:4px;" id="re-elevation-info">
            <!-- 標高情報 -->
          </div>
        </section>

        <!-- 選択要素のプロパティ -->
        <section class="re-panel-section" id="re-selection-panel">
          <div class="re-section-title">${editorHtml("regionEditor.messages.selectionDetails")}</div>
          <div id="re-selection-content" style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickASettlementDungeonOrSymbolOnTheMapTo")}</div>
        </section>

        <!-- 規約・統計情報 -->
        <section class="re-panel-section">
          <div class="re-section-title">${editorHtml("regionEditor.messages.terrainAndPolicyStatistics")}</div>
          <div style="font-size:12px; line-height:1.7; color:var(--re-text-muted);" id="re-stats-content">
            <div>${editorHtml("regionEditor.messages.treeAndMountainSymbols")}<strong>${history.current.symbols.length}</strong></div>
            <div>${editorHtml("regionEditor.messages.rivers")}<strong>${history.current.rivers.length}</strong></div>
            <div>${editorHtml("regionEditor.messages.roads")}<strong>${history.current.routes.length}</strong></div>
            <div>🌉 <strong>${editorHtml("regionEditor.messages.perpendicularBridgesPolicyCompliant")}<span style="color:#d4a373;">${history.current.bridges.length}</span></strong></div>
            <div>${editorHtml("regionEditor.messages.settlements")}<strong>${history.current.settlements.length}</strong></div>
            <div>${editorHtml("regionEditor.messages.adventureSitesAndRuins")}<strong>${history.current.landmarks.length}</strong></div>
          </div>
        </section>
      </aside>
    </div>

    <footer class="re-footer">
      <span>${editorHtml("regionEditor.messages.fMGSuiteContinentFMG")}<strong>${editorHtml("regionEditor.messages.regionRE")}</strong>${editorHtml("regionEditor.messages.cityCEDungeonDE")}</span>
      <span>${editorHtml("regionEditor.messages.perpendicularBridgesVerified100Strict90")}</span>
    </footer>
  `;

  const canvas = root.querySelector<HTMLDivElement>("#re-canvas")!;
  const svgLayer = root.querySelector<HTMLDivElement>("#re-svg-layer")!;
  const viewport = root.querySelector<HTMLDivElement>("#re-viewport")!;
  const selectionContent = root.querySelector<HTMLDivElement>("#re-selection-content")!;
  const toolNameSpan = root.querySelector<HTMLSpanElement>("#re-tool-name")!;
  const toolOptionsContent = root.querySelector<HTMLDivElement>("#re-tool-options-content")!;
  const statsContent = root.querySelector<HTMLDivElement>("#re-stats-content")!;
  const undoBtn = root.querySelector<HTMLButtonElement>("#btn-undo")!;
  const redoBtn = root.querySelector<HTMLButtonElement>("#btn-redo")!;

  function updateTransform(): void {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function updateHistoryButtons(): void {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    undoBtn.style.opacity = history.canUndo() ? "1" : "0.5";
    redoBtn.style.opacity = history.canRedo() ? "1" : "0.5";
  }

  function updateStats(): void {
    const doc = history.current;
    const hf = doc.terrain.heightfield;
    const minElev = hf ? Math.round(hf.minElevationMeters) : 0;
    const maxElev = hf ? Math.round(hf.maxElevationMeters) : 0;
    const contourCount = doc.terrain.contours?.length ?? 0;
    const indexCount = doc.terrain.contours?.filter(c => c.isIndex).length ?? 0;
    const interval = doc.terrain.contourIntervalMeters ?? 100;
    const drawn = renderStatsOfRenderedDoc(doc);
    const forestTrees =
      drawn?.forestMode === "pattern"
        ? editorHtml("regionEditor.messages.drawnForestPattern")
        : String(drawn?.forestTrees ?? 0);
    const fields = drawn?.landUse.cultivation ?? 0;
    const landUseTotal = Object.values(drawn?.landUse ?? {}).reduce((a, b) => a + b, 0);
    const svgElements = svgLayer.querySelectorAll("*").length;

    statsContent.innerHTML = `
      <div>${editorHtml("regionEditor.messages.treeAndMountainSymbols")}<strong>${doc.symbols.length}</strong></div>
      <div>${editorHtml("regionEditor.messages.rivers")}<strong>${doc.rivers.length}</strong></div>
      <div>${editorHtml("regionEditor.messages.roads")}<strong>${doc.routes.length}</strong></div>
      <div>🌉 <strong>${editorHtml("regionEditor.messages.perpendicularBridgesPolicyCompliant")}<span style="color:#d4a373;">${doc.bridges.length}</span></strong></div>
      <div>📐 <strong>${editorHtml("regionEditor.messages.contours")}<span style="color:#a88350;">${editorHtml("regionEditor.messages.contoursRegionEditorPage", { value0: contourCount })}</span></strong>${editorHtml("regionEditor.messages.indexContours", { value0: indexCount })}</div>
      <div>⛰️ <strong>${editorHtml("regionEditor.messages.elevationRangeM", { value0: minElev, value1: maxElev })}</strong>${editorHtml("regionEditor.messages.reliefM", { value0: maxElev - minElev })}</div>
      <div>${editorHtml("regionEditor.messages.settlements")}<strong>${doc.settlements.length}</strong></div>
      <div>${editorHtml("regionEditor.messages.adventureSitesAndRuins")}<strong>${doc.landmarks.length}</strong></div>
      <div style="margin-top:4px; border-top:1px solid rgba(128,128,128,0.3); padding-top:4px;">${editorHtml("regionEditor.messages.drawnElements")}</div>
      <div>${editorHtml("regionEditor.messages.drawnForestTrees")}<strong>${forestTrees}</strong></div>
      <div>${editorHtml("regionEditor.messages.drawnSymbols", { value0: drawn?.treeSymbols ?? 0, value1: drawn?.otherSymbols ?? 0 })}</div>
      <div>${editorHtml("regionEditor.messages.drawnFields")}<strong>${doc.terrain.showCultivation === true ? fields : "-"}</strong></div>
      <div>${editorHtml("regionEditor.messages.drawnLandUsePatches")}<strong>${landUseTotal}</strong></div>
      <div>${editorHtml("regionEditor.messages.drawnSvgElements")}<strong>${svgElements}</strong></div>
    `;

    const elevInfo = root.querySelector("#re-elevation-info");
    if (elevInfo) {
      elevInfo.innerHTML = `
        <div>${editorHtml("regionEditor.messages.elevationRange")}<strong>${editorHtml("regionEditor.messages.elevationRangeMetres", { value0: minElev, value1: maxElev })}</strong></div>
        <div>${editorHtml("regionEditor.messages.contours")}<strong>${editorHtml("regionEditor.messages.contourCountSpaced", { value0: contourCount })}</strong>${editorHtml("regionEditor.messages.indexContoursRegionEditorPage", { value0: indexCount })}</div>
        <div>${editorHtml("regionEditor.messages.contourIntervalRegionEditorPage")}<strong>${editorHtml("regionEditor.messages.elevationMetres", { value0: interval })}</strong></div>
      `;
    }

    const checkContours = root.querySelector<HTMLInputElement>("#check-show-contours");
    if (checkContours) {
      checkContours.checked = doc.terrain.showContours !== false;
    }
    const inputIconScale = root.querySelector<HTMLInputElement>("#input-settlement-icon-scale");
    if (inputIconScale) {
      inputIconScale.value = String(doc.decoration.settlementIconScale ?? DEFAULT_SETTLEMENT_ICON_SCALE);
    }
    const inputRouteScale = root.querySelector<HTMLInputElement>("#input-route-width-scale");
    if (inputRouteScale) {
      inputRouteScale.value = String(doc.decoration.routeWidthScale ?? DEFAULT_ROUTE_WIDTH_SCALE);
    }
    const inputRiverScale = root.querySelector<HTMLInputElement>("#input-river-width-scale");
    if (inputRiverScale) {
      inputRiverScale.value = String(doc.decoration.riverWidthScale ?? DEFAULT_RIVER_WIDTH_SCALE);
    }
    const checkElevations = root.querySelector<HTMLInputElement>("#check-show-contour-elevations");
    if (checkElevations) {
      checkElevations.checked = doc.terrain.showContourElevations === true;
    }
    const checkCellBorders = root.querySelector<HTMLInputElement>("#check-show-cell-borders");
    if (checkCellBorders) {
      checkCellBorders.checked = doc.terrain.showCellBorders === true;
    }
    const checkBiomeCells = root.querySelector<HTMLInputElement>("#check-show-biome-cells");
    if (checkBiomeCells) checkBiomeCells.checked = doc.terrain.showBiomeCells === true;
    const selectBorderOrder = root.querySelector<HTMLSelectElement>("#select-cell-border-order");
    if (selectBorderOrder) selectBorderOrder.value = doc.terrain.cellBorderOrder ?? "top";
    const inputBorderOpacity = root.querySelector<HTMLInputElement>("#input-cell-border-opacity");
    if (inputBorderOpacity) inputBorderOpacity.value = String(doc.terrain.cellBorderOpacity ?? 0.6);
    const inputForestThreshold = root.querySelector<HTMLInputElement>("#input-forest-threshold");
    if (inputForestThreshold) inputForestThreshold.value = String(doc.terrain.forestDensityThreshold ?? 0.5);
    const checkCultivation = root.querySelector<HTMLInputElement>("#check-show-cultivation");
    if (checkCultivation) {
      checkCultivation.checked = doc.terrain.showCultivation === true;
    }
  }

  function renderMap(): void {
    const doc = history.current;
    svgLayer.innerHTML = renderRegionSvg(doc, selectedId, { zoom, quality });
    renderedDetail = detailForZoom(zoom);
    const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
    const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;
    canvas.style.width = `${widthUnits}px`;
    canvas.style.height = `${heightUnits}px`;
    updateHistoryButtons();
    updateStats();
    attachSvgEvents();
  }

  function updateToolOptions(): void {
    switch (activeTool) {
      case "select":
        toolNameSpan.textContent = editorText("regionEditor.messages.selectAndMove");
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickElementsToSelectAndEditThemDragToAdjust")}</div>
        `;
        break;
      case "brush":
        toolNameSpan.textContent = editorText("regionEditor.messages.biomeBrush");
        toolOptionsContent.innerHTML = `
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.biomeType")}</label>
            <select class="re-select" id="tool-brush-biome">
              <option value="deciduous_forest" ${brushBiome === "deciduous_forest" ? "selected" : ""}>${editorHtml("regionEditor.messages.broadleafForest")}</option>
              <option value="coniferous_forest" ${brushBiome === "coniferous_forest" ? "selected" : ""}>${editorHtml("regionEditor.messages.coniferousForestTaigaPine")}</option>
              <option value="tropical_forest" ${brushBiome === "tropical_forest" ? "selected" : ""}>${editorHtml("regionEditor.messages.jungle")}</option>
              <option value="mountains" ${brushBiome === "mountains" ? "selected" : ""}>${editorHtml("regionEditor.messages.mountains")}</option>
              <option value="hills" ${brushBiome === "hills" ? "selected" : ""}>${editorHtml("regionEditor.messages.hills")}</option>
              <option value="swamp" ${brushBiome === "swamp" ? "selected" : ""}>${editorHtml("regionEditor.messages.wetlandAndSwamp")}</option>
              <option value="grassland" ${brushBiome === "grassland" ? "selected" : ""}>${editorHtml("regionEditor.messages.grassland")}</option>
            </select>
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.brushRadius")}<span id="tool-brush-size-val">${brushRadius}</span>${editorHtml("regionEditor.messages.px")}</label>
            <input type="range" min="15" max="80" value="${brushRadius}" id="tool-brush-radius" style="width:100%;" />
          </div>
        `;
        toolOptionsContent.querySelector("#tool-brush-biome")?.addEventListener("change", e => {
          brushBiome = (e.target as HTMLSelectElement).value as BiomeKind;
        });
        toolOptionsContent.querySelector("#tool-brush-radius")?.addEventListener("input", e => {
          brushRadius = Number((e.target as HTMLInputElement).value);
          const valSpan = toolOptionsContent.querySelector("#tool-brush-size-val");
          if (valSpan) valSpan.textContent = String(brushRadius);
        });
        break;
      case "stamp":
        toolNameSpan.textContent = editorText("regionEditor.messages.symbolStamp");
        toolOptionsContent.innerHTML = `
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.symbolType")}</label>
            <select class="re-select" id="tool-stamp-type">
              <option value="mountain_peak_major" ${stampType === "mountain_peak_major" ? "selected" : ""}>${editorHtml("regionEditor.messages.mountainMajorPeak")}</option>
              <option value="mountain_peak_minor" ${stampType === "mountain_peak_minor" ? "selected" : ""}>${editorHtml("regionEditor.messages.mountainMinorPeak")}</option>
              <option value="mountain_snow" ${stampType === "mountain_snow" ? "selected" : ""}>${editorHtml("regionEditor.messages.snowyMountain")}</option>
              <option value="hill_cluster" ${stampType === "hill_cluster" ? "selected" : ""}>${editorHtml("regionEditor.messages.rollingHills")}</option>
              <option value="tree_deciduous" ${stampType === "tree_deciduous" ? "selected" : ""}>${editorHtml("regionEditor.messages.treeBroadleaf")}</option>
              <option value="tree_pine" ${stampType === "tree_pine" ? "selected" : ""}>${editorHtml("regionEditor.messages.treePineConifer")}</option>
              <option value="swamp_grass" ${stampType === "swamp_grass" ? "selected" : ""}>${editorHtml("regionEditor.messages.wetlandGrass")}</option>
            </select>
          </div>
        `;
        toolOptionsContent.querySelector("#tool-stamp-type")?.addEventListener("change", e => {
          stampType = (e.target as HTMLSelectElement).value as SymbolType;
        });
        break;
      case "settlement":
        toolNameSpan.textContent = editorText("regionEditor.messages.placeSettlements");
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickTheMapToPlaceANewTownOrVillage")}</div>
        `;
        break;
      case "landmark":
        toolNameSpan.textContent = editorText("regionEditor.messages.placeDungeonsAndRuins");
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickTheMapToPlaceAnAdventureSiteSuchAs")}</div>
        `;
        break;
      case "erase":
        toolNameSpan.textContent = editorText("regionEditor.messages.eraser");
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">${editorHtml("regionEditor.messages.clickOrDragOnTheMapToEraseSymbols")}</div>
        `;
        break;
    }
  }

  function attachSvgEvents(): void {
    // 集落クリック
    canvas.querySelectorAll<SVGGElement>(".settlement-symbol").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const id = el.getAttribute("data-id");
        const s = history.current.settlements.find(item => item.id === id);
        if (s) {
          selectedId = s.id;
          selectedKind = "settlement";
          updateSelectionPanel();
          renderMap();
        }
      });
    });

    // ダンジョンクリック
    canvas.querySelectorAll<SVGGElement>(".landmark-symbol").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const id = el.getAttribute("data-id");
        const lm = history.current.landmarks.find(item => item.id === id);
        if (lm) {
          selectedId = lm.id;
          selectedKind = "landmark";
          updateSelectionPanel();
          renderMap();
        }
      });
    });

    // シンボルクリック
    canvas.querySelectorAll<SVGGElement>(".map-symbol").forEach(el => {
      el.addEventListener("click", e => {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const id = el.getAttribute("data-id");
        const sym = history.current.symbols.find(item => item.id === id);
        if (sym) {
          selectedId = sym.id;
          selectedKind = "symbol";
          updateSelectionPanel();
          renderMap();
        }
      });
    });

    // 街道クリック
    canvas.querySelectorAll<SVGElement>("[data-kind='route']").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const id = el.getAttribute("data-id");
        const rt = history.current.routes.find(item => item.id === id);
        if (rt) {
          selectedId = rt.id;
          selectedKind = "route";
          updateSelectionPanel();
          renderMap();
        }
      });
    });

    // 河川クリック
    canvas.querySelectorAll<SVGElement>("[data-kind='river']").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const id = el.getAttribute("data-id");
        const rv = history.current.rivers.find(item => item.id === id);
        if (rv) {
          selectedId = rv.id;
          selectedKind = "river";
          updateSelectionPanel();
          renderMap();
        }
      });
    });
  }

  function updateSelectionPanel(): void {
    const doc = history.current;
    if (!selectedId) {
      selectionContent.innerHTML = editorText(
        "regionEditor.messages.clickASettlementDungeonSymbolRoadRiverOrEmptyCell"
      );
      return;
    }

    if (selectedKind === "settlement") {
      const s = doc.settlements.find(item => item.id === selectedId);
      if (!s) return;
      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.townOrCityName")}</label>
            <input type="text" class="re-input" id="sel-settlement-name" value="${escapeHtml(s.name)}" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.type")}</label>
            <select class="re-select" id="sel-settlement-type">
              ${settlementTypeOptions()
                .map(([v, label]) => `<option value="${v}" ${s.type === v ? "selected" : ""}>${label}</option>`)
                .join("")}
              ${settlementTypeOptions().some(([v]) => v === s.type) ? "" : `<option value="${escapeHtml(String(s.type))}" selected>${escapeHtml(String(s.type))}</option>`}
            </select>
          </div>
          <div>${editorHtml("regionEditor.messages.position", { value0: s.position[0].toFixed(1), value1: s.position[1].toFixed(1) })}</div>
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <button type="button" class="re-btn primary" id="btn-open-ce" style="width:100%; justify-content:center;">${editorHtml("regionEditor.messages.openInCityEditorCE")}</button>
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">${editorHtml("regionEditor.messages.deleteThisSettlement")}</button>
          </div>
        </div>
      `;

      selectionContent.querySelector("#sel-settlement-name")?.addEventListener("change", e => {
        const newName = (e.target as HTMLInputElement).value;
        const next = updateSettlement(doc, { ...s, name: newName });
        history.push(next);
        renderMap();
      });

      selectionContent.querySelector("#sel-settlement-type")?.addEventListener("change", e => {
        const newType = (e.target as HTMLSelectElement).value as RegionSettlement["type"];
        const next = updateSettlement(doc, { ...s, type: newType });
        history.push(next);
        renderMap();
      });

      selectionContent.querySelector("#btn-open-ce")?.addEventListener("click", () => {
        if (s.siteDescriptor) {
          sessionStorage.setItem("fmg.citySite", JSON.stringify(s.siteDescriptor));
        } else {
          const burgDescriptor = {
            version: 3,
            burg: {
              id: s.burgId ?? 999,
              name: s.name,
              group: s.type,
              seed: s.cityEditorSeed || `${doc.seed}:${s.name}`,
              population: s.population ?? 1200,
              capital: s.isCapital ?? false,
              port: s.hasPort ?? false,
              walls: s.hasWalls ?? false,
              citadel: s.hasCitadel ?? false,
              plaza: true,
              temple: true,
              shanty: false
            }
          };
          sessionStorage.setItem("fmg.citySite", JSON.stringify(burgDescriptor));
        }
        window.open(`${import.meta.env.BASE_URL}city-editor/`, "_blank");
      });

      selectionContent.querySelector("#btn-delete-selected")?.addEventListener("click", () => {
        const next = removeSettlement(doc, s.id);
        history.push(next);
        selectedId = null;
        updateSelectionPanel();
        renderMap();
      });
      return;
    }

    if (selectedKind === "landmark") {
      const lm = doc.landmarks.find(item => item.id === selectedId);
      if (!lm) return;
      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.dungeonOrRuinName")}</label>
            <input type="text" class="re-input" id="sel-lm-name" value="${escapeHtml(lm.name)}" />
          </div>
          <div class="re-form-row">
            <label>${editorHtml("regionEditor.messages.type")}</label>
            <select class="re-select" id="sel-lm-kind">
              <option value="dungeon" ${lm.kind === "dungeon" ? "selected" : ""}>${editorHtml("regionEditor.messages.dungeon")}</option>
              <option value="ruins" ${lm.kind === "ruins" ? "selected" : ""}>${editorHtml("regionEditor.messages.ancientRuins")}</option>
              <option value="tower" ${lm.kind === "tower" ? "selected" : ""}>${editorHtml("regionEditor.messages.wizardSTower")}</option>
              <option value="tomb" ${lm.kind === "tomb" ? "selected" : ""}>${editorHtml("regionEditor.messages.royalTomb")}</option>
            </select>
          </div>
          <div>${editorHtml("regionEditor.messages.danger")}<strong>${editorHtml("regionEditor.messages.dangerLevel", { value0: lm.dangerLevel ?? 5 })}</strong></div>
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <button type="button" class="re-btn primary" id="btn-open-de" style="width:100%; justify-content:center;">${editorHtml("regionEditor.messages.openInDungeonEditorDE")}</button>
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">${editorHtml("regionEditor.messages.deleteThisDungeon")}</button>
          </div>
        </div>
      `;

      selectionContent.querySelector("#sel-lm-name")?.addEventListener("change", e => {
        const newName = (e.target as HTMLInputElement).value;
        const next = updateLandmark(doc, { ...lm, name: newName });
        history.push(next);
        renderMap();
      });

      selectionContent.querySelector("#btn-open-de")?.addEventListener("click", () => {
        window.open(`${import.meta.env.BASE_URL}dungeon-editor/`, "_blank");
      });

      selectionContent.querySelector("#btn-delete-selected")?.addEventListener("click", () => {
        const next = removeLandmark(doc, lm.id);
        history.push(next);
        selectedId = null;
        updateSelectionPanel();
        renderMap();
      });
      return;
    }

    if (selectedKind === "symbol") {
      const sym = doc.symbols.find(item => item.id === selectedId);
      if (!sym) return;
      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div>${editorHtml("regionEditor.messages.symbol")}<strong>${escapeHtml(sym.type)}</strong></div>
          <div>${editorHtml("regionEditor.messages.position", { value0: sym.x.toFixed(1), value1: sym.y.toFixed(1) })}</div>
          <div>${editorHtml("regionEditor.messages.scale", { value0: sym.scale.toFixed(2) })}</div>
          <div style="margin-top:8px;">
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">${editorHtml("regionEditor.messages.deleteThisSymbol")}</button>
          </div>
        </div>
      `;
      selectionContent.querySelector("#btn-delete-selected")?.addEventListener("click", () => {
        const next = removeSymbol(doc, sym.id);
        history.push(next);
        selectedId = null;
        updateSelectionPanel();
        renderMap();
      });
    }

    if (selectedKind === "cell") {
      const info = describeCell(doc, selectedId, forestMassOfRenderedDoc(doc));
      if (!info) return;
      const pct = (v: number | null | undefined): string =>
        v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`;
      const dens = (v: number | null): string => (v === null ? "—" : v.toFixed(2));
      const landUseRows = info.landUse.length
        ? info.landUse
            .map(
              u =>
                `<div>${editorHtml("regionEditor.messages.landUseAreaRow", { value0: editorOptionText(u.kind, "regionEditor"), value1: Math.round(u.areaHa).toLocaleString() })}</div>`
            )
            .join("")
        : `<div>${editorHtml("regionEditor.messages.none")}</div>`;
      const forestRows = info.isForest
        ? `
          <div>${editorHtml("regionEditor.messages.forestCover")}<strong>${info.forestCover ?? "—"}</strong>${editorHtml("regionEditor.messages.forestStock", { value0: info.forestStock !== undefined ? info.forestStock.toFixed(2) : "—" })}</div>
          <div>${editorHtml("regionEditor.messages.forestPolygonsActualCover", { value0: info.forestPolygonCount })}<strong>${pct(info.forestPolygonRatio)}</strong></div>
          <div>${editorHtml("regionEditor.messages.blurredForestDensityMean")}<strong>${dens(info.meanDensity)}</strong>${editorHtml("regionEditor.messages.maximum", { value0: dens(info.maxDensity) })}</div>
          <div>${editorHtml("regionEditor.messages.areaRenderedAsForest")}<strong>${pct(info.drawnRatio)}</strong>${editorHtml("regionEditor.messages.threshold", { value0: info.threshold })}</div>
          ${info.vanishes ? `<div style="color:#b5651d;">${editorHtml("regionEditor.messages.forestPolygonsExistButNoTreesAreDrawnBecauseDensity")}</div>` : ""}`
        : `<div>${editorHtml("regionEditor.messages.thisIsNotAForestBiomeExcludedFromForestMass")}</div>`;
      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
          <div>${editorHtml("regionEditor.messages.cell")}<strong>${info.cellId ?? escapeHtml(info.id)}</strong>（${escapeHtml(info.id)}）</div>
          <div>${editorHtml("regionEditor.messages.biome")}<span class="re-badge">${escapeHtml(editorOptionText(info.kind, "regionEditor"))}</span>${info.terrainKind ? editorText("regionEditor.messages.ground", { value0: escapeHtml(info.terrainKind) }) : ""}</div>
          <div>${editorHtml("regionEditor.messages.areaHa", { value0: Math.round(info.areaHa).toLocaleString() })}</div>
          ${forestRows}
          <div>${editorHtml("regionEditor.messages.landUse")}</div>${landUseRows}
          <div>${editorHtml("regionEditor.messages.settlement", { value0: info.settlements.length ? info.settlements.map(escapeHtml).join("、") : editorText("regionEditor.messages.noneRegionEditorPage") })}</div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="sel-forest-threshold" title="${editorHtml("regionEditor.messages.appliesToTheWholeMap")}">${editorHtml("regionEditor.messages.forestDensityThresholdGlobal")}</label>
            <input type="number" id="sel-forest-threshold" min="0.05" max="0.95" step="0.05" value="${info.threshold}" style="width:60px;" />
          </div>
        </div>
      `;
      selectionContent.querySelector("#sel-forest-threshold")?.addEventListener("change", e => {
        applyForestThreshold(Number((e.target as HTMLInputElement).value));
      });
    }

    if (selectedKind === "route") {
      const rt = doc.routes.find(item => item.id === selectedId);
      if (!rt) return;
      const kindLabel =
        rt.kind === "highway"
          ? editorText("regionEditor.messages.highway")
          : rt.kind === "trail"
            ? editorText("regionEditor.messages.trail")
            : editorText("regionEditor.messages.road");
      const lengthMeters = rt.points.reduce((sum, p, i) => {
        if (i === 0) return 0;
        const prev = rt.points[i - 1];
        return sum + Math.hypot(p[0] - prev[0], p[1] - prev[1]) * doc.bounds.metersPerUnit;
      }, 0);
      const connectedBridges = doc.bridges.filter(b => b.routeId === rt.id);

      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div>${editorHtml("regionEditor.messages.roadName")}<strong>${escapeHtml(rt.name || editorText("regionEditor.messages.unnamedRoad"))}</strong></div>
          <div>${editorHtml("regionEditor.messages.typeRegionEditorPage")}<span class="re-badge">${kindLabel}</span></div>
          <div>${editorHtml("regionEditor.messages.totalLengthKmSamplePoints", { value0: (lengthMeters / 1000).toFixed(1), value1: rt.points.length })}</div>
          <div>${editorHtml("regionEditor.messages.perpendicularBridges")}<strong>${editorHtml("regionEditor.messages.bridges", { value0: connectedBridges.length })}</strong></div>
        </div>
      `;
    }

    if (selectedKind === "river") {
      const rv = doc.rivers.find(item => item.id === selectedId);
      if (!rv) return;
      const minW = Math.round(Math.min(...rv.widths));
      const maxW = Math.round(Math.max(...rv.widths));
      const widthStr = minW === maxW ? `${minW} m` : `${minW} m 〜 ${maxW} m`;
      const connectedBridges = doc.bridges.filter(b => b.riverId === rv.id);

      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div>${editorHtml("regionEditor.messages.riverName")}<strong>${escapeHtml(rv.name)}</strong></div>
          <div>${editorHtml("regionEditor.messages.riverWidth")}<strong>${widthStr}</strong></div>
          <div>${editorHtml("regionEditor.messages.flowM3S", { value0: rv.dischargeM3s })}</div>
          <div>${editorHtml("regionEditor.messages.samplePoints", { value0: rv.points.length })}</div>
          <div>${editorHtml("regionEditor.messages.perpendicularBridges")}<strong>${editorHtml("regionEditor.messages.bridges", { value0: connectedBridges.length })}</strong></div>
        </div>
      `;
    }
  }

  /** 森の密度しきい値をマップ全体へ適用し、再描画してセル情報も更新する */
  function applyForestThreshold(value: number): void {
    history.push(setForestDensityThreshold(history.current, value));
    renderMap();
    updateSelectionPanel();
  }

  function getCanvasCoords(clientX: number, clientY: number): Point {
    const svg = svgLayer.querySelector<SVGSVGElement>("svg");
    if (svg) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const transformed = pt.matrixTransform(ctm.inverse());
        return [transformed.x, transformed.y];
      }
    }
    const rect = canvas.getBoundingClientRect();
    const doc = history.current;
    const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
    const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;
    const xRatio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const yRatio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    return [xRatio * widthUnits, yRatio * heightUnits];
  }

  function updateBrushCursor(clientX: number, clientY: number): void {
    const cursorCircle = svgLayer.querySelector<SVGCircleElement>("#re-brush-cursor");
    if (!cursorCircle) return;

    if (activeTool !== "brush" && activeTool !== "erase") {
      cursorCircle.setAttribute("cx", "-9999");
      cursorCircle.setAttribute("cy", "-9999");
      return;
    }

    const pt = getCanvasCoords(clientX, clientY);
    const doc = history.current;
    const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
    const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

    if (pt[0] < -20 || pt[0] > widthUnits + 20 || pt[1] < -20 || pt[1] > heightUnits + 20) {
      cursorCircle.setAttribute("cx", "-9999");
      cursorCircle.setAttribute("cy", "-9999");
      return;
    }

    const r = activeTool === "brush" ? brushRadius : 25;
    cursorCircle.setAttribute("cx", pt[0].toFixed(2));
    cursorCircle.setAttribute("cy", pt[1].toFixed(2));
    cursorCircle.setAttribute("r", r.toString());
  }

  function handleCanvasClick(pt: Point): void {
    const doc = history.current;
    if (activeTool === "brush") {
      const next = paintBiome(doc, pt, brushRadius, brushBiome);
      history.push(next);
      renderMap();
    } else if (activeTool === "stamp") {
      const next = addSymbol(doc, {
        id: `sym-stamp-${Date.now()}`,
        type: stampType,
        x: pt[0],
        y: pt[1],
        scale: 0.9 + Math.random() * 0.2,
        rotationDeg: 0
      });
      history.push(next);
      renderMap();
    } else if (activeTool === "settlement") {
      const name = prompt(
        editorText("regionEditor.messages.enterANameForTheNewSettlement"),
        editorText("regionEditor.messages.newSettlement")
      );
      if (name) {
        const next = addSettlement(doc, {
          id: `set-${Date.now()}`,
          name,
          position: pt,
          type: "town",
          population: 1500
        });
        history.push(next);
        renderMap();
      }
    } else if (activeTool === "landmark") {
      const name = prompt(
        editorText("regionEditor.messages.enterANameForTheNewDungeonOrRuin"),
        editorText("regionEditor.messages.ancientTomb")
      );
      if (name) {
        const next = addLandmark(doc, {
          id: `lm-${Date.now()}`,
          name,
          position: pt,
          kind: "dungeon",
          dangerLevel: 4
        });
        history.push(next);
        renderMap();
      }
    } else if (activeTool === "erase") {
      const next = eraseAt(doc, pt, 25);
      history.push(next);
      renderMap();
    }
  }

  // ツール切り替えボタン
  root.querySelectorAll<HTMLButtonElement>(".re-tool-btn[data-tool]").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".re-tool-btn[data-tool]").forEach(b => {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activeTool = btn.getAttribute("data-tool") as EditorTool;
      updateToolOptions();
    });
  });

  // ビューポートのイベント（パン、ズーム、クリック）
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const oldZoom = zoom;
    zoom = Math.min(Math.max(0.2, zoom * factor), 5.0);
    // カーソル直下の点を固定する（canvasは中心基準でscaleされる）
    const rect = canvas.getBoundingClientRect();
    const ratio = zoom / oldZoom;
    panX += (e.clientX - (rect.left + rect.width / 2)) * (1 - ratio);
    panY += (e.clientY - (rect.top + rect.height / 2)) * (1 - ratio);
    updateTransform();
    scheduleZoomRefresh();
  });

  // Zooming itself is a CSS transform. Zoom-dependent sizes are patched in place once per frame,
  // and the full SVG is regenerated only after the wheel settles on a different detail level.
  let zoomFrame = 0;
  let zoomDetailTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleZoomRefresh(): void {
    if (!zoomFrame)
      zoomFrame = requestAnimationFrame(() => {
        zoomFrame = 0;
        applyTextScale(svgLayer, zoom);
      });
    clearTimeout(zoomDetailTimer);
    zoomDetailTimer = setTimeout(() => {
      if (detailForZoom(zoom) !== renderedDetail) renderMap();
    }, 200);
  }

  viewport.addEventListener("mousedown", e => {
    downClientX = e.clientX;
    downClientY = e.clientY;
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // 中クリック or Shift+クリックでパン
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.classList.add("panning");
      return;
    }
    if (e.button === 0) {
      if (activeTool === "select") {
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        viewport.classList.add("panning");
      } else {
        isDraggingTool = true;
        const pt = getCanvasCoords(e.clientX, e.clientY);
        handleCanvasClick(pt);
      }
    }
  });

  window.addEventListener("mousemove", e => {
    updateBrushCursor(e.clientX, e.clientY);
    if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    } else if (isDraggingTool && (activeTool === "brush" || activeTool === "erase")) {
      const pt = getCanvasCoords(e.clientX, e.clientY);
      handleCanvasClick(pt);
    }
  });

  viewport.addEventListener("mouseleave", () => {
    const cursorCircle = svgLayer.querySelector<SVGCircleElement>("#re-brush-cursor");
    if (cursorCircle) {
      cursorCircle.setAttribute("cx", "-9999");
      cursorCircle.setAttribute("cy", "-9999");
    }
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      viewport.classList.remove("panning");
    }
    isDraggingTool = false;
  });

  // ショートカットキー (Undo/Redo, Tool)
  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        // Redo
        const next = history.redo();
        if (next) renderMap();
      } else {
        // Undo
        const prev = history.undo();
        if (prev) renderMap();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      const next = history.redo();
      if (next) renderMap();
    }
  });

  undoBtn.addEventListener("click", () => {
    const prev = history.undo();
    if (prev) renderMap();
  });

  redoBtn.addEventListener("click", () => {
    const next = history.redo();
    if (next) renderMap();
  });

  // 再生成
  root.querySelector("#btn-regenerate")?.addEventListener("click", () => {
    const inputTitle = (root.querySelector("#input-title") as HTMLInputElement).value;
    const inputSeed = (root.querySelector("#input-seed") as HTMLInputElement).value || String(Date.now());
    const selectTheme = (root.querySelector("#select-theme") as HTMLSelectElement).value as RegionTheme;

    currentSettings = {
      ...currentSettings,
      title: inputTitle,
      seed: inputSeed,
      theme: selectTheme
    };
    const newDoc = generateStandaloneRegion(currentSettings);
    newDoc.decoration.illustratedPalette = history.current.decoration.illustratedPalette;
    history.push(newDoc);
    selectedId = null;
    updateSelectionPanel();
    renderMap();
  });

  // Voronoi 実験地図: セルごとのバイオーム選択欄を、セル数に合わせて作り直す
  const vsBiomeKeys: string[] = ["temperateDeciduousForest"];
  const vsCount = root.querySelector<HTMLInputElement>("#vs-count")!;
  const vsBiomes = root.querySelector<HTMLElement>("#vs-biomes")!;
  const readVsCount = () => Math.max(1, Math.min(MAX_SANDBOX_CELLS, Math.round(Number(vsCount.value) || 1)));
  const renderVsBiomes = () => {
    const n = readVsCount();
    while (vsBiomeKeys.length < n) vsBiomeKeys.push(vsBiomeKeys[vsBiomeKeys.length - 1]);
    vsBiomes.innerHTML = Array.from({ length: n }, (_, i) => {
      const options = SANDBOX_BIOMES.map(
        d =>
          `<option value="${d.key}" ${d.key === vsBiomeKeys[i] ? "selected" : ""}>${escapeHtml(editorOptionText(d.key, "regionEditor"))}</option>`
      ).join("");
      return `<div class="re-form-row"><label>${editorHtml("regionEditor.messages.biomeOfCell", { value0: i + 1 })}</label><select class="re-select" data-vs-cell="${i}">${options}</select></div>`;
    }).join("");
  };
  vsCount.addEventListener("change", renderVsBiomes);
  vsBiomes.addEventListener("change", e => {
    const el = e.target as HTMLSelectElement;
    const i = Number(el.dataset.vsCell);
    if (Number.isInteger(i)) vsBiomeKeys[i] = el.value;
  });
  renderVsBiomes();
  const runVoronoiSandbox = () => {
    const seed = (root.querySelector("#input-seed") as HTMLInputElement).value || "voronoi-sandbox";
    const doc = generateVoronoiSandbox({
      seed,
      cellCount: readVsCount(),
      extentKm: Number((root.querySelector("#vs-extent") as HTMLInputElement).value) || 10,
      elevationMeters: Number((root.querySelector("#vs-elevation") as HTMLInputElement).value) || 0,
      biomeKeys: vsBiomeKeys.slice(0, readVsCount())
    });
    // 生成し直しても、セル境界の表示設定は現在のものを引き継ぐ
    const prev = history.current.terrain;
    doc.terrain.showCellBorders = prev.showCellBorders;
    doc.terrain.cellBorderOrder = prev.cellBorderOrder;
    doc.terrain.cellBorderOpacity = prev.cellBorderOpacity;
    history.push(doc);
    selectedId = null;
    updateSelectionPanel();
    renderMap();
  };
  root.querySelector("#btn-voronoi-random")?.addEventListener("click", () => {
    for (let i = 0; i < readVsCount(); i++) {
      vsBiomeKeys[i] = SANDBOX_BIOMES[Math.floor(Math.random() * SANDBOX_BIOMES.length)].key;
    }
    renderVsBiomes();
    runVoronoiSandbox();
  });
  root.querySelector("#btn-voronoi-sandbox")?.addEventListener("click", runVoronoiSandbox);

  // テーマ切り替え
  root.querySelector("#select-theme")?.addEventListener("change", e => {
    const theme = (e.target as HTMLSelectElement).value as RegionTheme;
    history.current.decoration.theme = theme;
    const paletteRow = root.querySelector("#row-illustrated-palette") as HTMLElement | null;
    if (paletteRow) paletteRow.style.display = theme === "illustrated" ? "" : "none";
    renderMap();
  });

  root.querySelector("#select-illustrated-palette")?.addEventListener("change", e => {
    history.current.decoration.illustratedPalette = (e.target as HTMLSelectElement).value as IllustratedPalette;
    renderMap();
  });

  // 描画品質切り替え
  root.querySelector("#select-quality")?.addEventListener("change", e => {
    quality = (e.target as HTMLSelectElement).value === "high" ? "high" : "low";
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      // 保存できなくても動作には影響しない
    }
    renderMap();
  });

  // 等高線表示切り替え
  root.querySelector("#check-show-contours")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleContours(history.current, checked));
    renderMap();
  });

  // 都市アイコン倍率変更
  root.querySelector("#input-settlement-icon-scale")?.addEventListener("change", e => {
    const input = e.target as HTMLInputElement;
    const scale = Math.max(1, Math.round(Number(input.value)) || 1);
    input.value = String(scale);
    history.push(setSettlementIconScale(history.current, scale));
    renderMap();
  });

  // 街道・河川の倍率変更
  const bindWidthScale = (
    selector: string,
    apply: (doc: typeof history.current, scale: number) => typeof history.current
  ) => {
    root.querySelector(selector)?.addEventListener("change", e => {
      const input = e.target as HTMLInputElement;
      const scale = Math.max(0.5, Number(input.value) || 1);
      input.value = String(scale);
      history.push(apply(history.current, scale));
      renderMap();
    });
  };
  bindWidthScale("#input-route-width-scale", setRouteWidthScale);
  bindWidthScale("#input-river-width-scale", setRiverWidthScale);

  // 森の密度しきい値
  root.querySelector("#input-forest-threshold")?.addEventListener("change", e => {
    applyForestThreshold(Number((e.target as HTMLInputElement).value));
  });

  // 選択ツールで何もない所をクリックしたらセルを選択（ドラッグでパンした後は無視）
  viewport.addEventListener("click", e => {
    if (activeTool !== "select" || e.button !== 0 || e.shiftKey) return;
    if (Math.hypot(e.clientX - downClientX, e.clientY - downClientY) > 4) return;
    const pt = getCanvasCoords(e.clientX, e.clientY);
    const hit = history.current.biomes.find(b => pointInPolygon(pt, b.polygon));
    selectedId = hit?.id ?? null;
    selectedKind = hit ? "cell" : null;
    renderMap();
    updateSelectionPanel();
  });

  // 等高線の標高注記切り替え
  root.querySelector("#check-show-contour-elevations")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleContourElevations(history.current, checked));
    renderMap();
  });

  root.querySelector("#select-cell-border-order")?.addEventListener("change", e => {
    history.push(
      setCellBorderOrder(history.current, (e.target as HTMLSelectElement).value === "bottom" ? "bottom" : "top")
    );
    renderMap();
  });
  root.querySelector("#input-cell-border-opacity")?.addEventListener("change", e => {
    const v = Number((e.target as HTMLInputElement).value);
    history.push(setCellBorderOpacity(history.current, Number.isFinite(v) ? v : 0.6));
    renderMap();
  });

  // セル境界表示切り替え
  root.querySelector("#check-show-cell-borders")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleCellBorders(history.current, checked));
    renderMap();
  });

  // バイオームセル単色表示切り替え
  root.querySelector("#check-show-biome-cells")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleBiomeCells(history.current, checked));
    renderMap();
  });

  // 耕作地表示切り替え
  root.querySelector("#check-show-cultivation")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleCultivation(history.current, checked));
    renderMap();
  });

  // 等高線間隔変更
  root.querySelector("#select-contour-interval")?.addEventListener("change", e => {
    const interval = Number((e.target as HTMLSelectElement).value);
    history.push(updateContourInterval(history.current, interval));
    renderMap();
  });

  // 視点リセット
  root.querySelector("#btn-reset-view")?.addEventListener("click", () => {
    zoom = 0.85;
    panX = 0;
    panY = 0;
    updateTransform();
  });

  // ファイル操作
  root.querySelector("#btn-save-json")?.addEventListener("click", () => exportRegionJson(history.current));
  root.querySelector("#btn-export-svg")?.addEventListener("click", () => exportRegionSvg(history.current));

  // PNG エクスポート
  root.querySelector("#btn-export-png")?.addEventListener("click", () => {
    const svgStr = renderRegionSvg(history.current, null, { quality: "high" });
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width || 1200;
      c.height = img.height || 800;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        c.toBlob(blob => {
          if (blob) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${history.current.title}.png`;
            a.click();
          }
        }, "image/png");
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  root.querySelector("#btn-clear-site")?.addEventListener("click", async () => {
    if (!confirm(editorText("regionEditor.messages.deleteStoredRegionDataLinkedFromFMGAndResetThe"))) return;
    try {
      await clearRegionSite();
      location.reload();
    } catch (err) {
      alert(editorText("regionEditor.messages.resetError", { value0: err }));
    }
  });

  const fileInput = root.querySelector<HTMLInputElement>("#re-file-input")!;
  root.querySelector("#btn-load-json")?.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const res = await readRegionFile(file);
    if (res.ok) {
      history.push(res.document);
      renderMap();
    } else {
      alert(editorText("regionEditor.messages.loadError", { value0: res.error }));
    }
    fileInput.value = "";
  });

  // 初回起動
  updateToolOptions();
  zoom = 0.85;
  updateTransform();
  renderMap();

  return {
    dispose: () => {
      root.innerHTML = "";
    },
    getDocument: () => history.current
  };
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
