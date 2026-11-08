import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { fabricHouseInfo } from "../fabric/houses";
import { syntheticVectorInput } from "../generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../generation/urban";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { reconcileVectorEdit } from "./dependencies";
import { detachFabricHouse } from "./fabricHouses";
import { setVectorPlacementPolicy, transformVectorPlacement } from "./placements";

const source = generateVectorUrban(
  generateVectorSkeleton(syntheticVectorInput("m6", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
    .document,
  { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 200, maxLanes: 4 }
);
/** A house whose entrance faces a fabric lane, not a main road. */
const laneHouse = () => {
  for (const cell of Object.values(source.fabric!.cells))
    for (let i = 0; i < cell.houses.offsets.length; i++) {
      const id = `${cell.id}#${i}`,
        { document } = detachFabricHouse(source, id);
      if (Object.values(document.placements).some(p => p.building?.entrances[0].fabricLine)) return id;
    }
  throw new Error("no lane house");
};

describe("detaching generated houses from fabric records (S2.1e2)", () => {
  it("replaces one house by an equal manual placement and keeps capacity, residents and ownership", () => {
    const before = JSON.stringify(source),
      houseId = laneHouse(),
      info = fabricHouseInfo(source.fabric, houseId)!,
      { document: doc, placementId } = detachFabricHouse(source, houseId),
      p = doc.placements[placementId],
      u = doc.urban!,
      r = u.report,
      was = source.urban!.report;
    expect(JSON.stringify(source)).toBe(before);
    expect(fabricHouseInfo(doc.fabric, houseId)).toBeUndefined();
    expect(p).toMatchObject({ origin: "manual", editPolicy: "editable", accesses: [] });
    expect(p.site.outer).toEqual(info.ring);
    expect(p.building!.dwellings).toBe(info.dwellings);
    expect(p.building!.entrances[0].fabricLine).toMatch(/~[sl]\d+$/);
    expect([r.capacityDwellings, r.assignedPopulation, r.unplacedPopulation, r.capacityInside]).toEqual([
      was.capacityDwellings,
      was.assignedPopulation,
      was.unplacedPopulation,
      was.capacityInside
    ]);
    expect(r.housingBuildings).toBe(was.housingBuildings - 1);
    expect(u.checkpoints.find(c => c.id === "housing")!.placementIds).toContain(placementId);
    expect(u.inputRevision).toBe(doc.revision);
    expect(matchesVectorUrbanFingerprint(doc, u.adoptedFingerprint)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    expect(() => detachFabricHouse(doc, houseId)).toThrow("dependency-placement-required");
  });
  it("moves and fixes a detached house through the dependency transaction and keeps its lane entrance", () => {
    const { document: detached, placementId } = detachFabricHouse(source, laneHouse()),
      p = detached.placements[placementId];
    const fixed = reconcileVectorEdit(detached, setVectorPlacementPolicy(detached, placementId, "fixed")).document;
    expect(fixed.placements[placementId]).toEqual({ ...p, editPolicy: "fixed" });
    expect(fixed.fabric).toBeDefined();
    const move = (dx: number) =>
      transformVectorPlacement(detached, placementId, [p.position[0] + dx, p.position[1]], p.facingDegrees);
    // A move onto a fabric lane is refused; the record keeps the lane and the house stays where it was.
    expect(() => reconcileVectorEdit(detached, move(0.3))).toThrow(/dependency-protected-placement/);
    const result = reconcileVectorEdit(detached, move(-0.3)).document,
      kept = result.placements[placementId];
    expect(kept.position).toEqual([p.position[0] - 0.3, p.position[1]]);
    expect(kept.building!.entrances[0].fabricLine).toBeDefined();
    expect(result.fabric).toBeDefined();
    expect(result.urban!.report.assignedPopulation + result.urban!.report.unplacedPopulation).toBe(200);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
});
