import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { fabricHouseInfo } from "../fabric/houses";
import { syntheticVectorInput } from "../generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../generation/urban";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { reconcileVectorEdit } from "./dependencies";
import { clearFabricHouse, detachFabricHouse } from "./fabricHouses";
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
    const move = (dx: number, dy = 0) =>
      transformVectorPlacement(detached, placementId, [p.position[0] + dx, p.position[1] + dy], p.facingDegrees);
    // A move onto the lane the entrance faces is refused; the record keeps the lane and the house stays put.
    const [from, to] = p.building!.entrances[0].connector,
      reach = Math.hypot(to[0] - p.position[0], to[1] - p.position[1]);
    expect(() =>
      reconcileVectorEdit(
        detached,
        move(
          ((to[0] - from[0]) * reach) / Math.hypot(to[0] - from[0], to[1] - from[1]),
          ((to[1] - from[1]) * reach) / Math.hypot(to[0] - from[0], to[1] - from[1])
        )
      )
    ).toThrow(/dependency-protected-placement|dependency-placement/);
    // A short step away from the lane stays clear of every street and lane.
    const away = Math.hypot(to[0] - from[0], to[1] - from[1]),
      step: [number, number] = [(-(to[0] - from[0]) / away) * 0.05, (-(to[1] - from[1]) / away) * 0.05];
    const result = reconcileVectorEdit(detached, move(step[0], step[1])).document,
      kept = result.placements[placementId];
    expect(kept.position).toEqual([p.position[0] + step[0], p.position[1] + step[1]]);
    expect(kept.building!.entrances[0].fabricLine).toBeDefined();
    expect(result.fabric).toBeDefined();
    expect(result.urban!.report.assignedPopulation + result.urban!.report.unplacedPopulation).toBe(200);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
});

describe("clearing generated houses (S2.1e3b)", () => {
  it("removes a house, keeps its lot empty through regeneration and refills the shortfall from later lots", () => {
    const cell = Object.values(source.fabric!.cells).find(c => c.houses.offsets.length >= 2)!,
      draw = cell.houses.draws[0],
      dwellings = cell.houses.dwellings[0],
      doc = clearFabricHouse(source, `${cell.id}#0`),
      r = doc.urban!.report;
    expect(doc.fabric!.cells[cell.id].cleared).toEqual([draw]);
    expect(doc.fabric!.cells[cell.id].houses.draws).not.toContain(draw);
    expect(r.capacityDwellings).toBe(source.urban!.report.capacityDwellings - dwellings);
    expect(r.assignedPopulation + r.unplacedPopulation).toBe(200);
    expect(matchesVectorUrbanFingerprint(doc, doc.urban!.adoptedFingerprint)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    // Any regeneration keeps the cleared lot empty and remembers it.
    const result = reconcileVectorEdit(doc, setVectorPlacementPolicy(...detachOther(doc, cell.id))).document,
      after = result.fabric!.cells[cell.id];
    expect(after.cleared).toEqual([draw]);
    expect(after.houses.draws).not.toContain(draw);
    expect(result.urban!.report.unplacedPopulation).toBe(0);
  });
});
/** A detached house elsewhere, fixed: an edit that only triggers regeneration. */
function detachOther(doc: ReturnType<typeof clearFabricHouse>, cellId: string): [typeof doc, string, "fixed"] {
  const other = Object.values(doc.fabric!.cells).find(c => c.id !== cellId && c.houses.offsets.length)!,
    { document, placementId } = detachFabricHouse(doc, `${other.id}#0`);
  return [document, placementId, "fixed"];
}
