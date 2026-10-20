import { afterEach, describe, expect, it, vi } from "vitest";
import { createFortressStudy } from "../generators/fortressStudy";
import type { CityDocument } from "../types/document";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {};

const view = vi.hoisted(() => ({ sync: vi.fn(), getDocument: null as (() => CityDocument) | null }));
vi.mock("../renderers/cityView", () => ({
  mountCity3d: (options: { getDocument: () => CityDocument }) => {
    view.getDocument = options.getDocument;
    return { sync: view.sync, dispose: vi.fn() };
  }
}));

let cleanup: (() => void) | undefined;
let root: HTMLElement | undefined;
afterEach(() => {
  cleanup?.();
  root?.remove();
  vi.clearAllMocks();
});

describe("fortress inspector commits", () => {
  it("refreshes an open 3D view after phase and elevation edits and keeps the selection label current", async () => {
    root = document.createElement("div");
    document.body.append(root);
    cleanup = mountCityEditor(root);
    const source = createFortressStudy();
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [{ name: "fortress.json", type: "application/json", text: async () => JSON.stringify(source) }] }
    });
    root.querySelector(".ce-map")!.dispatchEvent(drop);
    await vi.waitFor(() => expect(root!.querySelector(".ce-modular-fortress")).not.toBeNull());
    vi.spyOn(root.querySelector(".ce-map")!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
      toJSON: () => ({})
    });
    root.querySelector(".ce-castle-precinct")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const select = root.querySelector<HTMLSelectElement>(".ce-fortress-model")!;
    expect(select).not.toBeNull();
    view.sync.mockClear();
    select.value = "mamluk-1302";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.getDocument!().castles![0].fortress?.phase).toBe("mamluk-1302");
    expect(root.querySelector(".ce-inspector-kind")!.textContent).toContain("Mamluk");
    expect(view.sync).toHaveBeenCalled();
    view.sync.mockClear();
    const elevation = root.querySelector<HTMLInputElement>(".ce-inspector input[type=number]")!;
    elevation.value = "180";
    elevation.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.getDocument!().mesh.faces.f12.properties.elevation).toBe(180);
    expect(view.sync).toHaveBeenCalled();
  });
});
