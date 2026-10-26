import { afterEach, expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import { withCastleStyle } from "../generators/castleAppearance";
import { createCastleBuildingOnFace } from "../generators/castles";
import { createFortressStudy } from "../generators/fortressStudy";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { CityDocument } from "../types/document";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
const view = vi.hoisted(() => ({ sync: vi.fn(), getDocument: null as (() => CityDocument) | null }));
vi.mock("../renderers/cityView", () => ({
  mountCity3d: (options: { getDocument: () => CityDocument }) => {
    view.getDocument = options.getDocument;
    return { sync: view.sync, dispose: vi.fn() };
  }
}));
let root: HTMLElement;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  root?.remove();
  vi.clearAllMocks();
});

it("applies the global castle style immediately to all procedural castles, supports undo and preserves Inspector overrides", async () => {
  const source = createFortressStudy();
  delete source.castles![0].fortress;
  const city = createCastleBuildingOnFace(source, "f0")!;
  city.castles![1].locked = true;
  const geometry = JSON.stringify([city.mesh, city.defenseCircuits, city.castles!.map(c => c.parts)]);
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", {
    value: { files: [{ name: "castles.json", type: "application/json", text: async () => JSON.stringify(city) }] }
  });
  root.querySelector(".ce-map")!.dispatchEvent(drop);
  await vi.waitFor(() => expect(view.getDocument!().castles).toHaveLength(2));
  const style = root.querySelector<HTMLSelectElement>(".ce-generate-castle-style")!;
  root.querySelector<HTMLButtonElement>('[data-generation-tab="elements"]')!.click();
  view.sync.mockClear();
  style.value = "japanese-shiro";
  style.dispatchEvent(new Event("change", { bubbles: true }));
  let current = view.getDocument!();
  expect(current.castleStyle).toBe("japanese-shiro");
  expect(current.castles!.map(c => c.castleStyle)).toEqual(["japanese-shiro", "japanese-shiro"]);
  expect(root.querySelectorAll(".ce-castle--japanese-shiro")).toHaveLength(2);
  expect(view.sync).toHaveBeenCalled();
  expect(JSON.stringify([current.mesh, current.defenseCircuits, current.castles!.map(c => c.parts)])).toBe(geometry);
  const saved = parseDocument(serializeDocument(current))!;
  expect(saved.castleStyle).toBe("japanese-shiro");
  expect(saved.castles!.map(c => c.castleStyle)).toEqual(["japanese-shiro", "japanese-shiro"]);

  root.querySelector<HTMLButtonElement>(`button[aria-label="${editorText("cityEditor.messages.undo")}"]`)!.click();
  expect(view.getDocument!().castleStyle).toBeUndefined();
  expect(style.value).toBe("auto");
  expect(root.querySelector(".ce-castle--japanese-shiro")).toBeNull();
  root.querySelector<HTMLButtonElement>(`button[aria-label="${editorText("cityEditor.messages.redo")}"]`)!.click();
  expect(style.value).toBe("japanese-shiro");
  expect(root.querySelectorAll(".ce-castle--japanese-shiro")).toHaveLength(2);

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
  let individual = root.querySelector<HTMLSelectElement>(".ce-inspector-castle-style")!;
  expect(individual).not.toBeNull();
  expect(individual.closest("label")).toBeNull();
  expect(individual.getAttribute("aria-label")).toBe(editorText("cityEditor.messages.castleStyle"));
  individual.value = "concentric";
  individual.dispatchEvent(new Event("change", { bubbles: true }));
  expect(root.querySelectorAll(".ce-castle--concentric")).toHaveLength(1);
  expect(root.querySelectorAll(".ce-castle--japanese-shiro")).toHaveLength(1);
  individual = root.querySelector<HTMLSelectElement>(".ce-inspector-castle-style")!;
  individual.value = "auto";
  individual.dispatchEvent(new Event("change", { bubbles: true }));
  expect(root.querySelectorAll(".ce-castle--norman-keep")).toHaveLength(1);

  style.value = "auto";
  style.dispatchEvent(new Event("change", { bubbles: true }));
  current = view.getDocument!();
  expect(current.castleStyle).toBe("auto");
  expect(current.castles!.every(c => c.castleStyle === undefined)).toBe(true);
  expect(root.querySelectorAll(".ce-castle--norman-keep")).toHaveLength(2);

  const reload = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(reload, "dataTransfer", {
    value: {
      files: [{ name: "saved-castles.json", type: "application/json", text: async () => serializeDocument(saved) }]
    }
  });
  root.querySelector(".ce-map")!.dispatchEvent(reload);
  await vi.waitFor(() => expect(style.value).toBe("japanese-shiro"));
  expect(root.querySelectorAll(".ce-castle--japanese-shiro")).toHaveLength(2);
  expect(parseDocument(JSON.stringify({ ...saved, castleStyle: "invalid" }))).toBeNull();

  const mode = root.querySelector<HTMLSelectElement>(".ce-generation-mode")!;
  mode.value = "fort";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  root.querySelector<HTMLButtonElement>(".ce-complete-generation")!.click();
  expect(view.getDocument!().castles).toHaveLength(1);
  expect(view.getDocument!().castles![0].castleStyle).toBe("japanese-shiro");
  expect(style.disabled).toBe(false);
  style.value = "concentric";
  style.dispatchEvent(new Event("change", { bubbles: true }));
  const regenerated = view.getDocument!();
  expect(regenerated.fabric!.generation!.settings.castle!.style).toBe("concentric");
  expect(parseDocument(serializeDocument(regenerated))!.castleStyle).toBe("concentric");
});

it("preserves historic modular fortress models when changing the map-wide procedural style", () => {
  const source = createFortressStudy();
  const next = withCastleStyle(source, "japanese-shiro");
  expect(next.castles![0]).toBe(source.castles![0]);
  expect(next.castles![0].fortress?.modelId).toBe("krak-des-chevaliers");
  expect(next.mesh).toBe(source.mesh);
});
