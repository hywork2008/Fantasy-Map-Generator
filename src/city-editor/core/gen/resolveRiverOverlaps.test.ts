import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { faceVertices } from "../mesh";
import type { CityDocument, Id } from "../types";
import { resolveRiverBoundaryOverlaps } from "./resolveRiverOverlaps";

function getBoundaryRiverOverlaps(doc: CityDocument): { eid: Id; a: Id; b: Id }[] {
  const coreFaces = Object.values(doc.mesh.faces).filter(f => f.properties.settlement === "core");
  if (coreFaces.length === 0) return [];

  const edgeUsage = new Map<Id, number>();
  for (const f of coreFaces) {
    for (const b of f.boundary) {
      edgeUsage.set(b.edgeId, (edgeUsage.get(b.edgeId) ?? 0) + 1);
    }
  }
  const boundaryEdgeIds = new Set([...edgeUsage.entries()].filter(([_, count]) => count === 1).map(([eid]) => eid));

  const riverFgs = Object.values(doc.featureGroups ?? {}).filter(fg => fg.kind === "river");
  const overlaps: { eid: Id; a: Id; b: Id }[] = [];
  for (const fg of riverFgs) {
    const verts = fg.vertices;
    for (let i = 0; i < verts.length - 1; i++) {
      const vA = verts[i];
      const vB = verts[i + 1];
      const edge = Object.values(doc.mesh.edges).find(e => (e.a === vA && e.b === vB) || (e.a === vB && e.b === vA));
      if (edge && boundaryEdgeIds.has(edge.id)) {
        overlaps.push({ eid: edge.id, a: vA, b: vB });
      }
    }
  }
  return overlaps;
}

describe("resolveRiverBoundaryOverlaps", () => {
  it("resolves river boundary overlaps on temp/ce-20260922-032600.json by splitting f60 and f68", () => {
    const tempPath = path.resolve(process.cwd(), "temp/ce-20260922-032600.json");
    if (!fs.existsSync(tempPath)) return;

    const doc: CityDocument = JSON.parse(fs.readFileSync(tempPath, "utf8"));
    const initialOverlaps = getBoundaryRiverOverlaps(doc);
    expect(initialOverlaps.length).toBeGreaterThan(0);

    const resolved = resolveRiverBoundaryOverlaps(doc);
    const finalOverlaps = getBoundaryRiverOverlaps(resolved);
    expect(finalOverlaps).toHaveLength(0);

    // Verify f60 was split by v98 and v100
    const edge98_100 = Object.values(resolved.mesh.edges).find(
      e => (e.a === "v98" && e.b === "v100") || (e.a === "v100" && e.b === "v98")
    );
    expect(edge98_100).toBeDefined();

    // Verify f68 was split by v114 and v116
    const edge114_116 = Object.values(resolved.mesh.edges).find(
      e => (e.a === "v114" && e.b === "v116") || (e.a === "v116" && e.b === "v114")
    );
    expect(edge114_116).toBeDefined();
  });

  it("leaves documents without river overlaps untouched", () => {
    const tempPath = path.resolve(process.cwd(), "temp/ce-20260922-032600.json");
    if (!fs.existsSync(tempPath)) return;

    const doc: CityDocument = JSON.parse(fs.readFileSync(tempPath, "utf8"));
    const resolvedOnce = resolveRiverBoundaryOverlaps(doc);
    const resolvedTwice = resolveRiverBoundaryOverlaps(resolvedOnce);

    expect(Object.keys(resolvedTwice.mesh.faces).length).toBe(Object.keys(resolvedOnce.mesh.faces).length);
    expect(Object.keys(resolvedTwice.mesh.edges).length).toBe(Object.keys(resolvedOnce.mesh.edges).length);
  });
});
