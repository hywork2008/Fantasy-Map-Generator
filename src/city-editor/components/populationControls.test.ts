import { afterEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
  return root;
}
describe("population generation controls", () => {
  it("defaults to 3,000 residents and previews the Paris population without regenerating", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    expect(input.value).toBe("3000");
    expect(root.querySelector<HTMLInputElement>(".ce-population-enabled")!.checked).toBe(true);
    const before = root.querySelector("svg")!.outerHTML;
    input.value = "150000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector(".ce-population-estimate")!.textContent).toContain("33,334");
    expect(root.querySelector("svg")!.outerHTML).toBe(before);
    expect(root.querySelector<HTMLElement>(".ce-population-controls")!.dataset.valid).toBe("true");
  });
  it("fits the viewport and size control to an automatically enlarged population map", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    input.value = "150000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (const [selector, value] of [
      [".ce-generate-river-count", "0"],
      [".ce-generate-town-wall-rings", "single"]
    ]) {
      const control = root.querySelector<HTMLSelectElement>(selector)!;
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
    seed.value = "paris-population";
    seed.dispatchEvent(new Event("change", { bubbles: true }));
    [...root.querySelectorAll("button")].find(b => b.textContent!.includes("🏘"))!.click();
    const svg = root.querySelector<SVGSVGElement>("svg[data-population-report]")!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("viewBox")).toBe("-2400 -2400 4800 4800");
    const shape = svg.querySelector("[data-residential-cluster]")!;
    const pick = JSON.parse(decodeURIComponent(shape.getAttribute("data-pick")!));
    expect(pick.id).toBe(shape.getAttribute("data-residential-cluster"));
    expect(pick.assignedPopulation).toBeGreaterThan(0);
    expect(pick.assignedDwellings).toBeLessThanOrEqual(pick.residentialCapacity);
    expect(root.querySelector<HTMLSelectElement>(".ce-map-size")!.value).toBe("large");
  });
  it("blocks empty, fractional and excessive populations without restoring a previous value", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    for (const raw of ["", "1.5", "150001", "-5"]) {
      input.value = raw;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      expect(input.value).toBe(raw);
      expect(root.querySelector<HTMLElement>(".ce-population-controls")!.dataset.valid).toBe("false");
    }
  });
  it("keeps unsupported periods explicit", () => {
    const root = mount();
    const period = root.querySelector<HTMLSelectElement>(".ce-document-historical-period")!;
    period.value = "steamEra";
    period.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector<HTMLElement>(".ce-population-controls")!.dataset.valid).toBe("false");
  });
});
