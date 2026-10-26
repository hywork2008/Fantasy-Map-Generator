import * as THREE from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createModelComparison } from "./modelComparison";
import type { MetricsResponse } from "./modelMetrics";

class FakeWorker {
  onmessage: ((event: MessageEvent<MetricsResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  reply(response: MetricsResponse) {
    this.onmessage?.({ data: response } as MessageEvent<MetricsResponse>);
  }
}
const high = { meshes: 2, triangles: 120, vertices: 240, geometries: 2, materials: 1 };
let host: HTMLElement;
let geometry: THREE.BoxGeometry;
let material: THREE.MeshBasicMaterial;
let root: THREE.Group;
let workers: FakeWorker[];
let comparison: ReturnType<typeof createModelComparison>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(16), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  host = document.createElement("div");
  geometry = new THREE.BoxGeometry();
  material = new THREE.MeshBasicMaterial();
  root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));
  workers = [];
  comparison = createModelComparison(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
});
afterEach(() => {
  comparison.clear();
  geometry.dispose();
  material.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("reports visible Low immediately, then caches only the hidden High numbers", () => {
  comparison.mount(host, "chartres", "low", root);
  expect(host.querySelector("tbody tr")?.textContent).toContain("Meshes1——");
  expect(workers).toHaveLength(0);
  vi.advanceTimersByTime(20);
  expect(workers[0].postMessage).toHaveBeenCalledWith({ modulePath: "chartres", quality: "high" });
  workers[0].reply({ metrics: high });
  expect(host.textContent).toContain("Both quality levels measured.");
  expect(host.textContent).toContain("10.00×");
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  comparison.clear();
  host.replaceChildren();
  comparison.mount(host, "chartres", "low", root);
  vi.advanceTimersByTime(20);
  expect(workers).toHaveLength(1);
  expect(host.textContent).toContain("Both quality levels measured.");
});

it("terminates old work and ignores stale replies after another model is selected", () => {
  comparison.mount(host, "chartres", "low", root);
  vi.advanceTimersByTime(20);
  const old = workers[0];
  comparison.clear();
  host.replaceChildren();
  comparison.mount(host, "amiens", "low", root);
  old.reply({ metrics: high });
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Measuring High");
  vi.advanceTimersByTime(20);
  workers[1].reply({ metrics: high });
  host.replaceChildren();
  comparison.mount(host, "chartres", "low", root);
  expect(host.textContent).toContain("Measuring High");
});

it("cancels work before starting and lets failed measurements retry", () => {
  comparison.mount(host, "chartres", "low", root);
  comparison.clear();
  vi.advanceTimersByTime(20);
  expect(workers).toHaveLength(0);
  comparison.mount(host, "chartres", "low", root);
  vi.advanceTimersByTime(20);
  workers[0].reply({ error: "Unavailable" });
  expect(host.textContent).toContain("measurement failed: Unavailable");
  host.replaceChildren();
  comparison.mount(host, "chartres", "low", root);
  vi.advanceTimersByTime(20);
  expect(workers).toHaveLength(2);
  vi.advanceTimersByTime(30000);
  expect(host.textContent).toContain("Timed out");
  expect(workers[1].terminate).toHaveBeenCalledOnce();
});
