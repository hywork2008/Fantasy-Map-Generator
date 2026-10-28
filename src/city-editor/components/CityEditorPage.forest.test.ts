import { afterEach, expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import { createDocument } from "../generators/document";
import { readForestViewPreferences } from "../services/forestViewPreferences";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { CityDocument } from "../types/document";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
const view = vi.hoisted(() => ({
  getDocument: null as (() => CityDocument) | null,
  getQuality: null as (() => string) | null
}));
vi.mock("../renderers/cityView", () => ({
  mountCity3d: (options: { getDocument: () => CityDocument; getForestQuality: () => string }) => {
    view.getDocument = options.getDocument;
    view.getQuality = options.getForestQuality;
    return { sync() {}, dispose() {}, getPerformance: () => null };
  }
}));
let root: HTMLElement;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  root?.remove();
  localStorage.removeItem("fmg-city-editor:forest-view");
});
function mount() {
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
}
function select(name: string, value: string) {
  const control = root.querySelector<HTMLSelectElement>(`.ce-forest-${name}`)!;
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}
async function load(city: CityDocument) {
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", {
    value: { files: [{ name: "forest.json", type: "application/json", text: async () => serializeDocument(city) }] }
  });
  root.querySelector(".ce-map")!.dispatchEvent(drop);
  await vi.waitFor(() =>
    expect(serializeDocument(view.getDocument!())).toBe(serializeDocument(parseDocument(serializeDocument(city))!))
  );
}
function history(action: "undo" | "redo") {
  root.querySelector<HTMLButtonElement>(`button[aria-label="${editorText(`cityEditor.messages.${action}`)}"]`)!.click();
}

it("applies landscape as one reversible edit, preserves the city and reports locked farmland after reload", async () => {
  mount();
  const city = createDocument("forest-controls", 100);
  city.appearance = "town";
  for (const face of Object.values(city.mesh.faces))
    Object.assign(face.properties, { water: "land", ward: "farm", settlement: "outskirts" });
  Object.values(city.mesh.faces)[0].properties.locked = true;
  await load(city);
  const before = serializeDocument(view.getDocument!());
  select("mode", "farmland");
  select("density", "dense");
  expect(serializeDocument(view.getDocument!())).toBe(before);
  root.querySelector<HTMLButtonElement>(".ce-forest-apply")!.click();
  const current = view.getDocument!();
  expect(current.forestSettings).toEqual({ version: 1, mode: "farmland", density: "dense" });
  expect(current.mesh).toEqual(city.mesh);
  expect(current.elements).toEqual(city.elements);
  expect(root.querySelector<HTMLOutputElement>(".ce-forest-protected")!.hidden).toBe(false);
  expect(root.querySelector(".ce-forest-layer")).not.toBeNull();
  const saved = parseDocument(serializeDocument(current))!;
  history("undo");
  expect(view.getDocument!().forestSettings).toBeUndefined();
  expect(root.querySelector<HTMLSelectElement>(".ce-forest-mode")!.value).toBe("legacy");
  history("redo");
  expect(view.getDocument!().forestSettings).toEqual(saved.forestSettings);
  select("mode", "legacy");
  root.querySelector<HTMLButtonElement>(".ce-forest-apply")!.click();
  expect(root.querySelector(".ce-forest-layer")).toBeNull();
  await load(saved);
  await vi.waitFor(() => expect(root.querySelector<HTMLSelectElement>(".ce-forest-density")!.value).toBe("dense"));
  expect(root.querySelector<HTMLSelectElement>(".ce-forest-mode")!.value).toBe("farmland");
  expect(view.getDocument!().mesh).toEqual(city.mesh);
});

it("persists local display choices without adding history or modifying the city", () => {
  mount();
  const city = view.getDocument!();
  select("representation", "all-trees");
  select("quality", "light");
  expect(view.getQuality!()).toBe("light");
  expect(readForestViewPreferences()).toEqual({ representation: "all-trees", quality: "light" });
  expect(view.getDocument!()).toBe(city);
  expect(root.querySelectorAll(".ce-history-row")).toHaveLength(1);
  dispose!();
  root.remove();
  mount();
  expect(root.querySelector<HTMLSelectElement>(".ce-forest-representation")!.value).toBe("all-trees");
  expect(root.querySelector<HTMLSelectElement>(".ce-forest-quality")!.value).toBe("light");
  localStorage.setItem("fmg-city-editor:forest-view", JSON.stringify({ representation: "invalid", quality: "ultra" }));
  expect(readForestViewPreferences()).toEqual({ representation: "edge-fill", quality: "auto" });
});

it("uses the selected landscape for new generation without requiring an apply edit", () => {
  mount();
  const mode = root.querySelector<HTMLSelectElement>(".ce-generation-mode")!;
  mode.value = "fort";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  select("mode", "surroundings");
  select("density", "sparse");
  root.querySelector<HTMLButtonElement>(".ce-complete-generation")!.click();
  const city = view.getDocument!();
  expect(city.forestSettings).toEqual({ version: 1, mode: "surroundings", density: "sparse" });
  expect(city.fabric?.generation?.settings.forestSettings).toEqual(city.forestSettings);
  expect(parseDocument(serializeDocument(city))!.forestSettings).toEqual(city.forestSettings);
});
