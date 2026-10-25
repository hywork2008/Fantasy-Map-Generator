import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

let root: HTMLElement, dispose: () => void;
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.2345);
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
  // Skeleton generation uses the legacy frame rather than population planning.
  root.querySelector<HTMLInputElement>(".ce-population-enabled")!.click();
});
afterEach(() => {
  dispose();
  root.remove();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
function select(selector: string, value: string) {
  const input = root.querySelector<HTMLSelectElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input;
}

describe("skeleton-first generation panel", () => {
  it("marks wet ditch and rivers, links the explanation, and clears resolved conflicts", () => {
    select(".ce-town-fortification", "bastioned");
    select(".ce-generate-river-count", "1");
    const ditch = select(".ce-fortress-ditch", "wet");
    const rivers = root.querySelector<HTMLSelectElement>(".ce-generate-river-count")!;
    expect(rivers.getAttribute("aria-invalid")).toBe("true");
    expect(ditch.classList.contains("ce-setting-invalid")).toBe(true);
    const explanation = document.getElementById(rivers.getAttribute("aria-describedby")!.split(" ")[0]);
    expect(explanation?.textContent).toContain("dry");
    select(".ce-fortress-ditch", "dry");
    expect(rivers.hasAttribute("aria-invalid")).toBe(false);
    expect(rivers.hasAttribute("aria-describedby")).toBe(false);
    expect(ditch.classList.contains("ce-setting-invalid")).toBe(false);
  });

  it("uses artillery dimensions for a new fortress and lets old proportions be selected explicitly", () => {
    select(".ce-town-fortification", "bastioned");
    const dimensions = root.querySelector<HTMLSelectElement>(".ce-fortress-dimensions")!;
    expect(dimensions.closest("label")!.hidden).toBe(false);
    expect(dimensions.value).toBe("artillery-v1");
    select(".ce-fortress-dimensions", "legacy");
    expect(dimensions.value).toBe("legacy");
    select(".ce-town-fortification", "ordinary");
    expect(dimensions.closest("label")!.hidden).toBe(true);
  });
  it("keeps the existing method by default and shows shapes only for skeleton-first", () => {
    const method = root.querySelector<HTMLSelectElement>(".ce-generation-method")!;
    const shape = root.querySelector<HTMLSelectElement>(".ce-wall-shape")!;
    expect(method.value).toBe("mesh-first");
    expect(shape.closest("label")!.hidden).toBe(true);
    select(".ce-generate-town-wall-rings", "single");
    select(".ce-generation-method", "skeleton-first");
    expect(shape.closest("label")!.hidden).toBe(false);
    const sides = root.querySelector<HTMLInputElement>(".ce-wall-sides")!;
    expect(sides.closest("label")!.hidden).toBe(true);
    select(".ce-wall-shape", "polygon");
    expect(sides.closest("label")!.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>(".ce-moat-town")!.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>(".ce-moat-town")!.title).toBeTruthy();
    select(".ce-generation-method", "mesh-first");
    expect(root.querySelector<HTMLInputElement>(".ce-moat-town")!.disabled).toBe(false);
  });

  it("exposes vector-only K stages followed by the conforming mesh and complete city", () => {
    select(".ce-generate-town-wall-rings", "single");
    select(".ce-generation-method", "skeleton-first");
    select(".ce-generate-river-count", "0");
    const slider = root.querySelector<HTMLInputElement>(".ce-generate-stage-slider")!;
    expect(slider.max).toBe("14");
    slider.value = "1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector(".ce-generate-stage-badge")!.textContent).toContain("K1");
    expect(root.querySelectorAll(".ce-cells .ce-face").length).toBe(0);
    slider.value = "6";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector(".ce-generate-stage-badge")!.textContent).toContain("K6");
    expect(root.querySelectorAll(".ce-cells .ce-face").length).toBeGreaterThan(0);
    const button = [...root.querySelectorAll<HTMLButtonElement>(".ce-generate button")].find(b =>
      /Generate complete city|都市を一括生成/.test(b.textContent ?? "")
    )!;
    let diagnostics: unknown;
    root.addEventListener("city-generation-diagnostics", event => {
      diagnostics = (event as CustomEvent).detail;
    });
    button.click();
    expect(root.querySelector("svg.ce-svg--town"), JSON.stringify(diagnostics)).toBeTruthy();
    expect(root.querySelectorAll(".ce-buildings .ce-building").length).toBeGreaterThan(0);
  });
});
