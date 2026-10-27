import * as THREE from "three";
import { expect, it, vi } from "vitest";
import fontaliano from "../../city-editor/data/fixtures/fontaliano-20261009.json";
import { generateCityOnDocument } from "../../city-editor/generators/generation/generateCity";
import { collectBridgeSites } from "../../city-editor/renderers/bridgeSites";
import { parseIncomingPayload } from "../../city-editor/services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../city-editor/services/io/shareRequest";
import type { CityDocument } from "../../city-editor/types/document";
import {
  FIXED_SITE_CROSSING_BUDGETS,
  type FixedBurgCrossings,
  validFixedBurgCrossings
} from "../../utils/fixedBurgCrossings";
import { createTownBridges } from "./bridgeMeshes";

function fixedCity(): CityDocument {
  const fixed: FixedBurgCrossings = {
    schemaVersion: 1,
    coordinateUnit: "metres",
    revision: 1,
    originMeters: [0, 0],
    roadWidthMeters: 6,
    requiredBounds: { minX: -330, minY: -8, maxX: 330, maxY: 8 },
    rivers: [
      {
        id: 119,
        geometryVersion: 1,
        rings: [
          [
            [-300, -500],
            [300, -500],
            [300, 500],
            [-300, 500]
          ]
        ]
      }
    ],
    crossings: [
      {
        id: 42,
        riverId: 119,
        geometryVersion: 1,
        kind: "fixedBridge",
        q: [0, 0],
        tangent: [0, 1],
        normal: [1, 0],
        waterA: [-300, 0],
        waterB: [300, 0],
        deckA: [-302, 0],
        deckB: [302, 0],
        approachA: [-320, 0],
        approachB: [320, 0],
        witness: {
          kind: "line",
          controls: [
            [0, -500],
            [0, 500]
          ],
          parameter: 0.5
        }
      }
    ]
  };
  expect(validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS)).toBe(true);
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 1000, cityRadiusMeters: 100, blockSizeMeters: 40 },
    mesh: {
      vertices: { s: { id: "s", point: [0, -500], locked: false }, n: { id: "n", point: [0, 500], locked: false } },
      edges: {},
      faces: {}
    },
    featureGroups: [
      {
        id: "river",
        kind: "river",
        name: "River",
        vertices: ["s", "n"],
        source: null,
        mouth: null,
        style: { widthMeters: 600, color: "#456d7f" },
        locked: false
      }
    ],
    gates: [],
    elements: [],
    historicalPeriod: "ageOfExploration",
    importedFixedCrossings: fixed,
    frameRoads: [
      {
        sourceIndex: 0,
        routeId: 10,
        pieces: [
          {
            kind: "bridge",
            points: [
              [-302, 0],
              [302, 0]
            ]
          }
        ]
      }
    ]
  } as CityDocument;
}

it("renders the authoritative fixed FMG deck once and connects both banks to the saved approaches", () => {
  const city = fixedCity(),
    before = JSON.stringify(city),
    sites = collectBridgeSites(city);
  expect(sites).toHaveLength(1);
  expect(sites[0].id).toBe("fixed-bridge:42");
  const layer = createTownBridges(city, { heightAt: () => 0, surfaceAt: () => 0 }, () => -1.2, "high");
  expect(layer.group.children.filter(group => group.name.startsWith("modular-"))).toHaveLength(1);
  layer.group.updateMatrixWorld(true);
  for (const [x, y] of [
    [-302, 0.95],
    [302, 0.95],
    [-314, -0.15],
    [314, -0.15]
  ]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(x, 20, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      layer.pickables,
      false
    )[0];
    expect(hit.point.y).toBeCloseTo(y, 3);
  }
  const bridge = layer.group.children.find(group => group.name.startsWith("modular-"))!;
  expect(bridge.scale.toArray()).toEqual([1, 1, 1]);
  expect(JSON.stringify(city)).toBe(before);
  const geometry = [...new Set(layer.pickables.map(mesh => mesh.geometry))].map(g => vi.spyOn(g, "dispose"));
  layer.dispose();
  for (const dispose of geometry) expect(dispose).toHaveBeenCalledOnce();
});

it("rejects bent decks and enforces period, technology and absolute skew limits", () => {
  const city = fixedCity();
  delete city.importedFixedCrossings;
  city.fabric = {
    generation: { settings: { descriptor: { roads: [{ routeId: 10, group: "roads" }], rivers: [] } } }
  } as unknown as CityDocument["fabric"];
  city.historicalPeriod = "lateMedieval";
  const points = (degrees: number): [number, number][] => [
    [-302, -302 * Math.tan((degrees * Math.PI) / 180)],
    [302, 302 * Math.tan((degrees * Math.PI) / 180)]
  ];
  city.frameRoads![0].pieces[0].points = points(20);
  expect(collectBridgeSites(city)).toHaveLength(0);
  city.maxBridgeSkewDegrees = 25;
  expect(collectBridgeSites(city)).toHaveLength(1);
  city.maxBridgeSkewDegrees = 89;
  city.frameRoads![0].pieces[0].points = points(40);
  expect(collectBridgeSites(city)).toHaveLength(0);
  city.frameRoads![0].pieces[0].points = [
    [-302, 0],
    [0, 20],
    [302, 0]
  ];
  expect(collectBridgeSites(city)).toHaveLength(0);
});

it("does not resurrect an invalid fixed crossing through its duplicate frame reference", () => {
  const city = fixedCity();
  city.importedFixedCrossings = {
    ...city.importedFixedCrossings!,
    requiredBounds: { minX: -1500, minY: -8, maxX: 1500, maxY: 8 }
  };
  expect(collectBridgeSites(city)).toHaveLength(0);
});

it("places Fontaliano's 633 m imported crossing with a clear movable span", () => {
  const share = parseIncomingPayload(JSON.stringify(fontaliano))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  expect(city).not.toBeNull();
  const site = collectBridgeSites(city).find(
    site => Math.hypot(site.points[1][0] - site.points[0][0], site.points[1][1] - site.points[0][1]) > 600
  )!;
  expect(site).toBeDefined();
  expect(site.skewDegrees).toBeLessThanOrEqual(25);
  expect(site.openingMeters).toBeGreaterThan(0);
  const layer = createTownBridges(city, { heightAt: () => 0, surfaceAt: () => 0 }, () => -1.2, "high");
  expect(layer.group.getObjectByName("bridge-lifting-deck")).toBeTruthy();
  expect(layer.group.getObjectByName("bridge-lifting-gear")).toBeTruthy();
  layer.dispose();
});
