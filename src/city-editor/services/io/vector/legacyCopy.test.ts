import { describe, expect, it } from "vitest";
import { createGridDocument } from "../../../generators/document";
import { facePoints } from "../../../generators/mesh";
import { serializeDocument } from "../documentCodec";
import { parseVectorDocument, serializeVectorDocument } from "./documentCodec";
import { copyLegacyCity, restoreLegacyCopy } from "./legacyCopy";

describe("lossless-source meshless copies", () => {
  it("retains the original, copies physical polygons and reports unsupported source features before adoption", () => {
    const source = createGridDocument({ seed: "copy", grid: "hex", size: "micro" }),
      face = Object.values(source.mesh.faces)[0];
    face.properties.ward = "park";
    source.elements.push({ id: "tree-copy", kind: "tree", faceIds: [], point: [0, 0], sizeMeters: 3, locked: true });
    const before = serializeDocument(source),
      copy = copyLegacyCity(source);
    expect(serializeDocument(source)).toBe(before);
    expect(
      Object.values(copy.document.regions).some(
        r => JSON.stringify(r.outer) === JSON.stringify(facePoints(source.mesh, face))
      )
    ).toBe(true);
    expect(copy.report).toContainEqual(
      expect.objectContaining({ id: "tree-copy", status: "unsupported", category: "tree" })
    );
    const loaded = parseVectorDocument(serializeVectorDocument(copy.document))!;
    expect(serializeDocument(restoreLegacyCopy(loaded)!)).toBe(before);
    expect(loaded).not.toHaveProperty("mesh");
  });
});

describe("conversion archive validation", () => {
  it("rejects a truncated archived original rather than presenting an unrestorable copy", () => {
    const source = createGridDocument({ seed: "archive", grid: "hex", size: "micro" }),
      copy = copyLegacyCity(source).document;
    copy.legacyCopy!.sourceJson = '{"format":"fmg-city-editor","version":6}';
    expect(parseVectorDocument(JSON.stringify(copy))).toBeNull();
    expect(() => serializeVectorDocument(copy)).toThrow("legacy-source");
  });
});
