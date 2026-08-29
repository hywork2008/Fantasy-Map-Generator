import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { faceVertices, mergeFaces, splitFace } from "./mesh";

describe("manual city mesh", () => {
  it("splits a cell and merges the two parts back", () => {
    const document = createDocument("mesh-split", 900, 110);
    const face = Object.values(document.mesh.faces).find(candidate => candidate.boundary.length >= 4);
    expect(face).toBeDefined();
    if (!face) return;
    const vertices = faceVertices(document.mesh, face);
    const split = splitFace(document, face.id, vertices[0], vertices[2]);
    expect(split).not.toBeNull();
    if (!split) return;
    expect(Object.keys(split.mesh.faces)).toHaveLength(Object.keys(document.mesh.faces).length + 1);

    const createdId = Object.keys(split.mesh.faces).find(id => !document.mesh.faces[id]);
    expect(createdId).toBeDefined();
    if (!createdId) return;
    const merged = mergeFaces(split, face.id, createdId);
    expect(merged).not.toBeNull();
    expect(Object.keys(merged?.mesh.faces ?? {})).toHaveLength(Object.keys(document.mesh.faces).length);
  });
});
