import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { buildBlockFabric, documentFabricFingerprint } from "../generators/blockInfill";
import { createDocument } from "../generators/document";
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
