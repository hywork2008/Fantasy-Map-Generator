import { afterEach, describe, expect, it } from "vitest";
import { isMapContextMenuTarget } from "./mapContextMenu";

describe("isMapContextMenuTarget", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("accepts events from the map svg", () => {
    const map = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    map.id = "map";
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    map.append(circle);
    document.body.append(map);

    expect(isMapContextMenuTarget(circle)).toBe(true);
  });

  it("rejects form fields even when they sit on the map", () => {
    const map = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    map.id = "map";
    const input = document.createElement("input");
    map.append(input);
    document.body.append(map);

    expect(isMapContextMenuTarget(input)).toBe(false);
  });

  it("rejects clicks outside the map", () => {
    const button = document.createElement("button");
    document.body.append(button);

    expect(isMapContextMenuTarget(button)).toBe(false);
  });
});
