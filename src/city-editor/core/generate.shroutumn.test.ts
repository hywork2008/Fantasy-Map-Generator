import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { parseDocument } from "./document";
import shroutumn from "./fixtures/shroutumn-20261003.json";
import { buildBlockFabric, FabricCache } from "./gen/blockInfill";
import { HOUSING_FIT_TOLERANCE } from "./gen/fitImportedHousing";
import { polygonArea } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { facePoints, validate } from "./mesh";

describe("Shroutumn FMG dwelling density", () => {
  it("fits 723 dwellings within the housing allowance and preserves their visible coverage", () => {
    const share = parseIncomingPayload(JSON.stringify(shroutumn))!;
    expect(share.descriptor?.burg.dwellings).toBe(723);
    const input = cityEditorDocument(share);
    const city = generateCityOnDocument(input, cityEditorSettings(share), share.seed)!;
    expect(city).not.toBeNull();
    expect(validate(city)).toEqual([]);
    expect(city.frame).toEqual(input.frame);
    const fabric = buildBlockFabric(city, new FabricCache());
    const houses = fabric.buildings.filter(
      lot => !lot.landmark && (!lot.role || lot.role === "main") && (!lot.uses || lot.uses.includes("residential"))
    );
    expect(houses.length).toBeGreaterThanOrEqual(Math.ceil(723 * (1 - HOUSING_FIT_TOLERANCE)));
    expect(houses.length).toBeLessThanOrEqual(Math.floor(723 * (1 + HOUSING_FIT_TOLERANCE)));
    const inhabited = new Set(houses.map(lot => lot.faceId));
    const districts = city.fabric!.districts.filter(district => district.faceIds.some(id => inhabited.has(id)));
    expect(districts.every(district => district.parameters.occupancy > 0 && district.parameters.occupancy <= 1)).toBe(
      true
    );
    const residentialArea = Object.values(city.mesh.faces)
      .filter(face => inhabited.has(face.id))
      .reduce((sum, face) => sum + Math.abs(polygonArea(facePoints(city.mesh, face))), 0);
    const coveredArea = houses.reduce((sum, lot) => sum + Math.abs(polygonArea(lot.polygon)), 0);
    // Occupancy fitting preserves metre-scale houses rather than shrinking
    // buildings to force a fixed fraction of the entire district area.
    expect(coveredArea / houses.length).toBeGreaterThan(20);
    expect(coveredArea).toBeLessThan(residentialArea);
    const svg = renderStandaloneCitySvg(city);
    expect(svg.querySelectorAll(".ce-buildings > .ce-building:not(.ce-building--landmark)")).toHaveLength(
      fabric.buildings.filter(lot => !lot.landmark).length
    );
    expect(Number(svg.getAttribute("data-core-buildings"))).toBe(
      fabric.buildings.filter(lot => city.mesh.faces[lot.faceId].properties.settlement === "core").length
    );
    expect(svg.querySelectorAll(".ce-pier").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".ce-ship").length).toBeGreaterThan(0);
    const reopened = parseDocument(JSON.stringify(city))!;
    expect(reopened).not.toBeNull();
    expect(buildBlockFabric(reopened, new FabricCache()).buildings).toEqual(fabric.buildings);
    if (process.env.CE_SHROUTUMN_EXPORT) writeFileSync(process.env.CE_SHROUTUMN_EXPORT, svg.outerHTML);
    if (process.env.CE_SHROUTUMN_REPORT) {
      writeFileSync(
        process.env.CE_SHROUTUMN_REPORT,
        JSON.stringify({
          dwellings: 723,
          houses: houses.length,
          housingCoverage: coveredArea / residentialArea,
          piers: svg.querySelectorAll(".ce-pier").length,
          ships: svg.querySelectorAll(".ce-ship").length
        })
      );
    }
  });
});
