import { describe, expect, it } from "vitest";
import savedCity from "../../../../../docs/analytics/ce-meshless-m5-synthetic-20261107.json";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { syntheticVectorInput } from "../generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../generation/urban";
import { bridgeGeometry } from "../geometry/network";
import { vectorWaterSurfaces } from "../geometry/water";
import { VectorDocumentHistory } from "../history";
import { prepareVectorEdit, reconcileVectorEdit } from "./dependencies";
import { replaceVectorPathCandidate } from "./pathCandidate";
import { replaceVectorPath } from "./paths";
import { setVectorPlacementPolicy, transformVectorPlacement } from "./placements";

/** These transactions are checked on a city of placed houses and lane paths: a housing search budget keeps facility
 * mode on that route instead of the CE street blocks (which an edit of such a city keeps using). */
const PLACEMENT_HOUSING = { housingAttempts: 40000 };
const city = () =>
  generateVectorUrban(
    generateVectorSkeleton(syntheticVectorInput("m6", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
      .document,
    { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 200, maxLanes: 4 },
    undefined,
    PLACEMENT_HOUSING
  );
describe("meshless dependency transactions", () => {
  it("relocates only affected automatic placements and commits shape, population and checkpoints together", () => {
    const source = city(),
      widened = (id: string) => {
        const path = structuredClone(source.paths[id]);
        path.width.leftMeters += 3;
        path.width.rightMeters += 3;
        return { path, result: reconcileVectorEdit(source, replaceVectorPath(prepareVectorEdit(source), path)) };
      };
    // The first generated road whose widening reaches a placement (facilities may front a lane instead).
    const { path, result } = Object.keys(source.generation!.pathRevisions)
      .filter(id => source.paths[id].role === "road")
      .map(widened)
      .find(c => c.result.impact.relocatedPlacements.length > 0)!;
    expect(result.impact.changedPaths).toContain(path.id);
    expect(result.impact.relocatedPlacements.length).toBeGreaterThan(0);
    expect(result.impact.retainedPlacements.length).toBeGreaterThan(0);
    for (const id of result.impact.retainedPlacements)
      expect(result.document.placements[id]).toEqual(source.placements[id]);
    expect(source.paths[path.id].width).not.toEqual(path.width);
    const report = result.document.urban!.report;
    expect(report.assignedPopulation + report.unplacedPopulation).toBe(200);
    expect(result.document.urban!.inputRevision).toBe(result.document.revision);
    expect(parseVectorDocument(serializeVectorDocument(result.document))).toEqual(result.document);
    const history = new VectorDocumentHistory(source);
    history.commit(result.document);
    expect(history.index).toBe(1);
    expect(history.undo()).toEqual(source);
    expect(history.redo()).toEqual(result.document);
    const nextPath = structuredClone(result.document.paths[path.id]);
    nextPath.width.leftMeters += 0.5;
    expect(() =>
      reconcileVectorEdit(result.document, replaceVectorPath(prepareVectorEdit(result.document), nextPath))
    ).not.toThrow();
  });
  it("keeps a fixed facility and rejects collision without modifying the source", () => {
    const source = city(),
      id = source.urban!.ownedPlacements[0];
    source.placements[id].editPolicy = "fixed";
    // A lock is an explicit transaction before dependency edits.
    source.revision++;
    source.urban!.inputRevision = source.revision;
    source.generation!.inputRevision = source.revision;
    const { urban, ...rest } = source;
    void urban;
    source.urban!.adoptedFingerprint = JSON.stringify({
      paths: rest.paths,
      connections: rest.connections,
      placements: rest.placements,
      regions: rest.regions,
      context: rest.context,
      site: rest.site,
      recipe: rest.recipe
    });
    const prepared = prepareVectorEdit(source);
    expect(prepared.placements[id]).toEqual(source.placements[id]);
    const road = structuredClone(source.paths[source.placements[id].accesses[0].pathId]);
    road.width.leftMeters += 20;
    road.width.rightMeters += 20;
    expect(() => replaceVectorPath(prepared, road)).toThrow();
    expect(source.placements[id].editPolicy).toBe("fixed");
  });
});

describe("physical dependency updates", () => {
  it("updates river width and automatic bridge landings without moving fixed input roads", () => {
    const input = syntheticVectorInput("water-edit", 100, true);
    input.paths["input-river"].origin = "manual";
    input.paths["input-river"].editPolicy = "editable";
    input.site!.fixedPaths = input.site!.fixedPaths.filter(p => p.id !== "input-river");
    const source = generateVectorUrban(
      generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, branches: 4 }).document,
      { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 200, maxLanes: 2 },
      undefined,
      PLACEMENT_HOUSING
    );
    const p = structuredClone(source.paths["input-river"]);
    p.width.leftMeters += 2;
    p.width.rightMeters += 2;
    const candidate = replaceVectorPathCandidate(prepareVectorEdit(source), p),
      result = reconcileVectorEdit(source, candidate);
    expect(result.document.paths["input-river"].width.leftMeters).toBe(p.width.leftMeters);
    expect(Object.keys(result.document.connections.bridges)).toEqual(Object.keys(source.connections.bridges));
    for (const path of source.site!.fixedPaths) expect(result.document.paths[path.id]).toEqual(path);
    for (const b of Object.values(result.document.connections.bridges))
      expect(bridgeGeometry(result.document, b, vectorWaterSurfaces(result.document)).skewDegrees).toBeLessThanOrEqual(
        15
      );
  });
  it("updates wall thickness and gate openings while preserving unconnected land", () => {
    const source = generateVectorUrban(
      generateVectorSkeleton(syntheticVectorInput("wall-edit", 100, false), {
        ...DEFAULT_VECTOR_GENERATION,
        branches: 2,
        wall: "rectangle"
      }).document,
      { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 90, maxLanes: 0 }
    );
    const p = structuredClone(source.paths["auto-wall"]);
    p.width.leftMeters = 2;
    p.width.rightMeters = 2;
    const result = reconcileVectorEdit(source, replaceVectorPath(prepareVectorEdit(source), p));
    expect(result.document.paths[p.id].width).toEqual(p.width);
    expect(result.impact.retainedPlacements.length).toBeGreaterThan(0);
    const edited = prepareVectorEdit(result.document),
      gate = Object.values(edited.connections.gates)[0];
    gate.widthMeters += 1;
    edited.revision++;
    const second = reconcileVectorEdit(result.document, edited);
    expect(second.impact.changedConnections).toBe(true);
    expect(second.document.connections.gates[gate.id].widthMeters).toBe(gate.widthMeters);
  });
  it("keeps a manually acquired placement, toggles its lock and prevents later automatic removal", () => {
    const source = city(),
      id = source.urban!.ownedPlacements.find(id => source.placements[id].building?.kind === "housing")!,
      p = source.placements[id];
    const e = p.building!.entrances[0],
      position: [number, number] = [p.position[0] - e.outward[0] * 0.2, p.position[1] - e.outward[1] * 0.2];
    const manual = transformVectorPlacement(source, id, position, p.facingDegrees);
    const result = reconcileVectorEdit(source, manual).document;
    expect(result.placements[id].origin).toBe("manual");
    expect(result.placements[id].position).toEqual(position);
    expect(result.placements[id].building!.dwellings).toBe(1);
    const locked = reconcileVectorEdit(result, setVectorPlacementPolicy(result, id, "fixed")).document;
    expect(locked.placements[id].editPolicy).toBe("fixed");
    expect(() => transformVectorPlacement(locked, id, p.position, p.facingDegrees)).toThrow(
      "dependency-protected-placement"
    );
    const unlocked = reconcileVectorEdit(locked, setVectorPlacementPolicy(locked, id, "editable")).document;
    expect(unlocked.placements[id].editPolicy).toBe("editable");
    expect(unlocked.placements[id].origin).toBe("manual");
  });
});

