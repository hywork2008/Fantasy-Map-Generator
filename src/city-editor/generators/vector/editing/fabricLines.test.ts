import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { vectorRecipe } from "../../../services/io/vector/share";
import { fabricLine, isDetachedFabricLine } from "../fabric/lines";
import { syntheticVectorInput } from "../generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../generation/urban";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { VectorDocumentHistory } from "../history";
import { reconcileVectorEdit } from "./dependencies";
import { clearFabricHouse } from "./fabricHouses";
import { detachFabricLine } from "./fabricLines";
import { replaceVectorPath } from "./paths";

const source = generateVectorUrban(
  generateVectorSkeleton(syntheticVectorInput("m6", 100, false), { ...DEFAULT_VECTOR_GENERATION, branches: 4 })
    .document,
  { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population: 200, maxLanes: 4 }
);
const lane = () => {
  const cell = Object.values(source.fabric!.cells).find(c => c.attachments.length)!;
  return `${cell.id}~l${cell.attachments[0].lane}`;
};

describe("detaching fabric streets and lanes (S2.1e3c)", () => {
  it("moves a lane to a manual road joined to its street, as one undoable history entry", () => {
    const id = lane(),
      line = fabricLine(source.fabric, id)!,
      { document: doc, pathId } = detachFabricLine(source, id),
      path = doc.paths[pathId];
    expect(path).toMatchObject({ role: "road", origin: "manual", editPolicy: "editable" });
    expect(path.width.leftMeters * 2).toBeCloseTo(line.widthMeters, 9);
    expect(isDetachedFabricLine(doc.fabric, id)).toBe(true);
    const owner = doc.fabric!.cells[id.split("~")[0]].detachedLines![0];
    expect(owner.joins.length).toBeGreaterThan(0);
    expect(doc.urban!.report.capacityDwellings).toBe(source.urban!.report.capacityDwellings);
    expect(matchesVectorUrbanFingerprint(doc, doc.urban!.adoptedFingerprint)).toBe(true);
    expect(parseVectorDocument(serializeVectorDocument(doc))).toEqual(doc);
    const history = new VectorDocumentHistory(source);
    history.commit(doc);
    expect(history.undo()).toEqual(source);
    expect(() => detachFabricLine(doc, id)).toThrow("dependency-path-required");
    // Detaching the street the lane ended on drops that join; both roads stay valid.
    const { document: both } = detachFabricLine(doc, owner.joins[0].line);
    expect(both.fabric!.cells[id.split("~")[0]].detachedLines![0].joins.map(j => j.line)).not.toContain(
      owner.joins[0].line
    );
  });
  it("keeps the detached road through regeneration without cutting its district", () => {
    const id = lane(),
      { document: doc, pathId } = detachFabricLine(source, id),
      road = Object.keys(doc.generation!.pathRevisions).find(k => doc.paths[k].role === "road")!,
      path = structuredClone(doc.paths[road]);
    path.width.leftMeters += 0.5;
    const result = reconcileVectorEdit(doc, replaceVectorPath(structuredClone(doc), path)).document;
    expect(result.paths[pathId]).toEqual(doc.paths[pathId]);
    const kept = Object.values(result.fabric!.cells).flatMap(c => c.detachedLines ?? []);
    expect(kept.map(l => l.pathId)).toContain(pathId);
    expect(result.urban!.report.unplacedPopulation).toBe(0);
    expect(parseVectorDocument(serializeVectorDocument(result))).toEqual(result);
  });
  it("refuses a recipe link for edited records and keeps the user's marks when regenerating (S2.1e4)", () => {
    expect(() => vectorRecipe(source)).not.toThrow();
    const cell = Object.values(source.fabric!.cells).find(c => c.houses.offsets.length >= 2)!,
      draw = cell.houses.draws[0],
      cleared = clearFabricHouse(source, `${cell.id}#0`),
      id = lane(),
      { document: doc, pathId } = detachFabricLine(cleared, id);
    expect(() => vectorRecipe(doc)).toThrow("vector-recipe-edited");
    const again = generateVectorUrban(doc, doc.urban!.settings);
    expect(again.paths[pathId]).toEqual(doc.paths[pathId]);
    expect(again.fabric!.cells[cell.id].cleared).toEqual([draw]);
    expect(again.fabric!.cells[cell.id].houses.draws).not.toContain(draw);
    expect(again.fabric!.cells[id.split("~")[0]].detachedLines!.map(l => l.pathId)).toEqual([pathId]);
  });
});
