import { select } from "d3";
import { describe, expect, it } from "vitest";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { createLandCalibrationWorldFixture } from "../generators/fixtures/landConnectionCalibrationWorld";
import { LAND_CONNECTION_CALIBRATION_PROFILES } from "../generators/landConnectionCalibrationProfiles";
import { RoutesRenderer } from "../renderers/draw-routes";
import { buildRegisteredLandRouteScene } from "../renderers/registeredLandRouteScene";
import { buildRoutePaths } from "../renderers/webgl/adapters/deckDataAdapters";
import { useOptionsState } from "../store/optionsState";
import {
  generateWorldLandConnections,
  getWorldLandConnectionCurrent,
  type WorldLandConnectionGenerationSettings
} from "./worldLandConnectionRuntime";

function fixture() {
  const f = createLandCalibrationWorldFixture(),
    world = f.world;
  world.options = {};
  world.pack.rivers[0].points = world.pack.cells.p.map(p => [...p]);
  world.pack.cells.p = Array.from({ length: 6 }, (_, i) => [((i + 0.5) * 100) / 6, 50]);
  world.pack.cells.i = Uint16Array.from([0, 1, 2, 3, 4, 5]);
  world.pack.cells.state = new Uint16Array(6);
  world.pack.cells.v = Array.from({ length: 6 }, (_, i) => [i, i + 1, i + 8, i + 7]);
  world.pack.vertices = {
    p: [0, 100].flatMap(y => Array.from({ length: 7 }, (_, i) => [(i * 100) / 6, y]))
  } as typeof world.pack.vertices;
  f.input.settings.sharedSelection = { maxGroups: 4, maxPairsPerGroup: 3, maxFacilitiesPerGroup: 2, maxChecks: 10000 };
  f.input.settings.individual.maxConstructionCostMeters = 1000;
  f.input.settings.shared.maxConstructionCostMeters = 1000;
  const counts = { networkLabels: 10000, networkExpansions: 10000, approachLabels: 10000, approachExpansions: 10000 };
  const settings: WorldLandConnectionGenerationSettings = {
    settings: f.input.settings,
    calibration: {
      ...LAND_CONNECTION_CALIBRATION_PROFILES.lenient,
      bridgeFixedCostMeters: 0.1,
      bridgeCostPerSquareMeter: 0,
      bridgeLongSpanCostPerCubicMeter: 0,
      bridgeUseCostMeters: 0.1,
      bridgeUseCostPerMeter: 0,
      approachCostPerSquareMeter: 0
    },
    nearby: {
      maxCities: 10,
      maxNeighbourChecks: 100,
      maxNeighboursPerCity: 2,
      maxPairs: 3,
      radiusMeters: 100,
      firstPairId: 0
    },
    measurements: { networkLabels: 0, networkExpansions: 0, approachLabels: 0, approachExpansions: 0 },
    budgetPolicy: { headroom: 1, minimum: counts, ceiling: counts, maxAssessmentSearches: 300 },
    cellPolicySettings: { maxCells: 10, maxVertices: 100, maxClipOperations: 10000, maxRemainingPieces: 100 },
    allowedStateIds: [0],
    maximumSupportedHeight: 50,
    capabilities: { 7: { depthMeters: 3 } },
    dryBaseline: {
      guides: {
        spacingMeters: 20,
        roadWidthMeters: 2,
        firstNodeId: 10000,
        maxCells: 10,
        maxVertices: 100,
        maxSamples: 5000,
        maxSourceNodes: 5000,
        maxSourceEdges: 20000,
        maxNeighbourChecks: 50000
      },
      firstConnectionId: 10,
      maxSearches: 1000
    },
    adoption: { maxSelections: 10, maxCurrentEvaluations: 30, maxRelatedReevaluations: 1 },
    archive: {
      maxJsonCharacters: 4000000,
      rivers: { maxJsonCharacters: 100000, maxRivers: 10 },
      connections: {
        maxJsonCharacters: 3000000,
        maxFacilities: 10,
        maxNodes: 100,
        maxEdges: 100,
        maxCorridorPieces: 1000,
        maxGuideNodes: 10000,
        maxGuideEdges: 100000,
        maxArcSections: 100
      }
    },
    scene: { maxChordErrorMeters: 0.05, maxArcSections: 100, maxPieces: 1000, maxPaths: 1000, maxPolygons: 10000 }
  };
  world.options.landConnectionGeneration = settings;
  return { world, settings };
}
describe("ordinary world physical-route runtime", () => {
  it("adopts current bridge geometry, persists it, and draws it through the ordinary SVG renderer", () => {
    const f = fixture();
    const generated = generateWorldLandConnections(f.world, "km");
    if (!("routes" in generated)) throw Error(generated.reason);
    f.world.pack.routes = generated.routes;
    const current = getWorldLandConnectionCurrent(f.world, "km");
    expect(current).not.toBeNull();
    const built = buildRegisteredLandRouteScene(current!.snapshot, current!.current, current!.scene);
    if (!("scene" in built)) throw Error(built.reason);
    expect(built.scene.bridges.length).toBeGreaterThan(0);
    expect(generated.routes.every(r => r.registeredConnectionId !== undefined)).toBe(true);
    expect(buildRoutePaths(f.world, null)).toEqual([]);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.innerHTML = '<g id="roads"></g><g id="trails"></g><g id="searoutes"></g>';
    const view = { routes: select(svg), focusScope: null } as unknown as ViewContext;
    useOptionsState.getState().setOptions({ distanceUnit: "km" });
    RoutesRenderer.render(f.world, view, {} as AppServices);
    expect(svg.querySelectorAll("[data-facility-id]").length).toBe(built.scene.bridges.length);
    expect(svg.querySelector("[data-facility-id]")?.getAttribute("d")).toBe(built.scene.bridges[0].svgPath);
    const restored = getWorldLandConnectionCurrent(structuredClone(f.world), "km");
    expect(restored?.snapshot.facilityIds).toEqual(current!.snapshot.facilityIds);
    f.world.pack.cells.h[2] = 10;
    expect(getWorldLandConnectionCurrent(f.world, "km")).toBeNull();
    RoutesRenderer.render(f.world, view, {} as AppServices);
    expect(svg.querySelectorAll("[data-facility-id]")).toHaveLength(0);
  });
  it("rejects unknown engineering/walking alternatives and changed units without legacy smoothing", () => {
    const f = fixture();
    f.settings.dryBaseline.guides.maxSamples = 1;
    expect(generateWorldLandConnections(f.world, "km")).toHaveProperty("reason");
    expect(f.world.options.registeredLandConnections).toBeUndefined();
    expect(f.world.pack.routes).toEqual([]);
    const repaired = fixture(),
      generated = generateWorldLandConnections(repaired.world, "km");
    if (!("routes" in generated)) throw Error(generated.reason);
    repaired.world.pack.routes = generated.routes;
    expect(getWorldLandConnectionCurrent(repaired.world, "mi")).toBeNull();
    const copied = structuredClone(repaired.world);
    copied.options.landConnectionGeneration!.calibration.bridgeUseCostMeters += 1;
    const repriced = getWorldLandConnectionCurrent(copied, "km");
    expect(repriced).not.toBeNull();
    expect(repriced!.snapshot.network.edges.filter(e => e.crossing).every(e => e.crossing!.useCostMeters === 1.1)).toBe(
      true
    );
    copied.options.landConnectionGeneration!.calibration.bridgeUseCostMeters = -1;
    expect(getWorldLandConnectionCurrent(copied, "km")).toBeNull();
  });
});
