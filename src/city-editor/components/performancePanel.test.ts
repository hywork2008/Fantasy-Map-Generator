import { afterEach, expect, it, vi } from "vitest";
import { createDocument } from "../generators/document";
import { mountPerformancePanel } from "./performancePanel";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("samples only while open, refreshes changed SVG, exports context and stops after disposal", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 7)
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const host = document.createElement("div");
  const map = document.createElement("div");
  map.innerHTML = '<svg data-render-quality="minimal"><path d="M0 0L1 1"/></svg>';
  host.append(map);
  document.body.append(host);
  const get3d = vi.fn(() => null);
  const panel = mountPerformancePanel({
    host,
    map,
    getDocument: () => createDocument("metrics", 100),
    getSettings: () => ({ modelQuality: "low" }),
    get3d,
    scope: {
      listen(target, type, handler) {
        target.addEventListener(type, handler);
        cleanups.push(() => target.removeEventListener(type, handler));
      }
    }
  });
  cleanups.push(
    () => host.remove(),
    () => panel.dispose()
  );
  expect(get3d).not.toHaveBeenCalled();
  const details = host.querySelector("details")!;
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
  expect(get3d).toHaveBeenCalledTimes(1);
  expect(details.querySelector("pre")!.textContent).toContain("minimal");
  map.querySelector("svg")!.setAttribute("data-render-quality", "light");
  await Promise.resolve();
  vi.advanceTimersByTime(1000);
  expect(details.querySelector("pre")!.textContent).toContain("light");

  let exported: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      exported = blob;
      return "blob:metrics";
    },
    revokeObjectURL: vi.fn()
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  details.querySelector("input")!.value = "M4 Mac mini";
  details.querySelector("button")!.click();
  expect(click).toHaveBeenCalledOnce();
  details.open = false;
  details.dispatchEvent(new Event("toggle"));
  get3d.mockClear();
  vi.advanceTimersByTime(2000);
  expect(get3d).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith(7);
  panel.dispose();
  vi.useRealTimers();
  const content = new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(exported!);
  });
  vi.useRealTimers();
  expect(JSON.parse(await content)).toMatchObject({
    hardware: "M4 Mac mini",
    mode: "2D",
    settings: { modelQuality: "low" },
    svg: { quality: "light" }
  });

  expect(host.querySelector(".ce-performance")).toBeNull();
});
