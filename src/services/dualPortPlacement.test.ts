import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { Routes } from "../generators/routes-generator";
import { connectRelocatedBurg, repairDualPortPlacements } from "../runtime/dualPortPlacementTask";
import { bindSimulationBurgState } from "../runtime/simulationBurgState";
import { ChunkedWorldCodecAdapter, decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Route } from "../types/models";
import * as shoreSurvey from "./dualPortShore";
import { SettlementGeometrySession } from "./settlementGeometrySession";
import * as networkGeneration from "./worldLandConnectionRuntime";

afterEach(() => vi.restoreAllMocks());

const archive = resolve(import.meta.dirname, "../../temp/000.savdata/Borteia 2026-10-10-19-11.fmg");
async function loadWorld() {
  const buffer = readFileSync(archive);
  const decoded = await decodeAndValidateWorldArchive({
    blob: new Blob([buffer]),
    header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
  });
  Object.assign(worldContext, decoded.document.world);
  bindSimulationBurgState(worldContext, decoded.document.simulation);
  return decoded.document;
}

it("adds a relocated town's dry connection without rotating an existing bridge", () => {
  const before = { i: 1, cell: 2, x: 10, y: 20 } as Burg;
  const after = { ...before, x: 12, y: 22 };
  const points: Route["points"] = [
    [10, 20, 2],
    [20, 20, 3],
    [30, 20, 4]
  ];
  const route = {
    points: structuredClone(points),
    riverRoadConvergence: {
      originalPoints: structuredClone(points),
      pointsKey: JSON.stringify(points),
      burgIds: [1]
    }
  } as Route;
  connectRelocatedBurg(route, before, after);
  expect(route.points).toEqual([[12, 22, 2], ...points]);
  expect(route.riverRoadConvergence!.originalPoints).toEqual(route.points);
  expect(route.riverRoadConvergence!.pointsKey).toBe(JSON.stringify(route.points));
  delete route.riverRoadConvergence;
  expect(Routes.getRenderPoints(route)).toEqual(route.points);
  expect(Routes.getPath(route)).toContain("L10,20");
});

describe.skipIf(!existsSync(archive))("dual-port real-world placement", () => {
  it("surveys Tulacen using the shared river/coast solver without changing the live city", async () => {
    await loadWorld();
    const burg = worldContext.pack.burgs[2];
    expect(burg.name).toBe("Tulacen");
    const before = JSON.stringify(burg);
    const session = new SettlementGeometrySession();
    session.prepare(worldContext, useOptionsState.getState().distanceUnit);
    const steps = Burgs.dualPortPlacementSteps(burg, session);
    let result = steps.next();
    while (!result.done) result = steps.next();
    expect(JSON.stringify(burg)).toBe(before);
    expect(result.value?.riverPlacement?.coastConstrained).toBe(true);
    expect(result.value?.waterAccess?.port).toMatchObject({ river: true, sea: true });
    expect(Math.hypot(result.value!.x - burg.x, result.value!.y - burg.y)).toBeGreaterThan(0);
    // The synchronous generation entry uses the same coast/bank selection.
    Burgs.resiteRiverBurgs([2]);
    expect([burg.x, burg.y]).toEqual([result.value!.x, result.value!.y]);
    expect(burg.riverPlacement?.coastConstrained).toBe(true);
  }, 60000);

  it("repairs a loaded map and leaves locked cities unchanged", async () => {
    const document = await loadWorld();
    const locked = worldContext.pack.burgs.find(b => b.i && b.i !== 2)!;
    locked.lock = true;
    const saved = JSON.stringify(locked);
    await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
    expect(worldContext.pack.burgs[2].riverPlacement?.coastConstrained).toBe(true);
    expect(JSON.stringify(locked)).toBe(saved);
    const positions = JSON.stringify(worldContext.pack.burgs);
    const roads = JSON.stringify(worldContext.pack.routes);
    await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
    expect(JSON.stringify(worldContext.pack.burgs)).toBe(positions);
    expect(JSON.stringify(worldContext.pack.routes)).toBe(roads);
    const blob = await new ChunkedWorldCodecAdapter().encode(document);
    const restored = await decodeAndValidateWorldArchive({
      blob,
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer())
    });
    expect(restored.document.world.pack.burgs[2].riverPlacement?.coastConstrained).toBe(true);
    expect(restored.document.world.pack.routes.filter(r => r.fixedSettlementApproach).length).toBeGreaterThan(0);
  }, 60000);

  it("exports the repaired city's ocean and both harbours to CE", async () => {
    await loadWorld();
    await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
    const { getBurgSiteDescriptor } = await import("./burgSiteDescriptor");
    const { shareFromDescriptor } = await import("../city-editor/io/incomingCity");
    const { cityEditorDocument, cityEditorSettings } = await import("../city-editor/core/housingReport");
    const { generateCityOnDocument } = await import("../city-editor/core/generate");
    const site = getBurgSiteDescriptor(2)!;
    const share = shareFromDescriptor(site);
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
    expect(Object.values(city.mesh.faces).some(f => f.properties.water === "sea")).toBe(true);
    expect(city.elements.some(e => e.id === "gc:harbor")).toBe(true);
    expect(city.elements.some(e => e.id === "gc:harbor-sea")).toBe(true);
  }, 60000);

  it("does not move cities when re-engineering a registered network fails", async () => {
    await loadWorld();
    worldContext.options.landConnectionGeneration = {} as NonNullable<
      typeof worldContext.options.landConnectionGeneration
    >;
    const before = JSON.stringify(worldContext.pack.burgs);
    const roads = JSON.stringify(worldContext.pack.routes);
    const generate = vi
      .spyOn(networkGeneration, "generateWorldLandConnections")
      .mockReturnValue({ reason: "test-unresolved" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).not.toBe(worldContext);
    expect(JSON.stringify(worldContext.pack.burgs)).toBe(before);
    expect(JSON.stringify(worldContext.pack.routes)).toBe(roads);
    expect(warn).toHaveBeenCalled();
  }, 60000);

  it("does not publish proposals after a cancelled map-ready run", async () => {
    await loadWorld();
    const before = JSON.stringify(worldContext.pack.burgs);
    const roads = JSON.stringify(worldContext.pack.routes);
    let active = true;
    await repairDualPortPlacements({
      isCurrent: () => active,
      reportProgress: () => {
        active = false;
      }
    });
    expect(JSON.stringify(worldContext.pack.burgs)).toBe(before);
    expect(JSON.stringify(worldContext.pack.routes)).toBe(roads);
  }, 60000);

  it("retains the old river reservation when no joint coast site is supported", async () => {
    await loadWorld();
    const survey = shoreSurvey.dualPortShore;
    vi.spyOn(shoreSurvey, "dualPortShore").mockImplementation((...args) => {
      const shore = survey(...args);
      return shore && { ...shore, accepts: () => false };
    });
    const burg = worldContext.pack.burgs[2];
    const before = JSON.stringify(burg);
    Burgs.resiteRiverBurgs([2]);
    expect(JSON.stringify(burg)).toBe(before);
  }, 60000);
});
