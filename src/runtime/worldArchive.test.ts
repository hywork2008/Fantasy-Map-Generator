import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
import { ChunkedWorldCodecAdapter, createWorldDocument, LegacyMapCodecAdapter } from "./worldArchive";

function sampleWorld(): WorldContext {
  return {
    mapId: 42,
    seed: "archive-seed",
    pack: { cells: { state: new Uint16Array([1, 2]), pop: new Float32Array([1.5, 2.25]) } },
    grid: { cells: { h: new Uint8Array([20, 30]) } }
  } as unknown as WorldContext;
}

function sampleSimulation(): SimulationContext {
  return { currentYear: 100, currentMonth: 2, currentDay: 3, tickCount: 4 } as SimulationContext;
}

describe("ChunkedWorldCodecAdapter", () => {
  it("round-trips typed arrays and unknown extension chunks without SVG", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), [
      {
        extensionId: "uninstalled-extension",
        schemaVersion: 3,
        mediaType: "application/octet-stream",
        bytes: new Uint8Array([1, 2, 3, 255]),
        checksum: "3e6f9aae16382bf563d8991b6da1b92213911f0dd5deea3ecaccf2f35a56794a",
        coreReferences: "unknown"
      }
    ]);
    const codec = new ChunkedWorldCodecAdapter();
    const blob = await codec.encode(document);
    const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const staged = await codec.decode({ header, blob });

    expect(staged.document.world.pack.cells.state).toEqual(new Uint16Array([1, 2]));
    expect(staged.document.world.pack.cells.pop).toEqual(new Float32Array([1.5, 2.25]));
    expect(staged.document.opaqueExtensionChunks).toHaveLength(1);
    expect(staged.document.opaqueExtensionChunks[0]?.bytes).toEqual(new Uint8Array([1, 2, 3, 255]));

    const rewritten = await codec.encode(staged.document);
    const rewrittenStage = await codec.decode({
      header: new Uint8Array(await rewritten.slice(0, 4).arrayBuffer()),
      blob: rewritten
    });
    expect(rewrittenStage.document.opaqueExtensionChunks[0]?.bytes).toEqual(new Uint8Array([1, 2, 3, 255]));
  });

  it("rejects an opaque extension chunk with a checksum that does not match its bytes", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), [
      {
        extensionId: "broken-extension",
        schemaVersion: 1,
        mediaType: "application/octet-stream",
        bytes: new Uint8Array([1]),
        checksum: "not-a-checksum",
        coreReferences: []
      }
    ]);

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow("checksum mismatch");
  });

  it("stages a legacy positional map without changing live state", async () => {
    const legacy = '1.0.0|license\r\nsettings\r\n<svg id="map">\r\n</svg>';
    const staged = await new LegacyMapCodecAdapter().decode({
      header: new Uint8Array([0]),
      blob: new Blob([legacy])
    });

    expect(staged.mapData).toEqual(["1.0.0|license", "settings", '<svg id="map">\n</svg>']);
  });
});
