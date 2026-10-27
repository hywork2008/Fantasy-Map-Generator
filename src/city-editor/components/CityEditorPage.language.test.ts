import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import i18n, { LANGUAGE_STORAGE_KEY } from "../../i18n/index";
import type { CityDocument } from "../types/document";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
const view = vi.hoisted(() => ({ getDocument: null as (() => CityDocument) | null, mounts: 0, disposals: 0 }));
vi.mock("../renderers/cityView", () => ({
  mountCity3d: (options: { getDocument: () => CityDocument }) => {
    view.getDocument = options.getDocument;
    view.mounts++;
    return {
      sync() {},
      dispose() {
        view.disposals++;
      },
      resetCamera() {},
      getPerformance: () => null,
      adopt(next: { getDocument: () => CityDocument }) {
        view.getDocument = next.getDocument;
      }
    };
  }
}));
let root: HTMLElement;
let dispose: () => void;
let storedLanguage: string | null;
beforeEach(async () => {
  storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  await i18n.changeLanguage("en");
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
});
afterEach(async () => {
  dispose();
  root.remove();
  if (storedLanguage === null) localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  else localStorage.setItem(LANGUAGE_STORAGE_KEY, storedLanguage);
  await i18n.changeLanguage("en");
  document.documentElement.lang = "en";
});
function select(selector: string, value: string) {
  const control = root.querySelector<HTMLSelectElement>(selector)!;
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}
async function language(value: string) {
  select(".ce-language select", value);
  await vi.waitFor(() => {
    expect(root.querySelector<HTMLSelectElement>(".ce-language select")!.disabled).toBe(false);
    expect(root.querySelector(".ce-language summary")!.textContent).toContain(
      i18n.getFixedT(value)("cityEditor.messages.nativeLanguageName")
    );
  });
}

it("switches the translated UI without losing the current map, seed, settings, tab or undo history", async () => {
  const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
  seed.value = "language-preserved-seed";
  seed.dispatchEvent(new Event("input", { bubbles: true }));
  const population = root.querySelector<HTMLInputElement>(".ce-population-enabled")!;
  population.click();
  expect(population.checked).toBe(false);
  root.querySelector<HTMLButtonElement>('[data-generation-tab="elements"]')!.click();
  select(".ce-housing-culture", "mediterranean");
  const city = view.getDocument!();
  const box = root.querySelector(".ce-map svg")!.getAttribute("viewBox");
  root.querySelector<HTMLDetailsElement>(".ce-language")!.open = true;
  const mounts = view.mounts;
  const disposals = view.disposals;
  await language("ja");
  // The 3D scene is handed to the rebuilt UI, not rebuilt.
  expect(view.mounts).toBe(mounts);
  expect(view.disposals).toBe(disposals);
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
  expect(document.documentElement.lang).toBe("ja");
  expect(root.querySelector(".ce-complete-generation")!.textContent).toBe(
    i18n.getFixedT("ja")("cityEditor.messages.generateCompleteCity")
  );
  expect(root.querySelector('[data-generation-tab="elements"]')!.getAttribute("aria-selected")).toBe("true");
  expect(root.querySelector<HTMLInputElement>(".ce-population-enabled")!.checked).toBe(false);
  expect(root.querySelector<HTMLInputElement>(".ce-generate-seed")!.value).toBe("language-preserved-seed");
  expect(root.querySelector<HTMLSelectElement>(".ce-housing-culture")!.value).toBe("mediterranean");
  expect(root.querySelector(".ce-map svg")!.getAttribute("viewBox")).toBe(box);
  expect(view.getDocument!()).toBe(city);
  expect(root.querySelector<HTMLDetailsElement>(".ce-language")!.open).toBe(true);
  root.querySelector<HTMLButtonElement>(`button[aria-label="${editorText("cityEditor.messages.undo")}"]`)!.click();
  expect(view.getDocument!().buildingAppearanceProfile).toBeUndefined();
  root.querySelector<HTMLButtonElement>(`button[aria-label="${editorText("cityEditor.messages.redo")}"]`)!.click();
  expect(view.getDocument!().buildingAppearanceProfile).toBe("mediterranean");
  await language("en");
  expect(root.querySelector(".ce-complete-generation")!.textContent).toBe("🏘 Generate from seed");
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  expect(root.querySelectorAll(".ce-language")).toHaveLength(1);
  dispose();
  expect(view.disposals).toBe(disposals + 1);
  expect(root.childNodes).toHaveLength(0);
});

it("retains panel positions, view preferences and the city grid while switching language in Fort mode", async () => {
  const grid = root.querySelector<HTMLSelectElement>(".ce-grid-kind")!.value;
  const panel = root.querySelector<HTMLElement>(".ce-generate")!;
  panel.style.left = "410px";
  panel.style.top = "75px";
  select(".ce-generation-mode", "fort");
  select(".ce-render-quality", "minimal");
  root.querySelector<HTMLButtonElement>('[data-generation-tab="view"]')!.click();
  const renderedQuality = root.querySelector(".ce-map svg")!.getAttribute("data-render-quality");
  await language("ja");
  const restored = root.querySelector<HTMLElement>(".ce-generate")!;
  expect(restored.style.left).toBe("410px");
  expect(restored.style.top).toBe("75px");
  expect(root.querySelector<HTMLSelectElement>(".ce-generation-mode")!.value).toBe("fort");
  expect(root.querySelector<HTMLSelectElement>(".ce-render-quality")!.value).toBe("minimal");
  expect(root.querySelector(".ce-map svg")!.getAttribute("data-render-quality")).toBe(renderedQuality);
  select(".ce-generation-mode", "city");
  expect(root.querySelector<HTMLSelectElement>(".ce-grid-kind")!.value).toBe(grid);
});
