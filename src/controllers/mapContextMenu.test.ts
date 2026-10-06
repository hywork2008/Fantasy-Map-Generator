import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { getMapContextMenuState, setMapContextMenuState } from "../store/mapContextMenuState";
import * as cityHandshake from "./city-editor-handshake";
import {
  isMapContextMenuTarget,
  resolveBurgAtTargetOrPoint,
  resolveBurgFromElement,
  resolveProvinceAtMapPoint,
  triggerOpenCityEditor,
  triggerOpenRegionEditor
} from "./mapContextMenu";
import * as regionHandshake from "./region-editor-handshake";

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

describe("resolveBurgFromElement & resolveBurgAtTargetOrPoint", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    worldContext.pack = {
      burgs: [
        undefined as any,
        { i: 1, name: "City A", x: 100, y: 100, removed: false, cell: 10 } as any,
        { i: 2, name: "Town B", x: 200, y: 200, removed: false, cell: 20 } as any,
        { i: 3, name: "Removed C", x: 300, y: 300, removed: true, cell: 30 } as any
      ]
    } as any;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("resolves burg when target is inside #burgIcons", () => {
    const iconsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    iconsGroup.id = "burgIcons";
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("data-id", "1");
    iconsGroup.append(circle);
    document.body.append(iconsGroup);

    expect(resolveBurgFromElement(circle)).toEqual({ id: 1, name: "City A" });
    expect(resolveBurgAtTargetOrPoint(circle, 0, 0)).toEqual({ id: 1, name: "City A" });
  });

  it("resolves burg when target is inside #burgLabels", () => {
    const labelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelsGroup.id = "burgLabels";
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("data-id", "2");
    labelsGroup.append(text);
    document.body.append(labelsGroup);

    expect(resolveBurgFromElement(text)).toEqual({ id: 2, name: "Town B" });
    expect(resolveBurgAtTargetOrPoint(text, 0, 0)).toEqual({ id: 2, name: "Town B" });
  });

  it("returns null for removed burgs or unrelated elements", () => {
    const iconsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    iconsGroup.id = "burgIcons";
    const removedCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    removedCircle.setAttribute("data-id", "3");
    iconsGroup.append(removedCircle);
    document.body.append(iconsGroup);

    expect(resolveBurgFromElement(removedCircle)).toBeNull();

    const otherDiv = document.createElement("div");
    document.body.append(otherDiv);
    expect(resolveBurgFromElement(otherDiv)).toBeNull();
  });
});

describe("resolveProvinceAtMapPoint", () => {
  beforeEach(() => {
    worldContext.pack = {
      cells: {
        p: [
          [50, 50],
          [100, 100],
          [200, 200]
        ],
        province: [0, 1, 0]
      },
      burgs: [
        undefined as any,
        { i: 1, name: "City A", x: 100, y: 100, removed: false, cell: 1 } as any,
        { i: 2, name: "Port B", x: 200, y: 200, removed: false, cell: 1 } as any
      ],
      provinces: [undefined as any, { i: 1, name: "North Province", removed: false } as any]
    } as any;
  });

  it("resolves province for land cell that has a province", () => {
    // Cell 1 has province 1
    const result = resolveProvinceAtMapPoint(100, 100);
    expect(result).toEqual({ id: 1, name: "North Province" });
  });

  it("falls back to burg cell province when target coordinate has no province", () => {
    // Cell 2 has province 0, but burg 2 has cell 1 which has province 1
    const result = resolveProvinceAtMapPoint(200, 200, 2);
    expect(result).toEqual({ id: 1, name: "North Province" });
  });

  it("returns null when no province is present", () => {
    const result = resolveProvinceAtMapPoint(200, 200, null);
    expect(result).toBeNull();
  });
});

describe("triggerOpenCityEditor & triggerOpenRegionEditor", () => {
  beforeEach(() => {
    setMapContextMenuState({ isOpen: true });
  });

  it("triggerOpenCityEditor closes context menu and calls openCityEditorForBurg", () => {
    const openCitySpy = vi.spyOn(cityHandshake, "openCityEditorForBurg").mockReturnValue(true);
    triggerOpenCityEditor(1);

    expect(getMapContextMenuState().isOpen).toBe(false);
    expect(openCitySpy).toHaveBeenCalledWith(1);
    openCitySpy.mockRestore();
  });

  it("triggerOpenRegionEditor closes context menu and calls openRegionEditor", () => {
    const openRegionSpy = vi.spyOn(regionHandshake, "openRegionEditor").mockImplementation(() => {});
    triggerOpenRegionEditor(2);

    expect(getMapContextMenuState().isOpen).toBe(false);
    expect(openRegionSpy).toHaveBeenCalledWith(2);
    openRegionSpy.mockRestore();
  });
});
