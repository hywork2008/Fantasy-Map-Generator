import { afterEach, describe, expect, it } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {};
let cleanup: (() => void) | undefined;
let root: HTMLElement | undefined;
afterEach(() => {
  cleanup?.();
  root?.remove();
});

describe("fort generation mode", () => {
  it("defaults to hex cells and generates a motte and keep even with city population enabled", () => {
    root = document.createElement("div");
    document.body.append(root);
    cleanup = mountCityEditor(root);
    const mode = root.querySelector<HTMLSelectElement>(".ce-generation-mode")!;
    expect(mode.value).toBe("city");
    mode.value = "fort";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector<HTMLSelectElement>(".ce-grid-kind")!.value).toBe("hex");
    expect(root.querySelector<HTMLElement>(".ce-city-generation-controls")!.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>(".ce-complete-generation")!.click();
    expect(root.querySelector(".ce-motte-mound-slope")).not.toBeNull();
    expect(root.querySelector(".ce-castle-precinct")).not.toBeNull();
    const moat = root.querySelector<SVGPathElement>('[data-pick*="fort%3Abailey-moat"]')!;
    moat.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const depth = root.querySelector<HTMLInputElement>(".ce-inspector-edit-section input[type=number]")!;
    expect(depth).not.toBeNull();
    depth.value = "4";
    depth.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector(".ce-status")!.textContent).toContain("valid");
    mode.value = "city";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector<HTMLElement>(".ce-city-generation-controls")!.hidden).toBe(false);
  });
});
