import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { bindSimulationBurgState } from "../../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { renderStandaloneCitySvg } from "../renderers/standaloneSvg";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { shareFromDescriptor } from "../services/io/incomingCity";
import { buildCityBuildings } from "./buildingLots";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";

const archive = resolve(process.cwd(), "temp/000.savdata/Craia 2026-10-10-21-13.fmg");

it("keeps small-town blocks fine in a wide coastal window", () => {
  const document = createGridDocument({
    size: "tiny",
    grid: "evolution",
    seed: "3605804880019",
    extentMeters: 1992,
    settlementExtentMeters: 300,
    cityRadiusMeters: 102,
    patchParams: { nPatches: 5, relaxCount: 4, relaxPasses: 3 },
    measureBlockSize: true
  });
  expect(document.frame.blockSizeMeters).toBeLessThan(50);
  expect(document.frame.extentMeters).toBe(1992);
  expect(document.frame.settlementExtentMeters).toBe(300);
});

describe.skipIf(!existsSync(archive))("Toralo coastal town", () => {
  it("places housing in the burg's core without inflating its defenses", async () => {
    const buffer = readFileSync(archive);
    const decoded = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
    });
    Object.assign(worldContext, decoded.document.world);
    bindSimulationBurgState(worldContext, decoded.document.simulation);
    const burg = worldContext.pack.burgs.find((burg: any) => burg?.name === "Toralo")!;
    const site = getBurgSiteDescriptor(burg.i)!;
    expect(site.burg.population).toBe(1261);
    expect(site.burg.dwellings).toBe(281);
    expect(site.rivers[0].crossesSite).toBe(false);
    const share = shareFromDescriptor(site);
    const document = cityEditorDocument(share);
    const settings = cityEditorSettings(share);
    // The debug path must also succeed on the requested seed, without recovery.
    const rejected: unknown[] = [];
    const city = generateCityOnDocument(document, settings, share.seed, undefined, preview => rejected.push(preview));
    expect(rejected).toEqual([]);
    expect(city).not.toBeNull();
    if (!city) return;
    expect(city.generationSeed).toBe(share.seed);
    expect(city.frame.blockSizeMeters).toBeLessThan(50);
    const buildings = buildCityBuildings(city);
    const core = buildings.filter(lot => city.mesh.faces[lot.faceId]?.properties.settlement === "core");
    expect(core.length).toBeGreaterThanOrEqual(site.burg.dwellings * 0.9);
    expect(core.length / buildings.length).toBeGreaterThan(0.8);
    for (const group of city.featureGroups.filter(group => group.kind === "wall"))
      expect(group.style.widthMeters).toBeLessThan(8);
    if (process.env.CE_TORALO_EXPORT)
      writeFileSync(process.env.CE_TORALO_EXPORT, renderStandaloneCitySvg(city).outerHTML);
  }, 180000);
});
