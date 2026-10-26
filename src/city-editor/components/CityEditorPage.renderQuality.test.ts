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

it.each([
  [800, 800],
  [1000, 600],
  [600, 1000]
])("keeps the cursor's map position fixed when zooming in a %i by %i viewport", (width, height) => {
  root = document.createElement("div");
  document.body.append(root);
  mountCityEditor(root);
  const map = root.querySelector<HTMLElement>(".ce-map")!;
  vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
    left: 70,
    top: 40,
    width,
    height,
    x: 70,
    y: 40,
    right: 70 + width,
    bottom: 40 + height,
    toJSON() {}
  });
  const svg = map.querySelector("svg")!;
  const clientX = 70 + width * 0.7;
  const clientY = 40 + height * 0.3;
  const cursorPosition = () => {
    const [x, y, size] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
    const scale = size / Math.min(width, height);
    return [x + size / 2 + (clientX - 70 - width / 2) * scale, y + size / 2 + (clientY - 40 - height / 2) * scale];
  };
  const anchor = cursorPosition();
  // Include consecutive events and both zoom limits.
  for (const deltaY of [-250, -250, 100, -10000, -10000, 10000, 10000]) {
    map.dispatchEvent(new WheelEvent("wheel", { deltaY, clientX, clientY, bubbles: true, cancelable: true }));
    const position = cursorPosition();
    expect(position[0]).toBeCloseTo(anchor[0], 8);
    expect(position[1]).toBeCloseTo(anchor[1], 8);
  }
});
