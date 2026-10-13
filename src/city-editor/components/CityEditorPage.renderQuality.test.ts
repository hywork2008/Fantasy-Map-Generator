import { afterEach, expect, it, vi } from "vitest";
import { mountCityEditor } from "./CityEditorPage";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
let root: HTMLElement;
afterEach(() => root?.remove());

it("offers quality modes and reuses SVG geometry while zooming and panning", () => {
  root = document.createElement("div");
  document.body.append(root);
  mountCityEditor(root);
  const quality = root.querySelector<HTMLSelectElement>(".ce-render-quality")!;
  expect(quality.value).toBe("auto");
  expect([...quality.options].map(o => o.value)).toEqual(["auto", "detailed", "light", "minimal"]);
  quality.value = "light";
  quality.dispatchEvent(new Event("change"));
  const map = root.querySelector<HTMLElement>(".ce-map")!;
  vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 800,
    width: 800,
    height: 800,
    toJSON() {}
  });
  const svg = map.querySelector("svg")!;
  const face = svg.querySelector(".ce-face")!;
  const diagnostics = vi.fn();
  root.addEventListener("city-render-diagnostics", diagnostics);
  const initialBox = svg.getAttribute("viewBox");
  map.dispatchEvent(new WheelEvent("wheel", { deltaY: -250, bubbles: true, cancelable: true }));
  expect(svg.getAttribute("viewBox")).not.toBe(initialBox);
  const zoomBox = svg.getAttribute("viewBox");
  map.dispatchEvent(new MouseEvent("pointerdown", { button: 1, clientX: 200, clientY: 200, bubbles: true }));
  map.dispatchEvent(new MouseEvent("pointermove", { clientX: 240, clientY: 230, bubbles: true }));
  expect(svg.getAttribute("viewBox")).not.toBe(zoomBox);
  expect(map.querySelector("svg")).toBe(svg);
  expect(svg.querySelector(".ce-face")).toBe(face);
  expect(diagnostics).not.toHaveBeenCalled();
});
