import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { buildBlockFabric, documentFabricFingerprint } from "../generators/blockInfill";
import { createDocument } from "../generators/document";
import { withForestSettings } from "../generators/forestLandCover";
import { beginEditorMount } from "../services/editorLifetime";
import type { ForestQualityPreference } from "../types/contracts/forest";
import { mountCity3d } from "./cityView";

const render = vi.hoisted(() => vi.fn());
vi.mock("three", async importOriginal => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: class {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas;
      Object.defineProperty(canvas, "clientHeight", { value: 600 });
    }
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    shadowMap = { enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false };
    render = render;
    dispose() {}
  }
}));

it("renders on demand, retains unchanged scene layers on reopen, and reflects camera, size and document changes", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let resize = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  const host = document.createElement("div"),
    map = document.createElement("div");
  host.append(map);
  document.body.append(host);
  const city = createDocument("on-demand", 160);
  const fabric = buildBlockFabric(city);
  city.ruralFieldSnapshot = {
    fingerprint: documentFabricFingerprint(city),
    farms: fabric.farms,
    lanes: fabric.lanes
  };
  let center: [number, number] = [0, 0];
  const cleanups: Array<() => void> = [];
  const view = mountCity3d({
    canvasHost: host,
    map,
    scope: {
      own(cleanup) {
        cleanups.push(cleanup);
      },
      listen(target, type, handler) {
        target.addEventListener(type, handler);
        cleanups.push(() => target.removeEventListener(type, handler));
      }
    },
    getDocument: () => city,
    getViewCenter: () => center,
    getModelQuality: () => "high"
  });
  try {
    const toggle = host.querySelector<HTMLButtonElement>(".ce-view-toggle")!;
    toggle.click();
    expect(frames.size).toBe(1);
    flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    const scene = render.mock.calls[0][0] as THREE.Scene;
    const children = [...scene.children];
    view.sync();
    expect(frames.size).toBe(0);
    expect(scene.children).toEqual(children);
    toggle.click();
    toggle.click();
    expect(frames.size).toBe(1);
    expect(scene.children).toEqual(children);
    flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);

    center = [30, 20];
    view.resetCamera();
    view.sync();
    expect(frames.size).toBe(1);
    flush();
    expect((render.mock.lastCall![1] as THREE.PerspectiveCamera).position.x).toBeCloseTo(30);

    const canvas = host.querySelector("canvas")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 60,
      left: 40,
      top: 60,
      width: 800,
      height: 600,
      right: 840,
      bottom: 660,
      toJSON() {}
    });
    const camera = render.mock.lastCall![1] as THREE.PerspectiveCamera;
    const anchor = new THREE.Vector3(0.5, 0.4, 0.5).unproject(camera);
    const previousPosition = camera.position.clone();
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 100,
        clientX: 640,
        clientY: 240,
        cancelable: true
      })
    );
    const projected = anchor.clone().project(camera);
    expect(projected.x).toBeCloseTo(0.5, 8);
    expect(projected.y).toBeCloseTo(0.4, 8);
    expect(camera.position.distanceTo(previousPosition)).toBeGreaterThan(0);
    expect(frames.size).toBe(1);
    flush();
    expect(frames.size).toBe(0);
    resize();
    resize();
    expect(frames.size).toBe(1);
    flush();

    city.generationSeed = "changed";
    view.sync();
    expect(frames.size).toBe(1);
    expect(scene.children).not.toEqual(children);
    flush();
    expect(render).toHaveBeenCalledTimes(6);
    expect(frames.size).toBe(0);
    const panel = host.querySelector<HTMLDetailsElement>(".ce-sun-controls")!;
    expect(panel.hidden).toBe(false);
    const sun = scene.children.find(child => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(sun.castShadow).toBe(false);
    const enabled = panel.querySelector<HTMLInputElement>('[name="enabled"]')!;
    const settings = panel.querySelector<HTMLFieldSetElement>("fieldset")!;
    expect(enabled.checked).toBe(false);
    expect(settings.disabled).toBe(true);
    enabled.checked = true;
    enabled.dispatchEvent(new Event("change"));
    expect(settings.disabled).toBe(false);
    expect(sun.castShadow).toBe(true);
    const casters: THREE.Mesh[] = [];
    scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.castShadow) casters.push(object);
    });
    expect(casters.length).toBeGreaterThan(0);
    expect(casters.every(mesh => mesh.receiveShadow)).toBe(true);
    const currentChildren = [...scene.children];
    const azimuth = panel.querySelector<HTMLInputElement>('[name="azimuth"]')!;
    azimuth.value = "270";
    azimuth.dispatchEvent(new Event("input"));
    expect(sun.position.x).toBeLessThan(sun.target.position.x);
    expect(sun.position.z).toBeCloseTo(sun.target.position.z);
    const intensity = panel.querySelector<HTMLInputElement>('[name="intensity"]')!;
    intensity.value = "50";
    intensity.dispatchEvent(new Event("input"));
    expect(sun.intensity).toBe(0.5);
    const preset = panel.querySelector<HTMLSelectElement>('[name="colorPreset"]')!;
    const color = panel.querySelector<HTMLInputElement>('[name="color"]')!;
    for (const value of ["#ff8a80", "#ff6040"]) {
      preset.value = value;
      preset.dispatchEvent(new Event("change"));
      expect(color.value).toBe(value);
      expect(sun.color.getHexString()).toBe(value.slice(1));
    }
    color.value = "#aabbff";
    color.dispatchEvent(new Event("input"));
    expect(sun.color.getHexString()).toBe("aabbff");
    expect(preset.value).toBe("custom");
    expect(JSON.parse(localStorage.getItem("fmg-city-editor:sun-lighting")!).color).toBe("#aabbff");
    const shadows = panel.querySelector<HTMLInputElement>('[name="shadows"]')!;
    shadows.checked = false;
    shadows.dispatchEvent(new Event("change"));
    expect(sun.castShadow).toBe(false);
    enabled.checked = false;
    enabled.dispatchEvent(new Event("change"));
    expect(sun.intensity).toBe(1.15);
    expect(sun.color.getHexString()).toBe("ffffff");
    expect(settings.disabled).toBe(true);
    panel.querySelector<HTMLButtonElement>("button")!.click();
    expect(color.value).toBe("#ffffff");
    expect(preset.value).toBe("#ffffff");
    expect(scene.children).toEqual(currentChildren);
    expect(frames.size).toBe(1);
    flush();
    resize();
    toggle.click();
    expect(panel.hidden).toBe(true);
    expect(frames.size).toBe(0);
    toggle.click();
    view.dispose();
    expect(frames.size).toBe(0);
  } finally {
    view.dispose();
    for (const cleanup of cleanups) cleanup();
    host.remove();
    localStorage.removeItem("fmg-city-editor:sun-lighting");
    vi.unstubAllGlobals();
  }
});

