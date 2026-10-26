import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { mountPerformancePanel } from "./performancePanel";

it("reports live draw work separately from model counts and resets samples on model changes", () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  let model: THREE.Object3D = new THREE.Mesh(geometry, material);
  const panel = mountPerformancePanel(host, () => model);
  const details = host.querySelector("details")!;
  const renderer = {
    info: { render: { calls: 2, triangles: 60 }, memory: { geometries: 2, textures: 0 } },
    domElement: { width: 800, height: 600 }
  } as THREE.WebGLRenderer;
  try {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    vi.advanceTimersByTime(16);
    panel.sample(renderer, performance.now());
    vi.advanceTimersByTime(16);
    panel.sample(renderer, performance.now());
    vi.advanceTimersByTime(1000);
    expect(host.textContent).toContain("Draw calls: 2");
    expect(host.textContent).toContain("Rendered triangles: 60");
    expect(host.textContent).toContain("Model triangles: 12");
    expect(host.textContent).toContain("Frame interval p95: 16 ms");
    model = new THREE.Group();
    panel.reset();
    panel.sample(renderer, performance.now());
    vi.advanceTimersByTime(1000);
    expect(host.textContent).toContain("Model triangles: 0");
    expect(host.textContent).toContain("Frame interval p95: — ms");
    details.open = false;
    details.dispatchEvent(new Event("toggle"));
    expect(panel.open).toBe(false);
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    geometry.dispose();
    material.dispose();
    vi.useRealTimers();
  }
});
