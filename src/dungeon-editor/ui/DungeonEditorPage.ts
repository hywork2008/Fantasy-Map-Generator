import {
  addOpening,
  type EditResult,
  moveBoundary,
  removeOpening,
  setMainEntrance,
  updateOpening,
  updateSpace
} from "../core/commands";
import { accessSummary } from "../core/connectivity";
import { validateDocument } from "../core/document";
import { generateDungeon } from "../core/gen/pipeline";
import { boundaryPoints, distance, hasLocks } from "../core/geometry";
import { DungeonHistory } from "../core/history";
import {
  DEFAULT_SETTINGS,
  type Diagnostic,
  type DungeonDocument,
  type GenerationSettings,
  type Point
} from "../core/types";
import { exportDungeonJson, exportDungeonSvg, readDungeonFile } from "../io/dungeonEditorFile";
import { escapeXml, renderDungeonSvg } from "../render/svg";

type Selection = { kind: "space" | "boundary" | "opening"; id: string } | null;
const numberField = (name: keyof GenerationSettings, label: string, min: number, max: number, step = 0.25): string =>
  `<label class="de-field">${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" required /></label>`;
const field = (name: string, label: string, value: string | number, type = "text"): string =>
  `<label class="de-field">${label}<input name="${name}" type="${type}" value="${escapeXml(String(value))}" ${type === "number" ? 'step="0.25"' : 'maxlength="256"'} /></label>`;
const options = (values: Array<[string, string]>, selected: string): string =>
  values
    .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
    .join("");

