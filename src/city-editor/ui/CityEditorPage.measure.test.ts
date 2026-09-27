import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { mountCityEditor } from "./CityEditorPage";

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}

describe("City Editor distance measurement feature", () => {
  let root: HTMLElement;

  beforeEach(async () => {
    await i18n.changeLanguage("ja");
    root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
  });

  afterEach(() => {
    root.remove();
  });

  it("shows distance measurement options on right-click", () => {
    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    expect(map).not.toBeNull();

    // Trigger right click
    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 100 }));

    const menu = root.querySelector<HTMLDivElement>(".ce-context-menu")!;
    expect(menu).not.toBeNull();
    expect(menu.hidden).toBe(false);

    const buttons = Array.from(menu.querySelectorAll("button"));
    const fromBtn = buttons.find(b => b.textContent?.includes("ここからの距離"));
    const toBtn = buttons.find(b => b.textContent?.includes("ここまでの距離"));

    expect(fromBtn).toBeDefined();
    expect(toBtn).toBeDefined();
    // Initially "to" button should be disabled because starting point is not set
    expect(toBtn?.disabled).toBe(true);
  });

  it("sets starting point and draws distance line when endpoint is selected", () => {
    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    const menu = root.querySelector<HTMLDivElement>(".ce-context-menu")!;

    // 1. Right-click at (100, 100) and click "Distance from here"
    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 100 }));
    let buttons = Array.from(menu.querySelectorAll("button"));
    const fromBtn = buttons.find(b => b.textContent?.includes("ここからの距離"))!;
    fromBtn.click();

    expect(menu.hidden).toBe(true);

    // Starting point indicator should be rendered
    const getMeasureLayer = () => root.querySelector<SVGGElement>(".ce-measure-layer")!;
    expect(getMeasureLayer()).not.toBeNull();
    const startPoint = getMeasureLayer().querySelector(".ce-measure-point--start");
    expect(startPoint).not.toBeNull();

    // 2. Right-click at (200, 200)
    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }));
    expect(menu.hidden).toBe(false);

    buttons = Array.from(menu.querySelectorAll("button"));
    const toBtn = buttons.find(b => b.textContent?.includes("ここまでの距離"))!;
    expect(toBtn.disabled).toBe(false);

    // Also verify "Clear measurement" option is present
    const clearBtn = buttons.find(b => b.textContent?.includes("計測をクリア"));
    expect(clearBtn).toBeDefined();

    // Click "Distance to here"
    toBtn.click();
    expect(menu.hidden).toBe(true);

    // Plain line, points, and label should now be drawn
    const line = getMeasureLayer().querySelector<SVGLineElement>(".ce-measure-line");
    expect(line).not.toBeNull();

    const points = getMeasureLayer().querySelectorAll(".ce-measure-point");
    expect(points.length).toBe(2);

    const label = getMeasureLayer().querySelector<SVGTextElement>(".ce-measure-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toMatch(/\d+(\.\d+)?\s*(m|km)/);

    // Status message should reflect measured distance
    const status = root.querySelector<HTMLOutputElement>(".ce-status")!;
    expect(status.textContent).toMatch(/距離:\s*\d+/);
  });

  it("clears distance measurement on Escape key", () => {
    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    const menu = root.querySelector<HTMLDivElement>(".ce-context-menu")!;
    const getMeasureLayer = () => root.querySelector<SVGGElement>(".ce-measure-layer")!;

    // Set from & to
    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 50 }));
    menu.querySelectorAll("button")[0].click();

    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 150, clientY: 150 }));
    const toBtn = Array.from(menu.querySelectorAll("button")).find(b => b.textContent?.includes("ここまでの距離"))!;
    toBtn.click();

    expect(getMeasureLayer().querySelector(".ce-measure-line")).not.toBeNull();

    // Press Escape
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // Measurement elements should be removed
    expect(getMeasureLayer().children.length).toBe(0);
  });

  it("clears distance measurement when clicking the distance label", () => {
    const map = root.querySelector<HTMLDivElement>(".ce-map")!;
    const menu = root.querySelector<HTMLDivElement>(".ce-context-menu")!;
    const getMeasureLayer = () => root.querySelector<SVGGElement>(".ce-measure-layer")!;

    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 50 }));
    menu.querySelectorAll("button")[0].click();

    map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 150, clientY: 150 }));
    const toBtn = Array.from(menu.querySelectorAll("button")).find(b => b.textContent?.includes("ここまでの距離"))!;
    toBtn.click();

    const label = getMeasureLayer().querySelector<SVGTextElement>(".ce-measure-label")!;
    expect(label).not.toBeNull();

    // Click label
    label.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(getMeasureLayer().children.length).toBe(0);
  });
});
