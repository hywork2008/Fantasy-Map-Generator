import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorFabricCell, VectorFabricDistrict } from "../../../types/vector/fabric";
import { createVectorExample } from "../document";
import { fabricCellHash, fabricDistrictHash } from "../fabric/hash";
import { packLines, packPoints } from "../fabric/pack";
import { vectorOccupiedSites } from "../occupancy";
import { validateVectorDocument } from "./document";

const square = (x: number, y: number, size: number): Point[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size]
];
/** A district west of the example road with one street block, one lane, one house and a street joined at node "center". */
function withFabric(edit?: (district: VectorFabricDistrict, cell: VectorFabricCell) => void): VectorCityDocument {
  const doc = createVectorExample(),
    origin: Point = [-60, -40];
  const district: Omit<VectorFabricDistrict, "hash"> = {
    id: "district:test",
    seed: "s",
    parameters: { lotArea: 80, laneWidthMeters: 2.4, coverage: 0.9, streetCellMeters: 50, streetWidthMeters: 5 },
    origin,
    outline: packPoints(square(-60, -40, 40), origin),
    boundaries: square(0, 0, 1).map(() => ({ feature: true, barrier: false, setback: 0.35 })),
    streets: packLines(
      [
        {
          points: [
            [-20, -20],
            [0, 0]
          ],
          widthMeters: 5
        }
      ],
      origin
    ),
    mouths: [{ street: 0, end: 1, nodeId: "center" }],
    cellIds: ["district:test:cell:a"]
  };
  const cell: Omit<VectorFabricCell, "hash"> = {
    id: "district:test:cell:a",
    districtId: "district:test",
    origin,
    ring: packPoints(square(-60, -40, 40), origin),
    lanes: packLines(
      [
        {
          points: [
            [-50, -30],
            [-20, -20]
          ],
          widthMeters: 2.4
        }
      ],
      origin
    ),
    attachments: [{ lane: 0, end: 1, street: 0, t: 0 }],
    houses: {
      offsets: [0],
      coords: packPoints(square(-55, -35, 8), origin),
      storeys: [2],
      dwellings: [1],
      entrances: [500, 900, 500, 1000],
      draws: [0.4]
    },
    detached: []
  };
  const d = structuredClone(district) as VectorFabricDistrict,
    c = structuredClone(cell) as VectorFabricCell;
  edit?.(d, c);
  d.hash = fabricDistrictHash(d);
  c.hash = fabricCellHash(c);
  doc.fabric = { algorithm: "vector-urban-v4", districts: { [d.id]: d }, cells: { [c.id]: c } };
  return doc;
}

describe("native v8 fabric records", () => {
  it("accepts packed districts, street blocks and houses, and round-trips them", () => {
    const doc = withFabric();
    expect(validateVectorDocument(doc)).toEqual([]);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    // Generated houses count as occupied land for every obstacle check.
    expect(vectorOccupiedSites(doc, "reserved").at(-1)!.outer[0]).toEqual([-55, -35]);
  });
  it("rejects a record changed without its content hash", () => {
    const doc = withFabric();
    doc.fabric!.cells["district:test:cell:a"].houses.coords[0] += 1;
    expect(validateVectorDocument(doc)).toEqual(["fabric-cell:district:test:cell:a:hash"]);
  });
  it("rejects a house outside its street block", () => {
    const doc = withFabric((_, cell) => {
      cell.houses.coords = packPoints(square(-30, -35, 20), cell.origin);
    });
    expect(validateVectorDocument(doc)).toEqual(["fabric-cell:district:test:cell:a:house:0"]);
  });
  it("rejects broken references between records and to the road graph", () => {
    expect(
      validateVectorDocument(
        withFabric((_, cell) => {
          cell.districtId = "district:missing";
        })
      )
    ).toContain("fabric-cell:district:test:cell:a:district");
    expect(
      validateVectorDocument(
        withFabric(district => {
          district.mouths = [{ street: 0, end: 0, nodeId: "center" }];
        })
      )
    ).toEqual(["fabric-district:district:test:mouth"]);
  });
  it("loads a v7 ledger as v8 and refuses fabric in a v7 file", () => {
    const v7 = { ...createVectorExample(), version: 7 };
    expect(parseVectorDocument(JSON.stringify(v7))?.version).toBe(8);
    expect(parseVectorDocument(JSON.stringify({ ...withFabric(), version: 7 }))).toBeNull();
  });
});
