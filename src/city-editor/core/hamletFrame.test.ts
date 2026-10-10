import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { shareFromDescriptor } from "../io/incomingCity";
import {
  createGridDocument,
  descriptorFrameGridOptions,
  fitUndersizedTownFrame,
  nPatchesForTownCells,
  seaPortShoreDistanceMeters,
  townMeshExtentMeters
} from "./document";
import { buildBlockFabric } from "./gen/blockInfill";
import { pointInPolygon } from "./gen/geom";
import { DEFAULT_SITE_CONFIG } from "./gen/site/siteConfig";
import { synthSite } from "./gen/site/synthSite";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { facePoints } from "./mesh";

describe("fitUndersizedTownFrame", () => {
  it("frames a floored 80 m hamlet on Micro with cells wide enough for houses", () => {
    const fit = fitUndersizedTownFrame(80, 1500);
    expect(fit).toMatchObject({ size: "micro", extentMeters: 300, cityRadiusMeters: 80, nPatches: 6 });
    expect(nPatchesForTownCells(300)).toBe(6);
  });

  it("steps a 128 m village up to Tiny so the town and its river both fit", () => {
    expect(fitUndersizedTownFrame(128, 1500)).toMatchObject({
      size: "tiny",
      extentMeters: 600,
      cityRadiusMeters: 128
    });
  });

  it("leaves a window that already matches the town", () => {
    expect(fitUndersizedTownFrame(396, 1200)).toBeNull();
    expect(fitUndersizedTownFrame(1500, 4500)).toBeNull();
    expect(fitUndersizedTownFrame(80, 300)).toBeNull();
  });
});

describe("townMeshExtentMeters", () => {
  const frame = { extentMeters: 1500, cityRadiusMeters: 128, regionalMode: true };
  const shore = [
    [-227.7, -750],
    [-750, -53.6]
  ] as [number, number][];

  it("keeps a river-only mesh on the near bank", () => {
    expect(townMeshExtentMeters(frame, true, 492)).toBe(1032);
    expect(townMeshExtentMeters(frame, true, 492, 0)).toBe(1032);
  });

  it("keeps the whole frame when a sea-port shore already lies inside it", () => {
    expect(townMeshExtentMeters(frame, true, 492, 632)).toBe(1500);
    const grid = descriptorFrameGridOptions(frame, true, 492, 632);
    expect(grid.extentMeters).toBe(1500);
    expect(grid.meshExtentMeters).toBeUndefined();
    expect(grid.settlementExtentMeters).toBe(600);
  });

  it("keeps a coast inside a corner of the square frame", () => {
    const site = {
      burg: { waterAccess: { port: { sea: true, lake: false } } },
      waterbody: {
        shoreline: [
          [
            [-750, -600],
            [-600, -750]
          ]
        ] as [number, number][][]
      }
    };
    const distance = seaPortShoreDistanceMeters(site);
    expect(distance).toBe(675);
    expect(townMeshExtentMeters(frame, true, 492, distance)).toBe(1500);
  });

  it("measures a sea-port shore and ignores a shoreline that is not a sea or lake port", () => {
    const site = {
      burg: { waterAccess: { port: { sea: true, lake: false, river: true } } },
      waterbody: { shoreline: [shore] }
    };
    expect(seaPortShoreDistanceMeters(site)).toBeCloseTo(451.4, 0);
    expect(
      seaPortShoreDistanceMeters({
        burg: { waterAccess: { port: { sea: false, lake: false, river: true } } },
        waterbody: { shoreline: [shore] }
      })
    ).toBe(0);
  });
});

