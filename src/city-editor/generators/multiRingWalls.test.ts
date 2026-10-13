import { describe, expect, it } from "vitest";
import { parseDocument } from "../services/io/documentCodec";
import type { CityDocument, Id } from "../types/document";
import { registerTownCircuit, updateCircuitWalls } from "./castles";
import { createGridDocument } from "./document";
import {
  boundaryEdges,
  boundaryRings,
  gateTownCircuit,
  innerTownCircuit,
  outerTownCircuit,
  townCircuitForFace,
  townCircuits,
  townGates,
  validateFortifications
} from "./fortifications";
import { polygonCentroid } from "./geom";
import { facePoints, validate } from "./mesh";

/** Hex Small mesh with an old-town ring (r < 150 m) inside a new-town ring (r < 350 m). */
function doubleWalled(): { doc: CityDocument; inner: Id[]; outer: Id[] } {
  const doc = createGridDocument({ size: "small", grid: "hex", seed: "multi-ring" });
  const within = (r: number) =>
    Object.values(doc.mesh.faces)
      .filter(face => Math.hypot(...polygonCentroid(facePoints(doc.mesh, face))) < r)
      .map(face => face.id);
  const inner = within(150);
  const outer = within(350);
  registerTownCircuit(doc, [], true, outer, 1);
  registerTownCircuit(doc, [], true, inner, 0);
  for (const id of outer) {
    doc.mesh.faces[id].properties.settlement = "core";
    doc.mesh.faces[id].properties.wallRing = inner.includes(id) ? 0 : 1;
  }
  return { doc, inner, outer };
}

describe("multi-ring town walls (P0 data model)", () => {
  it("orders town circuits innermost first and resolves inner/outer", () => {
    const { doc, inner } = doubleWalled();
    expect(townCircuits(doc).map(c => c.ring)).toEqual([0, 1]);
    expect(innerTownCircuit(doc)?.id).toBe("gc:defense-town-0");
    expect(outerTownCircuit(doc)?.id).toBe("gc:defense-town-1");
    expect(townCircuitForFace(doc, inner[0])?.ring).toBe(0);
    expect(validate(doc)).toEqual([]);
  });

  it("keeps the single-wall document unchanged: one circuit is both inner and outer", () => {
    const doc = createGridDocument({ size: "small", grid: "hex", seed: "single" });
    const faces = Object.keys(doc.mesh.faces).slice(0, 20);
    registerTownCircuit(doc, [], true, faces);
    const town = doc.defenseCircuits![0];
    expect(town.id).toBe("gc:defense-town");
    expect(town.ring).toBeUndefined();
    expect(innerTownCircuit(doc)).toBe(town);
    expect(outerTownCircuit(doc)).toBe(town);
  });

  it("assigns legacy gates to the outer wall and filters gates by circuit", () => {
    const { doc } = doubleWalled();
    const vertex = Object.keys(doc.mesh.vertices)[0];
    doc.gates = [
      { id: "g-outer", vertexId: vertex, locked: false },
      { id: "g-inner", vertexId: vertex, locked: false, circuitId: "gc:defense-town-0" }
    ];
    expect(gateTownCircuit(doc, doc.gates[0])?.ring).toBe(1);
    expect(townGates(doc, "gc:defense-town-1").map(g => g.id)).toEqual(["g-outer"]);
    expect(townGates(doc, "gc:defense-town-0").map(g => g.id)).toEqual(["g-inner"]);
    expect(townGates(doc)).toHaveLength(2);
  });

  it("rejects an inner ring that is not nested, duplicate rings, unknown gate circuits and face rings", () => {
    const { doc, outer } = doubleWalled();
    const outside = Object.keys(doc.mesh.faces).find(id => !outer.includes(id))!;
    innerTownCircuit(doc)!.areaFaceIds.push(outside);
    expect(validateFortifications(doc).some(e => e.includes("is not inside"))).toBe(true);

    const dup = doubleWalled().doc;
    dup.defenseCircuits![0].ring = 1;
    dup.defenseCircuits![1].ring = 1;
    expect(validateFortifications(dup)).toContain("Duplicate town circuit ring");

    const gate = doubleWalled().doc;
    gate.gates = [{ id: "g", vertexId: Object.keys(gate.mesh.vertices)[0], locked: false, circuitId: "nope" }];
    expect(validateFortifications(gate)).toContain("Invalid gate circuit g");

    const face = doubleWalled().doc;
    Object.values(face.mesh.faces)[0].properties.wallRing = 7;
    expect(validateFortifications(face).some(e => e.startsWith("Invalid face wall ring"))).toBe(true);
  });

  it("round-trips ring, state, gate circuit and face ring through save/load", () => {
    const { doc, inner } = doubleWalled();
    const old = innerTownCircuit(doc)!;
    const segments = boundaryRings(doc.mesh, boundaryEdges(doc.mesh, old.areaFaceIds))[0];
    doc.featureGroups.push({
      id: "w-inner",
      kind: "wall",
      name: "Old town wall",
      segments,
      style: { widthMeters: 3, color: "#555" },
      locked: false
    });
    updateCircuitWalls(doc, old);
    old.state = "razed";
    const vertexId = doc.mesh.edges[segments[0].edgeId].a;
    doc.gates = [{ id: "g-inner", vertexId, locked: false, circuitId: old.id }];
    expect(validate(doc)).toEqual([]);
    const loaded = parseDocument(JSON.stringify(doc));
    expect(loaded).not.toBeNull();
    expect(townCircuits(loaded!).map(c => [c.ring, c.state])).toEqual([
      [0, "razed"],
      [1, undefined]
    ]);
    expect(loaded!.gates[0].circuitId).toBe("gc:defense-town-0");
    expect(loaded!.mesh.faces[inner[0]].properties.wallRing).toBe(0);
  });
});
