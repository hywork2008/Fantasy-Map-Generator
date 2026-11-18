import type * as THREE from "three";
import { collectModelMetrics } from "./modelMetrics";

/** Live renderer work includes the ground; resident complexity covers the model alone. */
export function mountPerformancePanel(host: HTMLElement, getModel: () => THREE.Object3D | null) {
  const panel = document.createElement("details");
  panel.className = "bv-performance";
  const summary = document.createElement("summary");
  summary.textContent = "Performance · current view";
  const output = document.createElement("pre");
  const note = document.createElement("p");
  note.textContent =
    "Draw calls and rendered triangles include ground and depend on the camera. CPU time measures render submission, not GPU completion. Frame intervals include browser and UI work.";
  panel.append(summary, output, note);
  host.append(panel);
  let timer: ReturnType<typeof setInterval> | undefined;
  let model: THREE.Object3D | null = null;
  let metrics: ReturnType<typeof collectModelMetrics> | null = null;
  let frame: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    width: number;
    height: number;
    cpuMs: number;
  } | null = null;
  let intervals: number[] = [];
  let previous = 0;
  const reset = () => {
    frame = null;
    previous = 0;
    intervals = [];
  };
  const refresh = () => {
    const current = getModel();
    if (current !== model) {
      model = current;
      metrics = current ? collectModelMetrics(current) : null;
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
    const n = (value: number | null | undefined) =>
      value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    output.textContent = [
      `Draw calls: ${n(frame?.calls)}`,
      `Rendered triangles: ${n(frame?.triangles)}`,
      `Render CPU: ${n(frame?.cpuMs)} ms`,
      `Frame interval p95: ${n(p95)} ms`,
      `Drawing buffer: ${frame ? `${frame.width} × ${frame.height} px` : "—"}`,
      `GPU geometries / textures: ${n(frame?.geometries)} / ${n(frame?.textures)}`,
      `Model meshes: ${n(metrics?.meshes)}`,
      `Model triangles: ${n(metrics?.triangles)}`,
      `Model vertices: ${n(metrics?.vertices)}`,
      `Model geometries / materials: ${n(metrics?.geometries)} / ${n(metrics?.materials)}`
    ].join("\n");
  };
  panel.addEventListener("toggle", () => {
    clearInterval(timer);
    reset();
    if (!panel.open) return;
    refresh();
    timer = setInterval(refresh, 1000);
  });
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("pagehide", () => clearInterval(timer));
  return {
    get open() {
      return panel.open && !document.hidden;
    },
    reset,
    sample(renderer: THREE.WebGLRenderer, started: number) {
      const now = performance.now();
      // Changing model starts a fresh timing window rather than retaining old samples.
      if (model !== getModel()) {
        reset();
        refresh();
      }
      if (previous) {
        intervals.push(now - previous);
        if (intervals.length > 120) intervals.shift();
      }
      previous = now;
      frame = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        cpuMs: now - started
      };
    }
  };
}
