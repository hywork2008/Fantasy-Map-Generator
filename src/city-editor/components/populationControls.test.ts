import { afterEach, describe, expect, it, vi } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  if (location.hash) window.history.replaceState(null, "", location.pathname + location.search);
});
function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  dispose = mountCityEditor(root);
  return root;
}
describe("population generation controls", () => {
  it("keeps and shares the reused population grid and its inner-wall checkpoint", async () => {
    const root = mount();
    const population = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    population.value = "15000";
    population.dispatchEvent(new Event("change", { bubbles: true }));
    const rings = root.querySelector<HTMLSelectElement>(".ce-generate-town-wall-rings")!;
    rings.value = "double";
    rings.dispatchEvent(new Event("change", { bubbles: true }));
    const seed = root.querySelector<HTMLInputElement>(".ce-generate-seed")!;
    for (const value of ["startup-3", "1q68ihz"]) {
      seed.value = value;
      seed.dispatchEvent(new Event("input", { bubbles: true }));
      seed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    expect(root.querySelector<HTMLInputElement>(".ce-population-enabled")!.checked).toBe(true);
    const slider = root.querySelector<HTMLInputElement>(".ce-generate-stage-slider")!;
    slider.value = "11";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const walls = [...root.querySelectorAll(".ce-feature--wall[data-pick]")].map(
      node => JSON.parse(decodeURIComponent(node.getAttribute("data-pick")!)).id as string
    );
    expect(walls.some(id => id.startsWith("gc:inner-wall-"))).toBe(true);
    const geometry = (element: HTMLElement) =>
      [...element.querySelectorAll(".ce-svg path, .ce-svg polygon, .ce-svg circle")].map(node => [
        node.tagName,
        node.getAttribute("d"),
        node.getAttribute("points"),
        node.getAttribute("cx"),
        node.getAttribute("cy"),
        node.getAttribute("r")
      ]);
    const before = geometry(root);
    const writes: string[] = [];
    Object.assign(navigator, { clipboard: { writeText: async (value: string) => writes.push(value) } });
    [...root.querySelectorAll("button")].find(button => button.textContent?.includes("Copy shareable link"))!.click();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    dispose?.();
    root.remove();
    window.history.replaceState(null, "", writes[0]);
    const replay = mount();
    expect(replay.querySelector<HTMLInputElement>(".ce-generate-stage-slider")!.value).toBe("11");
    expect(geometry(replay)).toEqual(before);
  });

  it("defaults to 5,000 residents and single walls and previews the Paris population without regenerating", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    expect(input.value).toBe("5000");
    const estimate = () => root.querySelector(".ce-population-estimate")!.textContent!;
    expect(estimate()).toMatch(/\d+\.\d{2}\s*km²/);
    expect(estimate()).not.toContain("{{");
    expect(root.querySelector<HTMLSelectElement>(".ce-generate-town-wall-rings")!.value).toBe("single");
    expect(input.max).toBe("220000");
    expect(root.querySelector<HTMLInputElement>(".ce-population-enabled")!.checked).toBe(true);
    const before = root.querySelector("svg")!.outerHTML;
    input.value = "150000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector(".ce-population-estimate")!.textContent).toContain("33,334");
    expect(root.querySelector("svg")!.outerHTML).toBe(before);
    expect(root.querySelector<HTMLElement>(".ce-population-controls")!.dataset.valid).toBe("true");
  });
  it("accepts the maximum population of 220,000", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    input.value = "220000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.validity.valid).toBe(true);
    expect(root.querySelector<HTMLElement>(".ce-population-controls")!.dataset.valid).toBe("true");
    expect(root.querySelector(".ce-population-estimate")!.textContent).toContain("48,889");
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
  }, 180_000);
  it("blocks empty, fractional and excessive populations without restoring a previous value", () => {
    const root = mount();
    const input = root.querySelector<HTMLInputElement>(".ce-population-input")!;
    for (const raw of ["", "1.5", "220001", "-5"]) {
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