it("keeps cursor zoom and right-drag responsive above the ground at a 30-degree viewing angle", () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const host = document.createElement("div"),
    map = document.createElement("div");
  host.append(map);
  document.body.append(host);
  const scope = beginEditorMount(host);
  const city = createDocument("ground-plane-navigation", 160);
  const view = mountCity3d({ canvasHost: host, map, scope, getDocument: () => city });
  try {
    view.restoreView({ position: [0, 100, 100 * Math.sqrt(3)], target: [0, 0, 0], zoom: 1, fov: 45 });
    const canvas = host.querySelector("canvas")!;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      toJSON() {}
    });
    const snapshot = () => view.getPerformance()!.camera!;
    const position = () => new THREE.Vector3().fromArray(snapshot().position);
    const pointer = (type: string, x: number, y: number) =>
      Object.assign(new MouseEvent(type, { button: 2, clientX: x, clientY: y, bubbles: true }), {
        pointerId: 1,
        pointerType: "mouse"
      });
    for (let step = 0; step < 50; step++) {
      const beforePan = position();
      canvas.dispatchEvent(pointer("pointerdown", 400, 300));
      document.dispatchEvent(pointer("pointermove", 480, 310));
      document.dispatchEvent(pointer("pointerup", 480, 310));
      expect(position().distanceTo(beforePan)).toBeGreaterThan(beforePan.y * 0.1);
      const beforeZoom = position();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          clientX: 600,
          clientY: 120,
          cancelable: true
        })
      );
      // Movement must follow the distance to the ground, even after many gestures.
      expect(position().distanceTo(beforeZoom)).toBeGreaterThan(beforeZoom.y * 0.05);
      expect(snapshot().target[1]).toBeCloseTo(0, 8);
      const offset = position().sub(new THREE.Vector3().fromArray(snapshot().target));
      expect(offset.y / offset.length()).toBeCloseTo(0.5, 8);
    }
  } finally {
    view.dispose();
    scope.dispose();
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("updates forest quality and camera LOD without rebuilding city geometry and removes disabled forest", () => {
  render.mockClear();
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn(0);
  };
  const host = document.createElement("div"),
    map = document.createElement("div");
  host.append(map);
  document.body.append(host);
  const source = createDocument("forest-refresh", 400);
  source.appearance = "town";
  for (const face of Object.values(source.mesh.faces))
    Object.assign(face.properties, { ward: "farm", settlement: "outskirts" });
  let city = withForestSettings(source, { version: 1, mode: "surroundings", density: "standard" });
  let forestQuality: ForestQualityPreference = "standard";
  let simplification = { urban: "auto" as "auto" | "off", outskirts: "auto" as "auto" | "off" };
  const getDocument = vi.fn(() => city);
  const scope = beginEditorMount(host);
  const view = mountCity3d({
    canvasHost: host,
    map,
    scope,
    getDocument,
    getForestQuality: () => forestQuality,
    getSimplification: () => simplification
  });
  try {
    host.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click();
    flush();
    const scene = render.mock.lastCall![0] as THREE.Scene;
    const forest = scene.getObjectByName("ce-forest");
    let massing = scene.getObjectByName("massing");
    expect(forest).toBeDefined();
    expect(view.getPerformance()?.forest?.areaM2).toBeGreaterThan(0);
    const traverse = vi.spyOn(scene, "traverse");
    expect(view.getFramePerformance()?.forest?.areaM2).toBeGreaterThan(0);
    expect(traverse).not.toHaveBeenCalled();
    traverse.mockRestore();
    forestQuality = "light";
    view.sync();
    flush();
    expect(scene.getObjectByName("ce-forest")).toBe(forest);
    expect(scene.getObjectByName("massing")).toBe(massing);
    expect(view.getPerformance()?.forest?.quality).toBe("light");
    const reads = getDocument.mock.calls.length;
    view.restoreView({ position: [130, 40, 120], target: [100, 0, 0], zoom: 1, fov: 45 });
    flush();
    expect(scene.getObjectByName("massing")).toBe(massing);
    expect(getDocument).toHaveBeenCalledTimes(reads);
    forestQuality = "auto";
    view.sync();
    flush();
    expect(view.getPerformance()?.forestQuality?.effective).toBe("standard");
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const canvas = host.querySelector("canvas")!;
      vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
        width: 800,
        height: 600,
        left: 0,
        top: 0
      } as DOMRect);
      for (let i = 0; i < 80; i++) {
        now += 100;
        canvas.dispatchEvent(
          new WheelEvent("wheel", { deltaY: i % 2 ? -1 : 1, clientX: 400, clientY: 300, cancelable: true })
        );
        flush();
      }
      expect(view.getPerformance()?.forestQuality?.effective).toBe("light");
      expect(view.getPerformance()?.forest?.quality).toBe("light");
      expect(scene.getObjectByName("ce-forest")).toBe(forest);
      expect(scene.getObjectByName("massing")).toBe(massing);
      flush();
      expect(frames.size).toBe(0);
    } finally {
      clock.mockRestore();
    }
    const farms = scene.getObjectByName("ce-farmland");
    simplification = { urban: "off", outskirts: "auto" };
    view.sync();
    flush();
    expect(scene.getObjectByName("ce-forest")).toBe(forest);
    expect(scene.getObjectByName("ce-farmland")).toBe(farms);
    expect(scene.getObjectByName("massing")).not.toBe(massing);
    massing = scene.getObjectByName("massing");
    simplification = { urban: "off", outskirts: "off" };
    view.sync();
    flush();
    expect(scene.getObjectByName("massing")).toBe(massing);
    expect(scene.getObjectByName("ce-forest")).not.toBe(forest);
    expect(scene.getObjectByName("ce-farmland")).not.toBe(farms);
    expect(view.getPerformance()?.forest?.quality).toBe("high");
    expect(view.getPerformance()?.forest?.detailedTrees).toBeGreaterThan(16);
    simplification = { urban: "off", outskirts: "auto" };
    forestQuality = "light";
    view.sync();
    flush();
    expect(scene.getObjectByName("massing")).toBe(massing);
    expect(view.getPerformance()?.forest?.quality).toBe("light");
    expect(view.getPerformance()?.forest?.detailedTrees).toBe(0);
    city = withForestSettings(city, { version: 1, mode: "legacy", density: "standard" });
    view.sync();
    flush();
    expect(scene.getObjectByName("ce-forest")).toBeUndefined();
    expect(scene.getObjectByName("massing")).toBe(massing);
    expect(view.getPerformance()?.forest).toBeUndefined();
  } finally {
    view.dispose();
    scope.dispose();
    host.remove();
    vi.unstubAllGlobals();
  }
});
