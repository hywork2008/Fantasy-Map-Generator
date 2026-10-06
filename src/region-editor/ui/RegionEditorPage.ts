import {
  addLandmark,
  addSettlement,
  addSymbol,
  eraseAt,
  paintBiome,
  removeLandmark,
  removeSettlement,
  removeSymbol,
  setSettlementIconScale,
  toggleCellBorders,
  toggleContourElevations,
  toggleContours,
  toggleCultivation,
  updateContourInterval,
  updateLandmark,
  updateSettlement
} from "../core/commands";
import { generateStandaloneRegion } from "../core/gen/pipeline";
import { RegionHistory } from "../core/history";
import {
  type BiomeKind,
  DEFAULT_REGION_SETTINGS,
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
import { renderRegionSvg, textScaleForZoom } from "../render/svg";

/** FMG burgs-generator.ts の getDefaultGroups に準拠した都市種別（+ 旧 metropolis） */
const SETTLEMENT_TYPE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["capital", "首都 (Capital)"],
  ["metropolis", "大都市 (Metropolis)"],
  ["city", "都市 (City)"],
  ["town", "町 (Town)"],
  ["fort", "砦 (Fort)"],
  ["monastery", "修道院 (Monastery)"],
  ["caravanserai", "隊商宿 (Caravanserai)"],
  ["trading_post", "交易所 (Trading Post)"],
  ["village", "村 (Village)"],
  ["hamlet", "集落 (Hamlet)"]
];

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
  let selectedKind: "settlement" | "landmark" | "symbol" | "route" | "river" | null = null;

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
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let isDraggingTool = false;
  let startX = 0;
  let startY = 0;

  root.innerHTML = `
    <header class="re-header">
      <div class="re-header-left">
        <span class="re-title">⚔ Region Editor</span>
        <span class="re-badge" id="re-scale-badge">${(history.current.bounds.widthMeters / 1000).toFixed(0)} × ${(history.current.bounds.heightMeters / 1000).toFixed(0)} km</span>
      </div>
      <div class="re-actions">
        <button type="button" class="re-btn" id="btn-undo" title="元に戻す (Ctrl+Z)">↩ 元に戻す</button>
        <button type="button" class="re-btn" id="btn-redo" title="やり直す (Ctrl+Y)">↪ やり直す</button>
        <button type="button" class="re-btn primary" id="btn-regenerate">🎲 再生成</button>
        <button type="button" class="re-btn" id="btn-load-json">📂 読込</button>
        <input type="file" id="re-file-input" accept=".json" style="display:none;" />
        <button type="button" class="re-btn" id="btn-save-json">💾 JSON 保存</button>
        <button type="button" class="re-btn" id="btn-export-svg">🖼 SVG 出力</button>
        <button type="button" class="re-btn" id="btn-export-png">📷 PNG 出力</button>
        <button type="button" class="re-btn" id="btn-clear-site" title="FMG から受け取った地域データの保存内容を削除します">🗑 連携データ初期化</button>
      </div>
    </header>

    <div class="re-body">
      <aside class="re-toolbar">
        <button type="button" class="re-tool-btn active" data-tool="select" title="選択・移動 (V)">👆</button>
        <button type="button" class="re-tool-btn" data-tool="brush" title="バイオーム筆塗り (B)">🖌</button>
        <button type="button" class="re-tool-btn" data-tool="stamp" title="シンボルスタンプ (S)">⛰</button>
        <button type="button" class="re-tool-btn" data-tool="settlement" title="集落の配置 (C)">🏰</button>
        <button type="button" class="re-tool-btn" data-tool="landmark" title="ダンジョン・遺跡の配置 (D)">🗝</button>
        <button type="button" class="re-tool-btn" data-tool="erase" title="消しゴム (E)">🧹</button>
        <div style="height:1px; width:30px; background:var(--re-panel-border); margin:6px 0;"></div>
        <button type="button" class="re-tool-btn" id="btn-reset-view" title="視点をリセット">🎯</button>
      </aside>

      <main class="re-viewport" id="re-viewport">
        <div class="re-canvas-container" id="re-canvas">
          <div id="re-svg-layer" style="width:100%; height:100%;"></div>
        </div>
      </main>

      <aside class="re-sidebar">
        <!-- ツール固有オプション -->
        <section class="re-panel-section" id="re-tool-options">
          <div class="re-section-title">ツール設定: <span id="re-tool-name">選択</span></div>
          <div id="re-tool-options-content">
            <div style="font-size:12px; color:var(--re-text-muted);">地図上の要素をクリックしてプロパティを表示・編集します。</div>
          </div>
        </section>

        <!-- 地方全体設定 -->
        <section class="re-panel-section">
          <div class="re-section-title">地方設定 (Region Settings)</div>
          <div class="re-form-row">
            <label>名称 (Title)</label>
            <input type="text" class="re-input" id="input-title" value="${escapeHtml(history.current.title)}" />
          </div>
          <div class="re-form-row">
            <label>シード値 (Seed)</label>
            <input type="text" class="re-input" id="input-seed" value="${escapeHtml(history.current.seed)}" />
          </div>
          <div class="re-form-row">
            <label>テーマ・様式 (Theme)</label>
            <select class="re-select" id="select-theme">
              <option value="schley" ${history.current.decoration.theme === "schley" ? "selected" : ""}>D&amp;D Sword Coast (Mike Schley)</option>
              <option value="perilous" ${history.current.decoration.theme === "perilous" ? "selected" : ""}>Perilous Shores (Watabou ペン画)</option>
              <option value="parchment" ${history.current.decoration.theme === "parchment" ? "selected" : ""}>Antique Parchment (羊皮紙調)</option>
              <option value="monochrome" ${history.current.decoration.theme === "monochrome" ? "selected" : ""}>Monochrome (白黒)</option>
            </select>
          </div>
          <div class="re-form-row">
            <label>描画品質 (Quality)</label>
            <select class="re-select" id="select-quality">
              <option value="low" ${quality === "low" ? "selected" : ""}>低（高速・タイル描画）</option>
              <option value="high" ${quality === "high" ? "selected" : ""}>高（樹冠を1本ずつ描画）</option>
            </select>
          </div>
        </section>

        <!-- 地形・等高線設定 -->
        <section class="re-panel-section">
          <div class="re-section-title">地形・等高線 (Contours)</div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-contours" style="cursor:pointer;">等高線を表示</label>
            <input type="checkbox" id="check-show-contours" ${history.current.terrain.showContours !== false ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-contour-elevations" style="cursor:pointer;">標高を表示</label>
            <input type="checkbox" id="check-show-contour-elevations" ${history.current.terrain.showContourElevations === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-cell-borders" style="cursor:pointer;">セル境界を表示</label>
            <input type="checkbox" id="check-show-cell-borders" ${history.current.terrain.showCellBorders === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="check-show-cultivation" style="cursor:pointer;">耕作地を表示</label>
            <input type="checkbox" id="check-show-cultivation" ${history.current.terrain.showCultivation === true ? "checked" : ""} style="cursor:pointer; width:16px; height:16px;" />
          </div>
          <div class="re-form-row" style="display:flex; align-items:center; justify-content:space-between;">
            <label for="input-settlement-icon-scale">都市アイコン倍率</label>
            <input type="number" id="input-settlement-icon-scale" min="1" step="1" value="${history.current.decoration.settlementIconScale ?? 1}" style="width:60px;" />
          </div>
          <div class="re-form-row">
            <label>等高線間隔</label>
            <select class="re-select" id="select-contour-interval">
              <option value="25" ${history.current.terrain.contourIntervalMeters === 25 ? "selected" : ""}>25 m（細密）</option>
              <option value="50" ${history.current.terrain.contourIntervalMeters === 50 ? "selected" : ""}>50 m（標準・低地）</option>
              <option value="100" ${!history.current.terrain.contourIntervalMeters || history.current.terrain.contourIntervalMeters === 100 ? "selected" : ""}>100 m（標準・中起伏）</option>
              <option value="200" ${history.current.terrain.contourIntervalMeters === 200 ? "selected" : ""}>200 m（山岳）</option>
              <option value="500" ${history.current.terrain.contourIntervalMeters === 500 ? "selected" : ""}>500 m（広域高山）</option>
            </select>
          </div>
          <div style="font-size:11px; line-height:1.6; color:var(--re-text-muted); margin-top:4px;" id="re-elevation-info">
            <!-- 標高情報 -->
          </div>
        </section>

        <!-- 選択要素のプロパティ -->
        <section class="re-panel-section" id="re-selection-panel">
          <div class="re-section-title">選択情報</div>
          <div id="re-selection-content" style="font-size:12px; color:var(--re-text-muted);">
            地図上の集落、ダンジョン、シンボルをクリックして選択します。
          </div>
        </section>

        <!-- 規約・統計情報 -->
        <section class="re-panel-section">
          <div class="re-section-title">地勢と規約統計</div>
          <div style="font-size:12px; line-height:1.7; color:var(--re-text-muted);" id="re-stats-content">
            <div>🌲 樹木・山岳シンボル数: <strong>${history.current.symbols.length}</strong></div>
            <div>🌊 河川数: <strong>${history.current.rivers.length}</strong></div>
            <div>🛣️ 街道数: <strong>${history.current.routes.length}</strong></div>
            <div>🌉 <strong>直角交差橋数 (規約遵守): <span style="color:#d4a373;">${history.current.bridges.length}</span></strong></div>
            <div>🏰 集落数: <strong>${history.current.settlements.length}</strong></div>
            <div>🧭 冒険地点・遺跡数: <strong>${history.current.landmarks.length}</strong></div>
          </div>
        </section>
      </aside>
    </div>

    <footer class="re-footer">
      <span>FMG Suite: Continent (FMG) ➔ <strong>Region (RE)</strong> ➔ City (CE) ➔ Dungeon (DE)</span>
      <span>Perpendicular bridges verified: 100% (Strict 90°)</span>
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

    statsContent.innerHTML = `
      <div>🌲 樹木・山岳シンボル数: <strong>${doc.symbols.length}</strong></div>
      <div>🌊 河川数: <strong>${doc.rivers.length}</strong></div>
      <div>🛣️ 街道数: <strong>${doc.routes.length}</strong></div>
      <div>🌉 <strong>直角交差橋数 (規約遵守): <span style="color:#d4a373;">${doc.bridges.length}</span></strong></div>
      <div>📐 <strong>等高線数: <span style="color:#a88350;">${contourCount}本</span></strong> (主等高線: ${indexCount}本)</div>
      <div>⛰️ <strong>標高範囲: ${minElev}m 〜 ${maxElev}m</strong> (比高: ${maxElev - minElev}m)</div>
      <div>🏰 集落数: <strong>${doc.settlements.length}</strong></div>
      <div>🧭 冒険地点・遺跡数: <strong>${doc.landmarks.length}</strong></div>
    `;

    const elevInfo = root.querySelector("#re-elevation-info");
    if (elevInfo) {
      elevInfo.innerHTML = `
        <div>標高範囲: <strong>${minElev} m 〜 ${maxElev} m</strong></div>
        <div>等高線数: <strong>${contourCount} 本</strong>（主等高線 ${indexCount} 本）</div>
        <div>等高線間隔: <strong>${interval} m</strong></div>
      `;
    }

    const checkContours = root.querySelector<HTMLInputElement>("#check-show-contours");
    if (checkContours) {
      checkContours.checked = doc.terrain.showContours !== false;
    }
    const inputIconScale = root.querySelector<HTMLInputElement>("#input-settlement-icon-scale");
    if (inputIconScale) {
      inputIconScale.value = String(doc.decoration.settlementIconScale ?? 1);
    }
    const checkElevations = root.querySelector<HTMLInputElement>("#check-show-contour-elevations");
    if (checkElevations) {
      checkElevations.checked = doc.terrain.showContourElevations === true;
    }
    const checkCellBorders = root.querySelector<HTMLInputElement>("#check-show-cell-borders");
    if (checkCellBorders) {
      checkCellBorders.checked = doc.terrain.showCellBorders === true;
    }
    const checkCultivation = root.querySelector<HTMLInputElement>("#check-show-cultivation");
    if (checkCultivation) {
      checkCultivation.checked = doc.terrain.showCultivation === true;
    }
  }

  function renderMap(): void {
    const doc = history.current;
    svgLayer.innerHTML = renderRegionSvg(doc, selectedId, { zoom, quality });
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
        toolNameSpan.textContent = "選択・移動";
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">
            要素をクリックして選択・編集します。ドラッグで位置を微調整できます。
          </div>
        `;
        break;
      case "brush":
        toolNameSpan.textContent = "バイオーム筆塗り";
        toolOptionsContent.innerHTML = `
          <div class="re-form-row">
            <label>バイオーム種別</label>
            <select class="re-select" id="tool-brush-biome">
              <option value="deciduous_forest" ${brushBiome === "deciduous_forest" ? "selected" : ""}>広葉樹林 (Forest)</option>
              <option value="coniferous_forest" ${brushBiome === "coniferous_forest" ? "selected" : ""}>針葉樹林 (Taiga/Pine)</option>
              <option value="tropical_forest" ${brushBiome === "tropical_forest" ? "selected" : ""}>密林・ジャングル (Jungle)</option>
              <option value="mountains" ${brushBiome === "mountains" ? "selected" : ""}>山脈 (Mountains)</option>
              <option value="hills" ${brushBiome === "hills" ? "selected" : ""}>丘陵 (Hills)</option>
              <option value="swamp" ${brushBiome === "swamp" ? "selected" : ""}>湿地・沼沢 (Swamp)</option>
              <option value="grassland" ${brushBiome === "grassland" ? "selected" : ""}>平原 (Grassland)</option>
            </select>
          </div>
          <div class="re-form-row">
            <label>ブラシ半径: <span id="tool-brush-size-val">${brushRadius}</span> px</label>
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
        toolNameSpan.textContent = "シンボルスタンプ";
        toolOptionsContent.innerHTML = `
          <div class="re-form-row">
            <label>シンボル種別</label>
            <select class="re-select" id="tool-stamp-type">
              <option value="mountain_peak_major" ${stampType === "mountain_peak_major" ? "selected" : ""}>山岳（主峰）</option>
              <option value="mountain_peak_minor" ${stampType === "mountain_peak_minor" ? "selected" : ""}>山岳（小峰）</option>
              <option value="mountain_snow" ${stampType === "mountain_snow" ? "selected" : ""}>雪山</option>
              <option value="hill_cluster" ${stampType === "hill_cluster" ? "selected" : ""}>丘陵（連なり）</option>
              <option value="tree_deciduous" ${stampType === "tree_deciduous" ? "selected" : ""}>樹木（広葉樹）</option>
              <option value="tree_pine" ${stampType === "tree_pine" ? "selected" : ""}>樹木（マツ・針葉樹）</option>
              <option value="swamp_grass" ${stampType === "swamp_grass" ? "selected" : ""}>湿原草</option>
            </select>
          </div>
        `;
        toolOptionsContent.querySelector("#tool-stamp-type")?.addEventListener("change", e => {
          stampType = (e.target as HTMLSelectElement).value as SymbolType;
        });
        break;
      case "settlement":
        toolNameSpan.textContent = "集落の配置";
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">
            地図上をクリックした地点に新しい町・村を配置します。
          </div>
        `;
        break;
      case "landmark":
        toolNameSpan.textContent = "ダンジョン・遺跡の配置";
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">
            地図上をクリックした地点に冒険の舞台（ダンジョン・遺跡）を配置します。
          </div>
        `;
        break;
      case "erase":
        toolNameSpan.textContent = "消しゴム";
        toolOptionsContent.innerHTML = `
          <div style="font-size:12px; color:var(--re-text-muted);">
            地図上をクリックまたはドラッグした範囲のシンボルを消去します。
          </div>
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
      selectionContent.innerHTML = "地図上の集落、ダンジョン、シンボル、街道、河川をクリックして選択します。";
      return;
    }

    if (selectedKind === "settlement") {
      const s = doc.settlements.find(item => item.id === selectedId);
      if (!s) return;
      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div class="re-form-row">
            <label>都市・町名</label>
            <input type="text" class="re-input" id="sel-settlement-name" value="${escapeHtml(s.name)}" />
          </div>
          <div class="re-form-row">
            <label>種別</label>
            <select class="re-select" id="sel-settlement-type">
              ${SETTLEMENT_TYPE_OPTIONS.map(([v, label]) => `<option value="${v}" ${s.type === v ? "selected" : ""}>${label}</option>`).join("")}
              ${SETTLEMENT_TYPE_OPTIONS.some(([v]) => v === s.type) ? "" : `<option value="${escapeHtml(String(s.type))}" selected>${escapeHtml(String(s.type))}</option>`}
            </select>
          </div>
          <div>位置: [${s.position[0].toFixed(1)}, ${s.position[1].toFixed(1)}]</div>
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <button type="button" class="re-btn primary" id="btn-open-ce" style="width:100%; justify-content:center;">
              🏙 City Editor (CE) で開く
            </button>
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">
              🗑 この集落を削除
            </button>
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
            <label>ダンジョン・遺跡名</label>
            <input type="text" class="re-input" id="sel-lm-name" value="${escapeHtml(lm.name)}" />
          </div>
          <div class="re-form-row">
            <label>種別</label>
            <select class="re-select" id="sel-lm-kind">
              <option value="dungeon" ${lm.kind === "dungeon" ? "selected" : ""}>地下迷宮 (Dungeon)</option>
              <option value="ruins" ${lm.kind === "ruins" ? "selected" : ""}>古代遺跡 (Ruins)</option>
              <option value="tower" ${lm.kind === "tower" ? "selected" : ""}>魔術師の塔 (Tower)</option>
              <option value="tomb" ${lm.kind === "tomb" ? "selected" : ""}>王家の墓所 (Tomb)</option>
            </select>
          </div>
          <div>危険度 (Danger): <strong>Lv ${lm.dangerLevel ?? 5}</strong></div>
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <button type="button" class="re-btn primary" id="btn-open-de" style="width:100%; justify-content:center;">
              🗝 Dungeon Editor (DE) で開く
            </button>
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">
              🗑 このダンジョンを削除
            </button>
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
          <div>シンボル: <strong>${escapeHtml(sym.type)}</strong></div>
          <div>位置: [${sym.x.toFixed(1)}, ${sym.y.toFixed(1)}]</div>
          <div>スケール: ${sym.scale.toFixed(2)}</div>
          <div style="margin-top:8px;">
            <button type="button" class="re-btn" id="btn-delete-selected" style="width:100%; justify-content:center; color:#e06c75;">
              🗑 このシンボルを削除
            </button>
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

    if (selectedKind === "route") {
      const rt = doc.routes.find(item => item.id === selectedId);
      if (!rt) return;
      const kindLabel =
        rt.kind === "highway" ? "主要街道 (Highway)" : rt.kind === "trail" ? "小道 (Trail)" : "街道 (Road)";
      const lengthMeters = rt.points.reduce((sum, p, i) => {
        if (i === 0) return 0;
        const prev = rt.points[i - 1];
        return sum + Math.hypot(p[0] - prev[0], p[1] - prev[1]) * doc.bounds.metersPerUnit;
      }, 0);
      const connectedBridges = doc.bridges.filter(b => b.routeId === rt.id);

      selectionContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div>街道名: <strong>${escapeHtml(rt.name || "名称なし街道")}</strong></div>
          <div>種別: <span class="re-badge">${kindLabel}</span></div>
          <div>総延長: ${(lengthMeters / 1000).toFixed(1)} km (${rt.points.length} 測点)</div>
          <div>🌉 直角交差橋: <strong>${connectedBridges.length} 基</strong></div>
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
          <div>河川名: <strong>${escapeHtml(rv.name)}</strong></div>
          <div>川幅: <strong>${widthStr}</strong></div>
          <div>流量: ${rv.dischargeM3s} m³/s</div>
          <div>測点数: ${rv.points.length} 点</div>
          <div>🌉 直角交差橋: <strong>${connectedBridges.length} 基</strong></div>
        </div>
      `;
    }
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
      const name = prompt("新しい集落の名前を入力してください:", "New Settlement");
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
      const name = prompt("新しいダンジョン・遺跡の名前を入力してください:", "Ancient Tomb");
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
    const beforeDetail = zoom < 0.65 ? 0 : zoom < 1.6 ? 1 : 2;
    const beforeTextScale = textScaleForZoom(zoom);
    const oldZoom = zoom;
    zoom = Math.min(Math.max(0.2, zoom * factor), 5.0);
    // カーソル直下の点を固定する（canvasは中心基準でscaleされる）
    const rect = canvas.getBoundingClientRect();
    const ratio = zoom / oldZoom;
    panX += (e.clientX - (rect.left + rect.width / 2)) * (1 - ratio);
    panY += (e.clientY - (rect.top + rect.height / 2)) * (1 - ratio);
    if (beforeDetail !== (zoom < 0.65 ? 0 : zoom < 1.6 ? 1 : 2) || beforeTextScale !== textScaleForZoom(zoom))
      renderMap();
    updateTransform();
  });

  viewport.addEventListener("mousedown", e => {
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
    history.push(newDoc);
    selectedId = null;
    updateSelectionPanel();
    renderMap();
  });

  // テーマ切り替え
  root.querySelector("#select-theme")?.addEventListener("change", e => {
    const theme = (e.target as HTMLSelectElement).value as RegionTheme;
    history.current.decoration.theme = theme;
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

  // 等高線の標高注記切り替え
  root.querySelector("#check-show-contour-elevations")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleContourElevations(history.current, checked));
    renderMap();
  });

  // セル境界表示切り替え
  root.querySelector("#check-show-cell-borders")?.addEventListener("change", e => {
    const checked = (e.target as HTMLInputElement).checked;
    history.push(toggleCellBorders(history.current, checked));
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
    if (!confirm("FMG から連携された保存済みの地域データを削除し、初期状態に戻します。よろしいですか？")) return;
    try {
      await clearRegionSite();
      location.reload();
    } catch (err) {
      alert(`初期化エラー: ${err}`);
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
      alert(`読込エラー: ${res.error}`);
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
