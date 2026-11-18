import * as THREE from "three";
import { expect, it } from "vitest";
import { MODEL_SHIP_TYPES, SHIP_DIMENSIONS } from "../../city-editor/data/ships";
import { normalizeShipType } from "../../city-editor/generators/ships";
import { modelShipExtent, modelShipVariant } from "../../city-editor/renderers/modelShips";
import type { ShipSite } from "../../city-editor/renderers/shipSites";
import { renderShipSvg } from "../../city-editor/renderers/shipSvg";
import { createTownShips } from "./shipMeshes";

it("keeps the Model Viewer ship types through save data and sizes them overall", () => {
  for (const type of MODEL_SHIP_TYPES) {
    expect(normalizeShipType(type)).toBe(type);
    // The catalogue length is the model's overall length.
    const model = modelShipVariant(type).create();
    expect(modelShipExtent(model).length).toBeCloseTo(SHIP_DIMENSIONS[type].baseLengthMeters, 0);
    model.dispose();
  }
  // Older aliases are unchanged: a saved "galley" stays the caravel-sized ship.
  expect(normalizeShipType("galley")).toBe("medium");
});

it("places a carrier in 3D at its overall length, bow along the site rotation, and draws its plan", () => {
  const site: ShipSite = { id: "cvn", type: "carrier", point: [100, -50], rotation: Math.PI / 2, length: 300 };
  const ships = createTownShips([site], () => 1);
  const bounds = new THREE.Box3().setFromObject(ships.group);
  // Rotated a quarter turn, the carrier lies along the plan's X axis (three.js X).
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(300, 0);
  expect((bounds.max.x + bounds.min.x) / 2).toBeCloseTo(100, 0);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo((78 * 300) / 337, 0);
  ships.dispose();
  const svg = renderShipSvg({ type: "carrier", point: [0, 0] });
  expect(svg.getAttribute("data-ship-type")).toBe("carrier");
  expect(svg.querySelector(".ce-ship-model-plan image")?.getAttribute("href")).toMatch(/^data:image\/svg\+xml/);
});
