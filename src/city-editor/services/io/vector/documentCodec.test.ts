import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../../../generators/document";
import { createVectorExample } from "../../../generators/vector/document";
import { exportCityMap, readCityMap } from "../cityEditorFile";
import { serializeDocument } from "../documentCodec";
import { parseVectorDocument, serializeVectorDocument } from "./documentCodec";

describe("vector file dispatch", () => {
  it("opens the native vector format and preserves the native mesh reader", async () => {
    const vector = createVectorExample();
    const read = await readCityMap(new File([serializeVectorDocument(vector)], "authored-city.json"));
    expect(read).toEqual({ source: "vector-city", document: vector });
    expect(read?.document).not.toHaveProperty("mesh");
    const mesh = createDocument("mesh-native", 400);
    const legacy = await readCityMap(new File([serializeDocument(mesh)], "existing-city.json"));
    expect(legacy?.source).toBe("city-editor");
    expect(legacy?.document.format).toBe("fmg-city-editor");
  });

  it("rejects unsupported vector versions and broken references without treating them as legacy or MFCG", async () => {
    const vector = createVectorExample();
    expect(await readCityMap(new File([JSON.stringify({ ...vector, version: 7 })], "future.json"))).toBeNull();
    vector.connections.nodes.eastGate.anchors[0].pathId = "missing";
    expect(await readCityMap(new File([JSON.stringify(vector)], "broken.json"))).toBeNull();
    expect(
      parseVectorDocument(JSON.stringify({ kind: "fmg-city-editor-share", input: createVectorExample() }))
    ).toBeNull();
  });

  it("downloads the editable ledger with a vector filename and no mesh projection", async () => {
    const document = createVectorExample();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:vector-test");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let filename = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      filename = this.download;
    });
    try {
      exportCityMap(document);
      expect(filename).toMatch(/^ce-vector-\d{8}-\d{6}\.json$/);
      const blob = createUrl.mock.calls[0][0] as Blob;
      expect(parseVectorDocument(await blob.text())).toEqual(document);
      expect(await blob.text()).not.toContain('"mesh"');
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      click.mockRestore();
    }
  });
});
