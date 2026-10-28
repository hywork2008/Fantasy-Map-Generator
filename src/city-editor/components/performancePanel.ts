import { editorText } from "../../i18n/editorMessages";
import { type City3dPerformanceSnapshot, collectSvgMetrics } from "../renderers/renderMetrics";
import type { CityDocument } from "../types/document";

interface Options {
  host: HTMLElement;
  map: HTMLElement;
  scope: { listen(target: EventTarget, type: string, handler: (event: Event) => void): void };
  getDocument(): CityDocument;
  getSettings(): object;
  get3d(): City3dPerformanceSnapshot | null;
}

export function mountPerformancePanel(options: Options) {
  const panel = document.createElement("details");
  panel.className = "ce-performance";
  const summary = document.createElement("summary");
  summary.textContent = editorText("cityEditor.messages.performancePanel");
  const output = document.createElement("pre");
  const note = document.createElement("p");
  note.textContent = editorText("cityEditor.messages.performanceHelp");
  const explanation = document.createElement("details");
  const explanationSummary = document.createElement("summary");
  explanationSummary.textContent = editorText("cityEditor.messages.performanceMeasurementHelp");
  explanation.append(explanationSummary, note);
  const hardware = document.createElement("input");
  hardware.placeholder = editorText("cityEditor.messages.performanceHardware");
  hardware.setAttribute("aria-label", hardware.placeholder);
  const notes = document.createElement("input");
  notes.placeholder = editorText("cityEditor.messages.performanceNotes");
  notes.setAttribute("aria-label", notes.placeholder);
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = editorText("cityEditor.messages.performanceExport");
  panel.append(summary, output, hardware, notes, download, explanation);
  options.host.append(panel);
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let raf = 0;
  let previous = 0;
  let intervals: number[] = [];
  let dirty = true;
  let svgMetrics: ReturnType<typeof collectSvgMetrics> | null = null;
  let lastMode = "";
  let snapshot: object = {};
  const observer = new MutationObserver(() => {
    dirty = true;
  });
  const heartbeat = (time: number) => {
    if (previous && !document.hidden) {
      intervals.push(time - previous);
      if (intervals.length > 120) intervals.shift();
    }
    previous = document.hidden ? 0 : time;
    raf = requestAnimationFrame(heartbeat);
  };
  const update = () => {
    const three = options.get3d();
    const mode = three ? "3D" : "2D";
    if (lastMode !== mode) {
      intervals = [];
      previous = 0;
      lastMode = mode;
    }
    const svg = options.map.querySelector("svg");
    if (!three && dirty) {
      svgMetrics = svg ? collectSvgMetrics(svg) : null;
      dirty = false;
    }
    const rect = options.host.getBoundingClientRect();
    const city = options.getDocument();
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
    const frame = three?.frame;
    const context = {
      mode,
      population: city.populationPlan?.settings.targetPopulation ?? city.populationReport?.targetPopulation ?? null,
      viewport: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        devicePixelRatio: window.devicePixelRatio
      },
      city: {
        seed: city.fabric?.generation?.seed ?? city.fabric?.seed ?? null,
        frame: city.frame,
        historicalPeriod: city.historicalPeriod ?? null,
        gridKind: city.gridKind ?? null,
        buildingPattern: city.buildingPattern ?? null
      },
      settings: {
        ...options.getSettings(),
        housingDisplay: city.populationPlan?.settings.housingDisplay ?? null,
        displayDwellings: city.populationPlan?.displayDwellings ?? null,
        svgViewBox: svg?.getAttribute("viewBox") ?? null
      },
      browser: navigator.userAgent,
      logicalProcessors: navigator.hardwareConcurrency,
      uiFrameIntervalP95Ms: p95,
      svg: three ? null : svgMetrics,
      three
    };
    snapshot = { capturedAt: new Date().toISOString(), hardware: hardware.value, notes: notes.value, ...context };
    const n = (value: number | null | undefined) =>
      value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    const row = (key: Parameters<typeof editorText>[0], value: string) => `${editorText(key)}: ${value}`;
    const rows = [
      `${mode} · ${row("cityEditor.messages.performancePopulation", n(context.population))}`,
      `${context.viewport.width} × ${context.viewport.height} CSS px · DPR ${n(window.devicePixelRatio)}`,
      row("cityEditor.messages.performanceUiInterval", `${n(p95)} ms`)
    ];
    if (three) {
      rows.push(
        row("cityEditor.messages.performanceQuality", three.quality ?? "—"),
        row("cityEditor.messages.performanceBuildings", n(three.buildings)),
        row("cityEditor.messages.performanceDrawCalls", n(frame?.calls)),
        row("cityEditor.messages.performanceTriangles", n(frame?.triangles)),
        row("cityEditor.messages.performanceLinesPoints", `${n(frame?.lines)} / ${n(frame?.points)}`),
        row("cityEditor.messages.performanceCpu", `${n(frame?.cpuMs)} ms`),
        row(
          "cityEditor.messages.performanceFrameAge",
          frame ? `${n((performance.now() - frame.sampledAt) / 1000)} s` : "—"
        ),
        row("cityEditor.messages.performanceBuffer", frame ? `${frame.width} × ${frame.height} px` : "—"),
        row("cityEditor.messages.performanceMeshesInstances", `${n(three.scene.meshes)} / ${n(three.scene.instances)}`),
        row("cityEditor.messages.performanceGeometryTextures", `${n(frame?.geometries)} / ${n(frame?.textures)}`),
        row(
          "cityEditor.messages.performanceVerticesMaterials",
          `${n(three.scene.vertices)} / ${n(three.scene.materials)}`
        )
      );
      if (three.housing)
        rows.push(
          row(
            "cityEditor.messages.performanceDetailedHousing",
            `${n(three.housing.buildings)} / ${n(three.housing.triangles)}`
          )
        );
      if (three.forest)
        rows.push(
          row(
            "cityEditor.forest.performance",
            editorText("cityEditor.forest.stats3d", {
              area: n(three.forest.areaM2 / 10000),
              trees: n(three.forest.trees),
              triangles: n(three.forest.triangles),
              calls: n(three.forest.calls)
            })
          ),
          row(
            "cityEditor.forest.autoPerformance",
            `${three.forestQuality?.requested ?? three.forest.quality} / ${three.forest.quality}`
          ),
          row("cityEditor.forest.framePerformance", n(three.forestQuality?.motionIntervalP95Ms)),
          row("cityEditor.forest.detailPerformance", n(three.forest.detailedTrees))
        );
    } else if (svgMetrics) {
      rows.push(
        row("cityEditor.messages.performanceQuality", svgMetrics.quality ?? "—"),
        row("cityEditor.messages.performanceBuildings", n(svgMetrics.buildings)),
        row("cityEditor.messages.performanceSvgElements", n(svgMetrics.elements)),
        row("cityEditor.messages.performanceSvgCpu", `${n(svgMetrics.redrawCpuMs)} ms`),
        ...Object.entries(svgMetrics.tags)
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => `  ${tag}: ${n(count)}`),
        row("cityEditor.messages.performancePaths", `${n(svgMetrics.pathCommands)} / ${n(svgMetrics.pathCharacters)}`),
        row("cityEditor.messages.performancePoints", n(svgMetrics.points))
      );
      if (svgMetrics.forest)
        rows.push(
          row(
            "cityEditor.forest.performance",
            editorText("cityEditor.forest.stats2d", {
              area: n(svgMetrics.forest.areaM2 / 10000),
              elements: n(svgMetrics.forest.elements)
            })
          )
        );
    }
    output.textContent = rows.join("\n");
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    cancelAnimationFrame(raf);
    raf = 0;
    observer.disconnect();
    previous = 0;
    intervals = [];
  };
  options.scope.listen(panel, "toggle", () => {
    stop();
    if (!panel.open || disposed) return;
    dirty = true;
    observer.observe(options.map, { childList: true, subtree: true, attributes: true });
    update();
    timer = setInterval(update, 1000);
    raf = requestAnimationFrame(heartbeat);
  });
  options.scope.listen(document, "visibilitychange", () => {
    previous = 0;
    intervals = [];
  });
  options.scope.listen(download, "click", () => {
    dirty = true;
    update();
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ce-performance-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      panel.remove();
    }
  };
}
