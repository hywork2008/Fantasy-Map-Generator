import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
let root: HTMLElement;
let dispose: () => void;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
});
afterEach(() => {
  dispose();
  root.remove();
});
const tab = (id: string) => root.querySelector<HTMLButtonElement>(`[data-generation-tab="${id}"]`)!;
const page = (id: string) => root.querySelector<HTMLElement>(`[data-generation-page="${id}"]`)!;
function select(selector: string, value: string) {
  const input = root.querySelector<HTMLSelectElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input;
}

describe("generation workspace", () => {
  it("keeps new-city generation and feature switches ahead of every tab and preserves edits when navigating", () => {
    const button = root.querySelector(".ce-new-generation")!;
    const features = root.querySelector(".ce-generate-features")!;
    const workspace = root.querySelector(".ce-generation-workspace")!;
    expect(button.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(features.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(features.closest('[role="tabpanel"]')).toBeNull();
    expect(page("basics").hidden).toBe(false);
    const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
    expect(seed.closest("label")!.nextElementSibling).toBe(root.querySelector(".ce-complete-generation"));
    expect(root.querySelector(".ce-complete-generation")!.closest('[role="tabpanel"]')).toBe(page("basics"));
    const svg = root.querySelector(".ce-svg")!;
    seed.value = "workspace-seed";
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    for (const id of ["elements", "view", "debug", "decoration", "basics"]) {
      tab(id).click();
      expect(tab(id).getAttribute("aria-selected")).toBe("true");
      expect([...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(panel => !panel.hidden)).toEqual([
        page(id)
      ]);
      expect(root.querySelector(".ce-svg")).toBe(svg);
      expect(seed.value).toBe("workspace-seed");
    }
    expect(root.querySelector(".ce-generate-stage-slider")!.closest('[role="tabpanel"]')).toBe(page("debug"));
    expect(root.querySelector(".ce-city-decoration")!.closest('[role="tabpanel"]')).toBe(page("decoration"));
    expect(root.querySelector(".ce-render-quality")!.closest('[role="tabpanel"]')).toBe(page("view"));
  });

  it("keeps structural controls in Document and places generation and appearance controls in their owning tabs", () => {
    for (const selector of [".ce-map-size", ".ce-grid-kind", ".ce-grid-step"])
      expect(root.querySelector(selector)!.closest(".ce-document")).not.toBeNull();
    const period = root.querySelector(".ce-document-historical-period")!;
    expect(period.closest('[role="tabpanel"]')).toBe(page("basics"));
    for (const selector of [
      ".ce-document-building-pattern",
      ".ce-housing-culture",
      ".ce-housing-climate",
      ".ce-building-height-mode",
      ".ce-city-height-limits",
      ".ce-generate-castle-style"
    ]) {
      const control = root.querySelector(selector)!;
      expect(control.closest('[role="tabpanel"]')).toBe(page("elements"));
      expect(control.closest(".ce-document")).toBeNull();
    }
    for (const selector of [".ce-model-quality", ".ce-terrain-spacing"])
      expect(root.querySelector(selector)!.closest('[role="tabpanel"]')).toBe(page("view"));
  });

  it("hides feature-dependent settings without discarding their values", () => {
    tab("elements").click();
    const walls = root.querySelector<HTMLInputElement>('[data-feature="walls"]')!;
    const wallSection = root.querySelector<HTMLElement>('[data-generation-requires="walls"]')!;
    const material = select(".ce-generate-wall-material", "wood");
    if (walls.checked) walls.click();
    expect(wallSection.hidden).toBe(true);
    walls.click();
    expect(wallSection.hidden).toBe(false);
    expect(material.value).toBe("wood");
    const citadel = root.querySelector<HTMLInputElement>('[data-feature="citadel"]')!;
    const castleSection = root.querySelector<HTMLElement>('[data-generation-requires="citadel"]')!;
    if (citadel.checked) citadel.click();
    expect(castleSection.hidden).toBe(true);
    citadel.click();
    expect(castleSection.hidden).toBe(false);
    const riverSection = root.querySelector<HTMLElement>('[data-generation-requires="rivers"]')!;
    select(".ce-generate-river-count", "0");
    expect(riverSection.hidden).toBe(true);
    select(".ce-generate-river-count", "1");
    expect(riverSection.hidden).toBe(false);
  });

  it("supports arrow, Home and End navigation with one tab stop", () => {
    tab("basics").focus();
    tab("basics").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(tab("decoration"));
    expect(page("decoration").hidden).toBe(false);
    tab("decoration").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(tab("basics"));
    tab("basics").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(tab("decoration"));
    expect([...root.querySelectorAll<HTMLElement>('[role="tab"]')].filter(button => button.tabIndex === 0)).toEqual([
      tab("decoration")
    ]);
  });

  it("retains the active tab while changing mode and hides every city-only group in Fort mode", () => {
    tab("debug").click();
    select(".ce-generation-mode", "fort");
    expect([...root.querySelectorAll<HTMLElement>(".ce-city-generation-controls")].every(group => group.hidden)).toBe(
      true
    );
    expect(page("debug").hidden).toBe(false);
    select(".ce-generation-mode", "city");
    expect([...root.querySelectorAll<HTMLElement>(".ce-city-generation-controls")].every(group => !group.hidden)).toBe(
      true
    );
    expect(page("basics").hidden).toBe(true);
  });
});