export function mountDungeonEditor(root: HTMLElement): { dispose: () => void; getDocument: () => DungeonDocument } {
  const initial = generateDungeon(DEFAULT_SETTINGS);
  if (!initial.ok) throw new Error(initial.diagnostics.map(item => item.message).join(" / "));
  const history = new DungeonHistory(initial.document);
  let selection: Selection = null;
  let tool: "select" | "door" | "pan" = "select";
  let revision = 0;
  let disposed = false;
  let viewBox: [number, number, number, number] | null = null;
  let message = "隊商宿を生成しました。部屋・壁・扉を選択して編集できます。";
  let generationDiagnostics: Diagnostic[] = [];
  let pan: { pointerId: number; x: number; y: number; viewBox: [number, number, number, number] } | null = null;
  const controller = new AbortController();
  root.innerHTML = `<div class="de-app">
    <header class="de-header"><div class="de-brand"><span class="de-brand-mark" aria-hidden="true">▥</span><div><h1>Dungeon Editor</h1><small>FANTASY MAP GENERATOR / INTERIORS</small></div></div><div class="de-header-actions"><button type="button" class="de-button" data-action="undo">戻す</button><button type="button" class="de-button" data-action="redo">やり直す</button><button type="button" class="de-button" data-action="open">JSON を開く</button><button type="button" class="de-button" data-action="save">JSON 保存</button><button type="button" class="de-button" data-action="svg">SVG 出力</button><input type="file" data-file accept=".json,application/json" hidden /></div></header>
    <main class="de-workspace">
      <aside class="de-panel de-generator"><p class="de-eyebrow">01 / GENERATE</p><h2>施設の平面をつくる</h2><p class="de-note">中庭を囲む隊商宿、または部屋と通路のダンジョンを生成します。</p>
        <form class="de-generation-form"><label class="de-field">生成方式<select name="strategy"><option value="caravanserai">隊商宿 / Caravanserai</option><option value="room-corridor">部屋と通路 / Dungeon</option></select></label><label class="de-field">Seed<input name="seed" type="text" maxlength="128" required /></label>
        <div class="de-pair">${numberField("widthMeters", "外周幅 (m)", 12, 250)}${numberField("depthMeters", "外周奥行 (m)", 12, 250)}</div>
        <div data-preset="caravanserai"><div class="de-pair">${numberField("courtyardWidthMeters", "中庭幅 (m)", 3, 220)}${numberField("courtyardDepthMeters", "中庭奥行 (m)", 3, 220)}</div>${numberField("roomBandDepthMeters", "部屋帯の奥行 (m)", 2, 30)}<label class="de-toggle"><input name="symmetric" type="checkbox" /> 入口軸に対して左右対称</label></div>
        <div data-preset="room-corridor" hidden><div class="de-pair">${numberField("roomCount", "部屋数", 1, 50, 1)}${numberField("loopCount", "周回路数", 0, 12, 1)}</div></div>
        <div class="de-pair">${numberField("corridorWidthMeters", "通路有効幅 (m)", 0.75, 10)}${numberField("entranceWidthMeters", "入口有効幅 (m)", 0.75, 10)}</div>
        <label class="de-field">主入口の方位<select name="entranceSide"><option value="south">南</option><option value="north">北</option><option value="east">東</option><option value="west">西</option></select></label>
        <details class="de-advanced"><summary>部屋と壁の寸法</summary>${numberField("minRoomWidthMeters", "最小室幅 (m)", 2, 30)}<div class="de-pair">${numberField("outerWallMeters", "外壁厚 (m)", 0.25, 2)}${numberField("partitionWallMeters", "間仕切り厚 (m)", 0.25, 2)}</div></details>
        <label class="de-toggle" data-fixtures><input name="fixtures" type="checkbox" /> 中庭に井戸を描く</label><div class="de-generate-actions"><button class="de-button de-primary" type="submit">平面を生成</button><button class="de-button" type="button" data-action="random" title="新しい seed で生成">別 Seed</button></div></form>
        <hr class="de-rule" /><p class="de-eyebrow">VIEW</p><label class="de-toggle"><input data-view="grid" type="checkbox" /> 1 m グリッド</label><label class="de-toggle"><input data-view="labels" type="checkbox" checked /> 部屋番号・名称</label><label class="de-toggle"><input data-view="uses" type="checkbox" /> 部屋の用途</label><p class="de-note">寸法は壁中心線を基準にします。通路幅・入口幅は通行できる有効幅です。</p>
      </aside>
      <section class="de-viewport" aria-label="ダンジョン平面"><div class="de-canvas-toolbar"><div class="de-tools"><button class="de-button is-active" type="button" data-tool="select">選択</button><button class="de-button" type="button" data-tool="door">扉を追加</button><button class="de-button" type="button" data-tool="pan">移動</button></div><div class="de-tools"><button class="de-button" type="button" data-action="zoom-out" aria-label="縮小">−</button><button class="de-button" type="button" data-action="zoom-in" aria-label="拡大">＋</button><button class="de-button" type="button" data-action="fit">全体表示</button></div></div><div class="de-canvas"></div><div class="de-map-caption">ホイールで拡大 / 移動ツールでドラッグ</div></section>
      <aside class="de-panel de-inspector-panel"><p class="de-eyebrow">02 / PLAN</p><div class="de-stats"></div><p class="de-eyebrow">03 / INSPECT & EDIT</p><div class="de-inspector"></div><hr class="de-rule" /><p class="de-eyebrow">VALIDATION</p><div class="de-diagnostics"></div></aside>
    </main><footer class="de-footer"><span class="de-status" role="status" aria-live="polite"></span><span>単層平面 · meters</span></footer>
  </div>`;
  const query = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Dungeon Editor: missing ${selector}`);
    return element;
  };
  const form = query<HTMLFormElement>(".de-generation-form");
  const canvas = query<HTMLDivElement>(".de-canvas");
  const inspector = query<HTMLDivElement>(".de-inspector");
  const input = (name: string): HTMLInputElement | HTMLSelectElement => query(`[name="${name}"]`);
  const setStatus = (text: string) => {
    message = text;
    query(".de-status").textContent = text;
  };
  const viewOptions = () => ({
    grid: query<HTMLInputElement>('[data-view="grid"]').checked,
    labels: query<HTMLInputElement>('[data-view="labels"]').checked,
    uses: query<HTMLInputElement>('[data-view="uses"]').checked
  });
  const presetFields = () => {
    const strategy = input("strategy").value;
    for (const section of root.querySelectorAll<HTMLElement>("[data-preset]")) {
      section.hidden = section.dataset.preset !== strategy;
      for (const control of section.querySelectorAll<HTMLInputElement>("input")) control.disabled = section.hidden;
    }
    query<HTMLElement>("[data-fixtures]").hidden = strategy !== "caravanserai";
  };
  const fillSettings = (settings: GenerationSettings) => {
    for (const [name, value] of Object.entries(settings)) {
      const control = input(name);
      if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(value);
      else control.value = String(value);
    }
    presetFields();
  };
  const readSettings = (): GenerationSettings => {
    const settings = { ...DEFAULT_SETTINGS };
    for (const name of Object.keys(settings) as Array<keyof GenerationSettings>) {
      const control = input(name);
      const value =
        control instanceof HTMLInputElement && control.type === "checkbox"
          ? control.checked
          : typeof settings[name] === "number"
            ? Number(control.value)
            : control.value;
      Object.assign(settings, { [name]: value });
    }
    return settings;
  };
  const svg = (): SVGSVGElement => query(".de-canvas svg");
  const fitView = () => {
    const frame = history.document.frame;
    viewBox = [-5, -7, frame.widthMeters + 10, frame.depthMeters + 15];
  };
  const applyView = () => {
    if (viewBox) svg().setAttribute("viewBox", viewBox.join(" "));
  };
  const zoom = (factor: number, anchor?: Point) => {
    if (!viewBox) fitView();
    const [x, y, w, h] = viewBox!;
    if (w * factor < 5 || w * factor > 1500) return;
    const center: Point = anchor ?? [x + w / 2, y + h / 2];
    viewBox = [center[0] + (x - center[0]) * factor, center[1] + (y - center[1]) * factor, w * factor, h * factor];
    applyView();
  };
  const mapPoint = (event: MouseEvent | PointerEvent | WheelEvent): Point => {
    const matrix = svg().getScreenCTM();
    if (matrix) {
      const point = svg().createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const converted = point.matrixTransform(matrix.inverse());
      return [converted.x, converted.y];
    }
    return [0, 0];
  };
  const showInspector = () => {
    const level = history.document.levels[0];
    if (
      !selection ||
      !Object.hasOwn(
        selection.kind === "space" ? level.spaces : selection.kind === "opening" ? level.openings : level.boundaries,
        selection.id
      )
    ) {
      selection = null;
      inspector.innerHTML =
        '<div class="de-empty">部屋を選ぶと名称・用途を編集できます。壁を選ぶと扉の追加や壁の移動、扉を選ぶと位置・幅・状態を変更できます。</div>';
      return;
    }
    const meta = `<p class="de-selected-meta">${escapeXml(selection.id)}</p>`;
    if (selection.kind === "space") {
      const space = level.spaces[selection.id];
      inspector.innerHTML = `<h2>${escapeXml(space.use || "部屋")}</h2>${meta}${field("edit-label", "表示名（空欄は部屋番号）", space.label)}${field("edit-use", "用途", space.use)}<button type="button" class="de-button" data-action="space-apply" ${space.locked ? "disabled" : ""}>名称・用途を保存</button><button type="button" class="de-button" data-action="space-lock">${space.locked ? "ロックを解除" : "部屋をロック"}</button><p class="de-note">${space.roof === "open" ? "屋根のない空間" : "屋根のある空間"} / ${space.locked ? "ロック中" : "編集可能"}</p>`;
    } else if (selection.kind === "opening") {
      const opening = level.openings[selection.id];
      inspector.innerHTML = `<h2>${opening.kind === "gate" ? "門" : "扉・開口"}</h2>${meta}${field("edit-offset", "壁の始点からの距離 (m)", opening.offsetMeters, "number")}${field("edit-width", "有効幅 (m)", opening.widthMeters, "number")}<label class="de-field">種類<select name="edit-kind">${options(
        [
          ["door", "扉"],
          ["gate", "門"],
          ["arch", "アーチ"]
        ],
        opening.kind
      )}</select></label><label class="de-field">状態<select name="edit-state">${options(
        [
          ["closed", "閉じている"],
          ["open", "開いている"],
          ["locked", "施錠"]
        ],
        opening.state
      )}</select></label><label class="de-field">見え方<select name="edit-visibility">${options(
        [
          ["visible", "通常"],
          ["secret", "隠し扉"]
        ],
        opening.visibility
      )}</select></label><button type="button" class="de-button" data-action="opening-apply" ${opening.locked ? "disabled" : ""}>扉の変更を保存</button><button type="button" class="de-button" data-action="opening-lock">${opening.locked ? "ロックを解除" : "扉をロック"}</button>${level.entrances.some(item => item.openingId === opening.id) ? '<button type="button" class="de-button" data-action="main-entrance">主入口に設定</button>' : ""}<button type="button" class="de-button de-danger" data-action="opening-remove" ${opening.locked ? "disabled" : ""}>扉を削除</button>`;
    } else {
      const boundary = level.boundaries[selection.id];
      inspector.innerHTML = `<h2>共有壁</h2>${meta}<p class="de-note">長さ ${distance(...boundaryPoints(level, boundary)).toFixed(2)} m / 壁厚 ${boundary.thicknessMeters} m</p><button type="button" class="de-button" data-action="boundary-door">中央に扉を追加</button>${field("edit-delta", "移動距離 (m)", 0.25, "number")}<button type="button" class="de-button" data-action="boundary-move">壁を移動</button><p class="de-note">縦壁は右、横壁は下が正方向です。同一直線で連続する壁を一緒に動かします。</p>`;
    }
  };
  const render = () => {
    canvas.innerHTML = renderDungeonSvg(history.document, {
      ...viewOptions(),
      selectedId: selection?.id,
      interactive: true
    });
    if (!viewBox) fitView();
    applyView();
    const level = history.document.levels[0];
    const summary = accessSummary(level);
    const rooms = Object.values(level.spaces).filter(space => space.kind === "room").length;
    query(".de-stats").innerHTML =
      `<div class="de-stat"><strong>${rooms}</strong><span>部屋</span></div><div class="de-stat"><strong>${Object.keys(level.openings).length}</strong><span>扉・門</span></div><div class="de-stat"><strong>${summary.loops}</strong><span>周回路</span></div>`;
    showInspector();
    const diagnostics = [...generationDiagnostics, ...validateDocument(history.document)];
    query(".de-diagnostics").innerHTML = diagnostics.length
      ? diagnostics
          .slice(0, 12)
          .map(
            item =>
              `<button type="button" class="de-diagnostic" ${item.targetId ? `data-target-id="${escapeXml(item.targetId)}"` : "disabled"}>${escapeXml(item.message)}</button>`
          )
          .join("") + (diagnostics.length > 12 ? `<p class="de-note">ほか ${diagnostics.length - 12} 件</p>` : "")
      : '<div class="de-valid">✓ 平面と扉の整合性を確認済み<br />✓ 全必須室へ主入口から到達可能</div>';
    query<HTMLButtonElement>('[data-action="undo"]').disabled = !history.canUndo;
    query<HTMLButtonElement>('[data-action="redo"]').disabled = !history.canRedo;
    setStatus(message);
  };
  const commit = (result: EditResult, label: string) => {
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
    history.commit(result.document, label);
    revision++;
    generationDiagnostics = [];
    setStatus(label);
    render();
  };
  const generate = () => {
    if (hasLocks(history.document)) {
      setStatus("ロック済みの部屋・扉があります。解除してから再生成してください。");
      return;
    }
    const requested = readSettings();
    const result = generateDungeon(requested);
    if (!result.ok) {
      generationDiagnostics = result.diagnostics;
      setStatus(result.diagnostics[0]?.message ?? "生成できませんでした。");
      render();
      return;
    }
    selection = null;
    viewBox = null;
    commit({ ok: true, document: result.document }, "平面を再生成しました。");
    fillSettings(result.document.generation.settings);
    const effective = result.document.generation.settings;
    if (
      effective.strategy === "caravanserai" &&
      (effective.courtyardWidthMeters !== requested.courtyardWidthMeters ||
        effective.courtyardDepthMeters !== requested.courtyardDepthMeters)
    )
      setStatus(
        `平面を再生成しました。中庭寸法を ${effective.courtyardWidthMeters} × ${effective.courtyardDepthMeters} m に調整しました。`
      );
  };
  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("button");
    if (button?.disabled) return;
    if (button?.dataset.tool) {
      tool = button.dataset.tool as typeof tool;
      for (const item of root.querySelectorAll<HTMLButtonElement>("[data-tool]"))
        item.classList.toggle("is-active", item.dataset.tool === tool);
      canvas.classList.toggle("is-door", tool === "door");
      canvas.classList.toggle("is-pan", tool === "pan");
      setStatus(
        tool === "door"
          ? "壁をクリックすると幅 1.25 m の扉を追加します。"
          : tool === "pan"
            ? "平面をドラッグして表示位置を移動します。"
            : "部屋・壁・扉を選択できます。"
      );
      return;
    }
    const action = button?.dataset.action;
    if (action) {
      const level = history.document.levels[0];
      switch (action) {
        case "undo":
        case "redo":
          if (action === "undo") history.undo();
          else history.redo();
          revision++;
          selection = null;
          generationDiagnostics = [];
          viewBox = null;
          fillSettings(history.document.generation.settings);
          setStatus(`${action === "undo" ? "戻しました" : "やり直しました"} / ${history.label}`);
          render();
          break;
        case "fit":
          fitView();
          applyView();
          break;
        case "zoom-in":
          zoom(0.8);
          break;
        case "zoom-out":
          zoom(1.25);
          break;
        case "open":
          query<HTMLInputElement>("[data-file]").click();
          break;
        case "save":
          exportDungeonJson(history.document);
          setStatus("編集可能な JSON を保存しました。");
          break;
        case "svg":
          exportDungeonSvg(history.document, viewOptions());
          setStatus("SVG を出力しました。");
          break;
        case "random":
          input("seed").value = `dungeon-${crypto.randomUUID().slice(0, 8)}`;
          generate();
          break;
        case "space-apply":
          if (selection?.kind === "space")
            commit(
              updateSpace(history.document, selection.id, {
                label: input("edit-label").value,
                use: input("edit-use").value
              }),
              "部屋の名称・用途を変更しました。"
            );
          break;
        case "space-lock":
          if (selection?.kind === "space")
            commit(
              updateSpace(history.document, selection.id, { locked: !level.spaces[selection.id].locked }),
              "部屋のロックを変更しました。"
            );
          break;
        case "opening-apply":
          if (selection?.kind === "opening")
            commit(
              updateOpening(history.document, selection.id, {
                offsetMeters: Number(input("edit-offset").value),
                widthMeters: Number(input("edit-width").value),
                kind: input("edit-kind").value as "door" | "gate" | "arch",
                state: input("edit-state").value as "open" | "closed" | "locked",
                visibility: input("edit-visibility").value as "visible" | "secret"
              }),
              "扉の位置・幅・状態を変更しました。"
            );
          break;
        case "opening-lock":
          if (selection?.kind === "opening")
            commit(
              updateOpening(history.document, selection.id, { locked: !level.openings[selection.id].locked }),
              "扉のロックを変更しました。"
            );
          break;
        case "opening-remove":
          if (selection?.kind === "opening")
            commit(removeOpening(history.document, selection.id), "扉を削除しました。");
          break;
        case "main-entrance":
          if (selection?.kind === "opening")
            commit(setMainEntrance(history.document, selection.id), "主入口を変更しました。");
          break;
        case "boundary-door":
          if (selection?.kind === "boundary") {
            const boundary = level.boundaries[selection.id];
            commit(
              addOpening(history.document, boundary.id, distance(...boundaryPoints(level, boundary)) / 2),
              "壁の中央に扉を追加しました。"
            );
          }
          break;
        case "boundary-move":
          if (selection?.kind === "boundary")
            commit(
              moveBoundary(history.document, selection.id, Number(input("edit-delta").value)),
              "共有壁を移動しました。"
            );
          break;
      }
      return;
    }
    if (button?.dataset.targetId) {
      const id = button.dataset.targetId;
      const level = history.document.levels[0];
      selection = Object.hasOwn(level.spaces, id)
        ? { kind: "space", id }
        : Object.hasOwn(level.openings, id)
          ? { kind: "opening", id }
          : Object.hasOwn(level.boundaries, id)
            ? { kind: "boundary", id }
            : null;
      render();
      return;
    }
    if (!canvas.contains(target) || tool === "pan") return;
    const openingId = target.closest<SVGElement>("[data-opening-id]")?.dataset.openingId;
    const boundaryId = target.closest<SVGElement>("[data-boundary-id]")?.dataset.boundaryId;
    const spaceId = target.closest<SVGElement>("[data-space-id]")?.dataset.spaceId;
    if (tool === "door" && boundaryId) {
      const boundary = history.document.levels[0].boundaries[boundaryId];
      const [a, b] = boundaryPoints(history.document.levels[0], boundary);
      const point = mapPoint(event);
      const offset = ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / distance(a, b);
      const result = addOpening(history.document, boundaryId, offset);
      if (result.ok) {
        const id = Object.keys(result.document.levels[0].openings).find(
          id => !Object.hasOwn(history.document.levels[0].openings, id)
        )!;
        selection = { kind: "opening", id };
      }
      commit(result, "壁に扉を追加しました。");
      return;
    }
    selection = openingId
      ? { kind: "opening", id: openingId }
      : boundaryId
        ? { kind: "boundary", id: boundaryId }
        : spaceId
          ? { kind: "space", id: spaceId }
          : null;
    render();
  };
  root.addEventListener("click", handleClick, { signal: controller.signal });
  root.addEventListener(
    "submit",
    event => {
      if (event.target === form) {
        event.preventDefault();
        generate();
      }
    },
    { signal: controller.signal }
  );
  root.addEventListener(
    "change",
    async event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (target.name === "strategy") {
        presetFields();
        return;
      }
      if (target.dataset.view) {
        render();
        return;
      }
      if (target.hasAttribute("data-file")) {
        const file = (target as HTMLInputElement).files?.[0];
        if (!file) return;
        const openingRevision = revision;
        const result = await readDungeonFile(file);
        (target as HTMLInputElement).value = "";
        if (disposed) return;
        if (revision !== openingRevision) {
          setStatus("読込中に編集されたため、ファイルの反映を中止しました。もう一度開いてください。");
          return;
        }
        if (!result.ok) {
          setStatus(result.message);
          return;
        }
        selection = null;
        viewBox = null;
        commit({ ok: true, document: result.document }, "ダンジョン JSON を開きました。");
        fillSettings(result.document.generation.settings);
      }
    },
    { signal: controller.signal }
  );
  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.9 : 1.1, mapPoint(event));
    },
    { passive: false, signal: controller.signal }
  );
  canvas.addEventListener(
    "pointerdown",
    event => {
      if (tool !== "pan" && event.button !== 1) return;
      event.preventDefault();
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewBox: [...viewBox!] };
      canvas.setPointerCapture(event.pointerId);
    },
    { signal: controller.signal }
  );
  canvas.addEventListener(
    "pointermove",
    event => {
      if (!pan || pan.pointerId !== event.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(pan.viewBox[2] / rect.width, pan.viewBox[3] / rect.height);
      viewBox = [
        pan.viewBox[0] - (event.clientX - pan.x) * ratio,
        pan.viewBox[1] - (event.clientY - pan.y) * ratio,
        pan.viewBox[2],
        pan.viewBox[3]
      ];
      applyView();
    },
    { signal: controller.signal }
  );
  const stopPan = () => {
    pan = null;
  };
  canvas.addEventListener("pointerup", stopPan, { signal: controller.signal });
  canvas.addEventListener("pointercancel", stopPan, { signal: controller.signal });
  root.addEventListener(
    "keydown",
    event => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        query<HTMLButtonElement>(`[data-action="${event.shiftKey ? "redo" : "undo"}"]`).click();
      }
      if (event.key === "Escape") {
        selection = null;
        render();
      }
      if (
        (event.key === "Enter" || event.key === " ") &&
        target instanceof SVGElement &&
        (target.hasAttribute("data-space-id") ||
          target.hasAttribute("data-boundary-id") ||
          target.hasAttribute("data-opening-id"))
      ) {
        event.preventDefault();
        selection = target.dataset.spaceId
          ? { kind: "space", id: target.dataset.spaceId }
          : target.dataset.boundaryId
            ? { kind: "boundary", id: target.dataset.boundaryId }
            : { kind: "opening", id: target.dataset.openingId! };
        render();
      }
    },
    { signal: controller.signal }
  );
  fillSettings(DEFAULT_SETTINGS);
  render();
  return {
    dispose: () => {
      disposed = true;
      controller.abort();
      root.replaceChildren();
    },
    getDocument: () => history.document
  };
}
