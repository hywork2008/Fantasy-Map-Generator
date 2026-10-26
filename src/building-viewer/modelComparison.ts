import type * as THREE from "three";
import { collectModelMetrics, type MetricsResponse, type ModelMetrics, type ModelQuality } from "./modelMetrics";

const ROWS: [keyof ModelMetrics, string][] = [
  ["meshes", "Meshes"],
  ["triangles", "Triangles"],
  ["vertices", "Vertices"],
  ["geometries", "Geometries"],
  ["materials", "Materials"]
];

/** Cache numbers only; each hidden assembly lives exclusively in a cancellable worker. */
export function createModelComparison(
  createWorker = () => new Worker(new URL("./modelMetricsWorker.ts", import.meta.url), { type: "module" })
) {
  const cache = new Map<string, Partial<Record<ModelQuality, ModelMetrics>>>();
  let cancel = () => {};
  return {
    clear() {
      cancel();
      cancel = () => {};
    },
    mount(host: HTMLElement, modulePath: string, quality: ModelQuality, root: THREE.Object3D) {
      cancel();
      const measurements = cache.get(modulePath) ?? {};
      measurements[quality] = collectModelMetrics(root);
      cache.set(modulePath, measurements);
      const section = document.createElement("section");
      section.className = "bv-comparison";
      const title = document.createElement("h2");
      title.textContent = "Model complexity · Low / High";
      const table = document.createElement("table");
      table.setAttribute("aria-label", "Low and high model complexity comparison");
      const head = table.createTHead().insertRow();
      for (const label of ["Metric", "Low", "High", "High / Low"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        head.append(th);
      }
      const scroll = document.createElement("div");
      scroll.className = "bv-comparison-scroll";
      scroll.tabIndex = 0;
      scroll.setAttribute("role", "region");
      scroll.setAttribute("aria-label", "Model complexity table");
      scroll.append(table);
      const body = table.createTBody();
      const status = document.createElement("p");
      status.setAttribute("role", "status");
      const note = document.createElement("p");
      note.textContent =
        "Model only, excluding ground. Vertices count shared buffers once; triangles include instances. Merged parts count as one mesh. Counts are independent of the camera.";
      section.append(title, scroll, status, note);
      host.append(section);
      const render = () => {
        body.replaceChildren();
        for (const [key, label] of ROWS) {
          const row = body.insertRow();
          const th = document.createElement("th");
          th.scope = "row";
          th.textContent = label;
          row.append(th);
          for (const q of ["low", "high"] as const)
            row.insertCell().textContent = measurements[q]?.[key].toLocaleString() ?? "—";
          const low = measurements.low?.[key];
          const high = measurements.high?.[key];
          row.insertCell().textContent = low && high != null ? `${(high / low).toFixed(2)}×` : "—";
        }
      };
      render();
      const other = quality === "low" ? "high" : "low";
      let worker: Worker | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      let active = true;
      const stop = () => {
        if (!active) return;
        active = false;
        cancelAnimationFrame(raf);
        clearTimeout(startTimer);
        clearTimeout(timeout);
        worker?.terminate();
      };
      const complete = (response: MetricsResponse) => {
        if (!active) return;
        if ("metrics" in response) {
          measurements[other] = response.metrics;
          status.textContent = "Both quality levels measured.";
          render();
        } else {
          status.textContent = `${other === "high" ? "High" : "Low"} measurement failed: ${response.error}. Select the model again to retry.`;
        }
        stop();
      };
      // Start after the visible model has had a paint opportunity.
      const raf = requestAnimationFrame(() => {
        if (measurements[other]) return;
        startTimer = setTimeout(() => {
          if (!active) return;
          try {
            worker = createWorker();
            worker.onmessage = (event: MessageEvent<MetricsResponse>) => complete(event.data);
            worker.onerror = event => {
              event.preventDefault();
              complete({ error: "Worker could not complete the measurement" });
            };
            timeout = setTimeout(() => complete({ error: "Timed out" }), 30000);
            worker.postMessage({ modulePath, quality: other });
          } catch {
            complete({ error: "Background measurement is unavailable" });
          }
        }, 0);
      });
      status.textContent = measurements[other]
        ? "Both quality levels measured."
        : `Measuring ${other === "high" ? "High" : "Low"} in the background…`;
      cancel = stop;
    }
  };
}
