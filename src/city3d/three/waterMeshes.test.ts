import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityDocument, Mesh, Point, WaterKind } from "../../city-editor/types/document";
import { LAND_Y } from "../core/waterGeometry";
import { createTownWater, planCity3dRefresh, waterStampChanged } from "./waterMeshes";

function document(partial: Partial<CityDocument> & Pick<CityDocument, "mesh">): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 40 },
    featureGroups: [],
    gates: [],
    elements: [],
    ...partial
  } as CityDocument;
}

function emptyMesh(): Mesh {
  return { vertices: {}, edges: {}, faces: {} };
}

function addRect(mesh: Mesh, id: string, x0: number, y0: number, x1: number, y1: number, water: WaterKind): void {
  const ids = [0, 1, 2, 3].map(index => `${id}v${index}`);
  const points: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
  ids.forEach((vertexId, index) => {
    mesh.vertices[vertexId] = { id: vertexId, point: points[index], locked: false };
  });
  const edgeIds = [0, 1, 2, 3].map(index => `${id}e${index}`);
  (
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0]
    ] as [number, number][]
  ).forEach(([a, b], index) => {
    mesh.edges[edgeIds[index]] = {
      id: edgeIds[index],
      a: ids[a],
      b: ids[b],
      leftFace: id,
      rightFace: null,
      locked: false
    };
  });
  mesh.faces[id] = {
    id,
    boundary: edgeIds.map(edgeId => ({ edgeId, forward: true })),
    properties: { elevation: water === "land" ? 1 : 0, water, ward: null, buildable: water === "land", locked: false }
  };
}

function colorOf(mesh: THREE.Mesh): number {
  return (mesh.material as THREE.MeshLambertMaterial).color.getHex();
}

function sideOf(mesh: THREE.Mesh): THREE.Side {
  return (mesh.material as THREE.MeshLambertMaterial).side;
}

describe("planCity3dRefresh", () => {
  it("builds nothing while the view is closed", () => {
    expect(planCity3dRefresh({ fabricChanged: true, stampChanged: true, open: false })).toEqual({
      buildings: false,
      water: false
    });
  });

  it("rebuilds water only when the caller reports a stamp change", () => {
    expect(planCity3dRefresh({ fabricChanged: false, stampChanged: true, open: true })).toEqual({
      buildings: false,
      water: true
    });
  });

  it("rebuilds water when the parent is absent even if the stamp string matches", () => {
    const stamp = "same";
    expect(waterStampChanged(stamp, stamp, false)).toBe(true);
    expect(
      planCity3dRefresh({
        fabricChanged: false,
        stampChanged: waterStampChanged(stamp, stamp, false),
        open: true
      })
    ).toEqual({ buildings: false, water: true });
  });

  it("does not rebuild when the stamp matches and the parent is present", () => {
    const stamp = "same";
    expect(waterStampChanged(stamp, stamp, true)).toBe(false);
    expect(planCity3dRefresh({ fabricChanged: false, stampChanged: false, open: true })).toEqual({
      buildings: false,
      water: false
    });
  });

  it("does not treat missing water children or a cleared building cache as a water rebuild", () => {
    expect(waterStampChanged("same", "same", true)).toBe(false);
    expect(planCity3dRefresh({ fabricChanged: true, stampChanged: false, open: true })).toEqual({
      buildings: true,
      water: false
    });
  });
});

describe("town water meshes", () => {
  it("keeps an empty water parent for an inland town and does not pick any mesh", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 20, 20, "land");
    const drawn = createTownWater(document({ mesh }));
    expect(drawn.pickables).toEqual([]);
    expect(drawn.replacesDisc).toBe(true);
    expect(drawn.parent.name).toBe("ce-water");
    expect(drawn.parent.children).toEqual([]);
    expect(drawn.land?.name).toBe("ce-land");
    expect(drawn.bank).toBeNull();
    const landY = drawn.land!.geometry.getAttribute("position").getY(0);
    expect(landY).toBeCloseTo(LAND_Y, 5);
    const hits: THREE.Intersection[] = [];
    drawn.land!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    drawn.dispose();
  });

  it("paints ocean water from above and a double-sided bank, with nothing pickable", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 10, 10, "land");
    addRect(mesh, "sea", 20, 0, 30, 10, "sea");
    const drawn = createTownWater(document({ mesh }));
    const ocean = drawn.parent.getObjectByName("ce-water-ocean") as THREE.Mesh;
    expect(ocean).toBeTruthy();
    expect(drawn.parent.getObjectByName("ce-water-lake")).toBeUndefined();
    expect(colorOf(ocean)).toBe(0x456d7f);
    expect(sideOf(ocean)).toBe(THREE.FrontSide);
    expect(drawn.bank?.name).toBe("ce-bank");
    expect(sideOf(drawn.bank!)).toBe(THREE.DoubleSide);
    expect(drawn.pickables).toEqual([]);
    const hits: THREE.Intersection[] = [];
    ocean.raycast(new THREE.Raycaster(), hits);
    drawn.bank!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    drawn.dispose();
  });
});
