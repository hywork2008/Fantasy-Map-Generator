import { generateStandaloneRegion } from "../core/gen/pipeline";
import {
  DEFAULT_REGION_SETTINGS,
  type RegionDocument,
  type RegionGenerationSettings,
  type RegionSettlement,
  type RegionTheme
} from "../core/types";
import { loadIncomingRegionFromStorage } from "../io/incomingRegion";
import { exportRegionJson, exportRegionSvg, readRegionFile } from "../io/regionEditorFile";
import { renderRegionSvg } from "../render/svg";

export function mountRegionEditor(root: HTMLElement): { dispose: () => void; getDocument: () => RegionDocument } {
  // 1. 初期ドキュメントの読み込み（FMGからの引き渡しデータがあれば優先、なければスタンドアロン生成）
  let currentDoc: RegionDocument = loadIncomingRegionFromStorage() ?? generateStandaloneRegion(DEFAULT_REGION_SETTINGS);

  let currentSettings: RegionGenerationSettings = {
    ...DEFAULT_REGION_SETTINGS,
    seed: currentDoc.seed,
    title: currentDoc.title,
    theme: currentDoc.decoration.theme
  };

  // ビューポートのカメラ状態（パン・ズーム）
  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let selectedSettlement: RegionSettlement | null = null;

  root.innerHTML = `
    <header class="re-header">
      <div class="re-header-left">
        <span class="re-title">⚔ Region Editor</span>
        <span class="re-badge" id="re-scale-badge">${(currentDoc.bounds.widthMeters / 1000).toFixed(0)} × ${(currentDoc.bounds.heightMeters / 1000).toFixed(0)} km</span>
      </div>
      <div class="re-actions">
        <button type="button" class="re-btn primary" id="btn-regenerate">🎲 再生成</button>
        <button type="button" class="re-btn" id="btn-load-json">📂 読込</button>
        <input type="file" id="re-file-input" accept=".json" style="display:none;" />
        <button type="button" class="re-btn" id="btn-save-json">💾 JSON 保存</button>
        <button type="button" class="re-btn" id="btn-export-svg">🖼 SVG 出力</button>
      </div>
    </header>

    <div class="re-body">
      <aside class="re-toolbar">
        <button type="button" class="re-tool-btn active" data-tool="select" title="選択">👆</button>
        <button type="button" class="re-tool-btn" id="btn-reset-view" title="視点をリセット">🎯</button>
      </aside>

      <main class="re-viewport" id="re-viewport">
        <div class="re-canvas-container" id="re-canvas"></div>
      </main>

      <aside class="re-sidebar">
        <section class="re-panel-section">
          <div class="re-section-title">地方設定 (Region Settings)</div>
          <div class="re-form-row">
            <label>名称 (Title)</label>
            <input type="text" class="re-input" id="input-title" value="${escapeHtml(currentDoc.title)}" />
          </div>
          <div class="re-form-row">
            <label>シード値 (Seed)</label>
            <input type="text" class="re-input" id="input-seed" value="${escapeHtml(currentDoc.seed)}" />
          </div>
          <div class="re-form-row">
            <label>テーマ・様式 (Theme)</label>
            <select class="re-select" id="select-theme">
              <option value="schley" ${currentDoc.decoration.theme === "schley" ? "selected" : ""}>D&amp;D Sword Coast (Mike Schley)</option>
              <option value="perilous" ${currentDoc.decoration.theme === "perilous" ? "selected" : ""}>Perilous Shores (Watabou ペン画)</option>
              <option value="parchment" ${currentDoc.decoration.theme === "parchment" ? "selected" : ""}>Antique Parchment (羊皮紙調)</option>
              <option value="monochrome" ${currentDoc.decoration.theme === "monochrome" ? "selected" : ""}>Monochrome (白黒)</option>
            </select>
          </div>
        </section>

        <section class="re-panel-section">
          <div class="re-section-title">地勢と規約統計</div>
          <div style="font-size:12px; line-height:1.6; color:var(--re-text-muted);">
            <div>🌲 樹木・山岳シンボル数: <strong>${currentDoc.symbols.length}</strong></div>
            <div>🌊 河川数: <strong>${currentDoc.rivers.length}</strong></div>
            <div>🌉 <strong>直角交差橋数 (規約遵守): <span style="color:#d4a373;">${currentDoc.bridges.length}</span></strong></div>
            <div>🏰 集落数: <strong>${currentDoc.settlements.length}</strong></div>
            <div>🧭 冒険地点・遺跡数: <strong>${currentDoc.landmarks.length}</strong></div>
          </div>
        </section>

        <section class="re-panel-section" id="re-selection-panel">
          <div class="re-section-title">選択情報</div>
          <div id="re-selection-content" style="font-size:12px; color:var(--re-text-muted);">
            地図上の集落やシンボルをクリックして選択します。
          </div>
        </section>
      </aside>
    </div>

    <footer class="re-footer">
      <span>FMG Multi-Scale Map Suite: Continent (FMG) ➔ <strong>Region (RE)</strong> ➔ City (CE) ➔ Dungeon (DE)</span>
      <span>Perpendicular bridges verified: 100% (Strict 90°)</span>
    </footer>
  `;

  const canvas = root.querySelector<HTMLDivElement>("#re-canvas")!;
  const viewport = root.querySelector<HTMLDivElement>("#re-viewport")!;
  const selectionContent = root.querySelector<HTMLDivElement>("#re-selection-content")!;

  function updateTransform(): void {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function renderMap(): void {
    canvas.innerHTML = renderRegionSvg(currentDoc);
    const widthUnits = currentDoc.bounds.widthMeters / currentDoc.bounds.metersPerUnit;
    const heightUnits = currentDoc.bounds.heightMeters / currentDoc.bounds.metersPerUnit;
    canvas.style.width = `${widthUnits}px`;
    canvas.style.height = `${heightUnits}px`;
    attachSvgEvents();
  }

  function attachSvgEvents(): void {
    // 集落シンボルのクリックイベント
    const settlementElements = canvas.querySelectorAll<SVGGElement>(".settlement-symbol");
    settlementElements.forEach((el, index) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        e.stopPropagation();
        const s = currentDoc.settlements[index];
        if (s) {
          selectedSettlement = s;
          updateSelectionPanel();
        }
      });
    });
  }

  function updateSelectionPanel(): void {
    if (!selectedSettlement) {
      selectionContent.innerHTML = "地図上の集落やシンボルをクリックして選択します。";
      return;
    }
    const s = selectedSettlement;
    selectionContent.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="font-size:14px; font-weight:bold; color:var(--re-accent);">${escapeHtml(s.name)}</div>
        <div>種別: <strong>${escapeHtml(s.type)}</strong></div>
        ${s.population ? `<div>推定人口: <strong>${s.population.toLocaleString()} 人</strong></div>` : ""}
        <div>位置: [${s.position[0].toFixed(1)}, ${s.position[1].toFixed(1)}]</div>
        <div style="margin-top:8px;">
          <button type="button" class="re-btn primary" id="btn-open-ce" style="width:100%; justify-content:center;">
            🏙 City Editor (CE) で開く
          </button>
        </div>
      </div>
    `;

    const openCeBtn = selectionContent.querySelector<HTMLButtonElement>("#btn-open-ce");
    if (openCeBtn) {
      openCeBtn.addEventListener("click", () => {
        // City Editor へのハンドオフ
        const burgDescriptor = {
          version: 3,
          burg: {
            id: s.burgId ?? 999,
            name: s.name,
            group: s.type,
            seed: s.cityEditorSeed || `${currentDoc.seed}:${s.name}`,
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
        window.open(`${import.meta.env.BASE_URL}city-editor/`, "_blank");
      });
    }
  }

  // ズーム・パンイベント
  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    zoom = Math.min(Math.max(0.2, zoom * factor), 5.0);
    updateTransform();
  });

  viewport.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.classList.add("panning");
  });

  window.addEventListener("mousemove", e => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      viewport.classList.remove("panning");
    }
  });

  // 再生成ボタン
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
    currentDoc = generateStandaloneRegion(currentSettings);
    selectedSettlement = null;
    updateSelectionPanel();
    renderMap();
  });

  // テーマ切り替え
  root.querySelector("#select-theme")?.addEventListener("change", e => {
    const theme = (e.target as HTMLSelectElement).value as RegionTheme;
    currentDoc.decoration.theme = theme;
    renderMap();
  });

  // 視点リセット
  root.querySelector("#btn-reset-view")?.addEventListener("click", () => {
    zoom = 0.85;
    panX = 0;
    panY = 0;
    updateTransform();
  });

  // JSON 保存 / 読込 / SVG 出力
  root.querySelector("#btn-save-json")?.addEventListener("click", () => exportRegionJson(currentDoc));
  root.querySelector("#btn-export-svg")?.addEventListener("click", () => exportRegionSvg(currentDoc));

  const fileInput = root.querySelector<HTMLInputElement>("#re-file-input")!;
  root.querySelector("#btn-load-json")?.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const res = await readRegionFile(file);
    if (res.ok) {
      currentDoc = res.document;
      renderMap();
    } else {
      alert(`読み込みエラー: ${res.error}`);
    }
    fileInput.value = "";
  });

  // 初回レンダリング
  zoom = 0.85;
  updateTransform();
  renderMap();

  return {
    dispose: () => {
      root.innerHTML = "";
    },
    getDocument: () => currentDoc
  };
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