describe("saved urban dependency regression", () => {
  it("replays the 500-person saved city and preserves all 122 unaffected placements", () => {
    const source = parseVectorDocument(JSON.stringify(savedCity))!,
      path = structuredClone(source.paths["urban-lane:0"]);
    path.width.leftMeters = 2.5;
    const result = reconcileVectorEdit(source, replaceVectorPath(prepareVectorEdit(source), path));
    expect(result.impact.retainedPlacements).toHaveLength(122);
    expect(result.impact.relocatedPlacements).toHaveLength(5);
    for (const id of result.impact.retainedPlacements)
      expect(result.document.placements[id]).toEqual(source.placements[id]);
    expect(result.document.paths[path.id].origin).toBe("manual");
    expect(() => generateVectorUrban(result.document)).toThrow("edited-urban");
    expect(parseVectorDocument(serializeVectorDocument(result.document))).toEqual(result.document);
  });
});

describe("fabric records through a dependency transaction (S2.1e1)", () => {
  it("rebuilds with the same street-block layout and keeps the houses of unaffected street blocks", () => {
    const source = generateVectorUrban(
        generateVectorSkeleton(syntheticVectorInput("m6", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
          .document,
        { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 200, maxLanes: 4 }
      ),
      road = Object.keys(source.generation!.pathRevisions).find(id => source.paths[id].role === "road")!,
      path = structuredClone(source.paths[road]);
    path.width.leftMeters += 2;
    path.width.rightMeters += 2;
    const result = reconcileVectorEdit(source, replaceVectorPath(prepareVectorEdit(source), path)).document;
    expect(result.fabric).toBeDefined();
    expect(result.urban!.ownedPaths).toEqual([]);
    expect(Object.keys(result.paths).some(id => id.startsWith("urban-lane:"))).toBe(false);
    // Houses by occupancy draw: ring, dwellings and entrance of each adopted lot.
    const houses = (doc: typeof source, id: string) => {
      const c = doc.fabric!.cells[id],
        at = (i: number) => {
          const end = i + 1 < c.houses.offsets.length ? c.houses.offsets[i + 1] : c.houses.coords.length / 2;
          return JSON.stringify([
            c.houses.coords.slice(2 * c.houses.offsets[i], 2 * end),
            c.houses.dwellings[i],
            c.houses.entrances.slice(4 * i, 4 * i + 4)
          ]);
        };
      return new Map(c.houses.draws.map((d, i) => [d, at(i)]));
    };
    const oldMax = Math.max(...Object.values(source.fabric!.cells).flatMap(c => c.houses.draws)),
      shared = Object.keys(source.fabric!.cells).filter(id => result.fabric!.cells[id]);
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.length).toBeLessThan(Object.keys(source.fabric!.cells).length);
    // A street block whose outline survived keeps every house; it may only gain lots drawn after the old ones.
    for (const id of shared) {
      const before = houses(source, id),
        after = houses(result, id);
      for (const [draw, house] of before) expect(after.get(draw)).toBe(house);
      for (const draw of after.keys()) if (!before.has(draw)) expect(draw).toBeGreaterThan(oldMax);
    }
    const report = result.urban!.report;
    expect(report.assignedPopulation + report.unplacedPopulation).toBe(200);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
});
