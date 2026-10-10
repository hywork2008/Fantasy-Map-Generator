import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { bindSimulationBurgState } from "../../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import { renderStandaloneCitySvg } from "../render/svg";
import { pointInPolygon } from "./gen/geom";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { facePoints } from "./mesh";

const archive = resolve(process.cwd(), "temp/000.savdata/Borteia 2026-10-10-19-11.fmg");

describe.skipIf(!existsSync(archive))("Tulacen sea port", () => {
  it("draws the ocean in the frame and a sea harbour beside the river port", async () => {
    const buffer = readFileSync(archive);
    const decoded = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
    });
    Object.assign(worldContext, decoded.document.world);
    bindSimulationBurgState(worldContext, decoded.document.simulation);
    const site = getBurgSiteDescriptor(2);
    expect(site?.burg.name).toBe("Tulacen");
    if (!site) return;

    const share = shareFromDescriptor(site);
    expect(share.descriptor?.frame.extentMeters).toBe(1500);
    const document = cityEditorDocument(share);
    expect(document.frame.extentMeters).toBe(1500);
    expect(document.frame.settlementExtentMeters).toBe(600);
    expect(document.frame.meshExtentMeters ?? document.frame.extentMeters).toBe(1500);

    const city = generateCityOnDocument(document, cityEditorSettings(share), share.seed);
    expect(city).not.toBeNull();
    if (!city) return;

    const seaFaces = Object.values(city.mesh.faces).filter(face => face.properties.water === "sea");
    const seaPolygons = seaFaces.map(face => facePoints(city.mesh, face));
    expect(seaFaces.length).toBeGreaterThan(0);
    expect(city.coastalOceanFaceIds?.length ?? 0).toBeGreaterThan(0);
    expect(seaPolygons.some(polygon => pointInPolygon([-700, -700], polygon))).toBe(true);
    expect(seaPolygons.some(polygon => pointInPolygon([0, 0], polygon))).toBe(false);
    expect(city.elements.some(element => element.id === "gc:harbor")).toBe(true);
    expect(city.elements.some(element => element.id === "gc:harbor-sea")).toBe(true);
    expect(city.elements.some(element => element.kind === "ship" && element.shipType !== "barge")).toBe(true);

    const svg = renderStandaloneCitySvg(city);
    expect(svg.querySelector(".ce-face--sea")).not.toBeNull();
    expect(svg.querySelector(".ce-ship")).not.toBeNull();
    expect(svg.querySelector(".ce-buildings")?.childElementCount ?? 0).toBeGreaterThan(0);
  }, 180000);
});
