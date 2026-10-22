import { expect, it } from "vitest";
import type { AerialLandmarkPlan } from "../generators/aerialLandmarks";
import type { DomesticWaterPoint } from "../generators/domesticWater";
import type { CityDocument } from "../types/document";
import { renderAerialLandmarks } from "./aerialLandmarksSvg";
import { renderCityElements } from "./cityElementsSvg";
import type { RenderContext } from "./renderContext";

const basin: DomesticWaterPoint = {
  id: "basin",
  kind: "publicBasin",
  name: "Public Water Basin",
  center: [5, 7],
  radius: 1.7,
  footprint: [],
  access: [
    [5, 7],
    [10, 7]
  ],
  placement: "plaza",
  use: "domestic"
};
const ctx = {
  document: { elements: [{ id: "plaza", kind: "plaza", point: [0, 0] }] } as CityDocument,
  tool: "select",
  selection: {},
  town: true
} as RenderContext;

it("draws the basin at its reserved location and retains inspection metadata", () => {
  const plan: AerialLandmarkPlan = {
    domesticWater: [basin],
    monasteries: [],
    windmills: [],
    barbicans: [],
    tanneries: [],
    gallows: [],
    guildHalls: [],
    guildYards: [],
    storageYards: [],
    gateInns: []
  };
  const layer = renderAerialLandmarks(plan);
  const marker = layer.querySelector(".ce-domestic-water--publicBasin")!;
  expect(marker.querySelector("circle")?.getAttribute("cx")).toBe("5");
  expect(marker.querySelector("circle")?.getAttribute("cy")).toBe("-7");
  expect(marker.querySelectorAll("circle")).toHaveLength(3);
  expect(decodeURIComponent(marker.getAttribute("data-pick")!)).toContain('"waterKind":"publicBasin"');
});

it("uses a fallback basin only without a placement plan, including when the plaza has no free site", () => {
  for (const plan of [undefined, [], [basin]]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    renderCityElements(ctx, svg, new Set(), plan);
    expect(svg.querySelectorAll(".ce-plaza-basin")).toHaveLength(plan ? 0 : 1);
    expect(svg.querySelectorAll(".ce-plaza-well")).toHaveLength(0);
  }
});