describe("walled hamlet dwellings", () => {
  it("builds a walled core of dwellings when FMG floored the window at 1500 m", () => {
    const raw = synthSite(
      "smallTown",
      {
        ...DEFAULT_SITE_CONFIG,
        coast: "none",
        rivers: [],
        relief: false,
        features: {
          ...DEFAULT_SITE_CONFIG.features,
          walls: true,
          citadel: false,
          plaza: false,
          temple: false,
          port: false,
          shanty: false
        }
      },
      "hamlet-dwellings",
      { extentMeters: 1500, cityRadiusMeters: 80 }
    );
    raw.burg.walls = true;
    const share = shareFromDescriptor(raw);
    expect(share.size).toBe("micro");
    expect(share.descriptor?.frame.extentMeters).toBe(300);
    expect(share.descriptor?.frame.cityRadiusMeters).toBe(80);
    expect(share.measureBlockSize).toBe(true);
    expect(raw.frame.extentMeters).toBe(1500);

    const document = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: "hamlet-dwellings",
      patchParams: share.patchParams,
      extentMeters: share.descriptor?.frame.extentMeters,
      cityRadiusMeters: share.descriptor?.frame.cityRadiusMeters,
      measureBlockSize: share.measureBlockSize
    });
    expect(document.frame.blockSizeMeters).toBeGreaterThanOrEqual(28);
    expect(document.frame.blockSizeMeters).toBeLessThan(50);

    const settings = defaultGenerationSettings();
    settings.descriptor = share.descriptor;
    const city = generateCityOnDocument(document, settings, "hamlet-dwellings");
    expect(city).not.toBeNull();
    const buildings = buildBlockFabric(city!).buildings;
    const core = buildings.filter(lot => city!.mesh.faces[lot.faceId]?.properties.settlement === "core").length;
    expect(core).toBeGreaterThan(30);
  });

  it("keeps a river village on Tiny and still fills the core with dwellings", () => {
    const raw = synthSite(
      "smallTown",
      {
        ...DEFAULT_SITE_CONFIG,
        coast: "none",
        rivers: ["through"],
        relief: false,
        features: {
          ...DEFAULT_SITE_CONFIG.features,
          walls: true,
          citadel: false,
          plaza: false,
          temple: false,
          port: false,
          shanty: false
        }
      },
      "river-village",
      { extentMeters: 1500, cityRadiusMeters: 128 }
    );
    raw.burg.walls = true;
    const share = shareFromDescriptor(raw);
    expect(share.size).toBe("tiny");
    const document = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: "river-village",
      patchParams: share.patchParams,
      extentMeters: share.descriptor?.frame.extentMeters,
      cityRadiusMeters: share.descriptor?.frame.cityRadiusMeters,
      measureBlockSize: share.measureBlockSize
    });
    const settings = defaultGenerationSettings();
    settings.descriptor = share.descriptor;
    const city = generateCityOnDocument(document, settings, "river-village");
    expect(city?.appearance).toBe("town");
    const buildings = buildBlockFabric(city!).buildings;
    const core = buildings.filter(lot => city!.mesh.faces[lot.faceId]?.properties.settlement === "core").length;
    expect(core).toBeGreaterThan(30);
  });
});

const alyatland = resolve(process.cwd(), "temp/Alyatland 2026-09-28-02-26.fmg");

describe.skipIf(!existsSync(alyatland))("Alyatland hamlet hand-off", () => {
  it("gives the walled hamlets a dwelling core and keeps the capital framed", async () => {
    const buffer = readFileSync(alyatland);
    const validated = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(4, buffer.byteLength))
    });
    Object.assign(worldContext, validated.document.world);
    const { bindSimulationBurgState } = await import("../../runtime/simulationBurgState");
    bindSimulationBurgState(worldContext, validated.document.simulation);

    const minimumCoreBuildings: Record<number, number> = { 157: 30, 207: 30, 385: 30, 123: 30, 1: 100 };
    for (const id of [157, 207, 385, 123, 1]) {
      const descriptor = getBurgSiteDescriptor(id);
      expect(descriptor, String(id)).not.toBeNull();
      if (!descriptor) continue;
      const share = shareFromDescriptor(descriptor);
      const document = createGridDocument({
        size: share.size,
        grid: share.grid,
        seed: share.gridSeed ?? share.seed,
        patchParams: share.patchParams,
        ...(share.descriptor ? descriptorFrameGridOptions(share.descriptor.frame) : {}),
        measureBlockSize: share.measureBlockSize
      });
      const settings = defaultGenerationSettings();
      settings.descriptor = share.descriptor;
      const city = generateCityOnDocument(document, settings, descriptor.burg.seed);
      expect(city, descriptor.burg.name).not.toBeNull();
      if (!city) continue;
      const origin = Object.values(city.mesh.faces).find(face => pointInPolygon([0, 0], facePoints(city.mesh, face)));
      expect(origin?.properties.water, descriptor.burg.name).not.toBe("sea");
      expect(origin?.properties.water, descriptor.burg.name).not.toBe("lake");
      const core = buildBlockFabric(city).buildings.filter(
        lot => city.mesh.faces[lot.faceId]?.properties.settlement === "core"
      ).length;
      expect(core, `${descriptor.burg.name} core`).toBeGreaterThanOrEqual(
        Math.min(minimumCoreBuildings[id], descriptor.burg.dwellings)
      );
      if (id === 1) expect(share.size).not.toBe("micro");
    }
  }, 120_000);
});
