import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
import { ChunkedWorldCodecAdapter, createWorldDocument, LegacyMapCodecAdapter } from "./worldArchive";

function sampleWorld(): WorldContext {
  return {
    mapId: 42,
    seed: "archive-seed",
    pack: {
      cells: { i: new Uint16Array([0, 1]), state: new Uint16Array([1, 2]), pop: new Float32Array([1.5, 2.25]) },
      burgs: [],
      states: [{ i: 0 }, { i: 1 }, { i: 2 }]
    },
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

  it("rejects malformed entity tables before encoding an archive", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    (document.world.pack as unknown as Record<string, unknown>).states = [{ i: 0 }, null];

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "pack.states must be an array of records"
    );
  });

  it("rejects dense columns and foreign keys that do not match the topology", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    (document.world.pack.cells as unknown as Record<string, unknown>).biome = new Uint8Array([1]);

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow("pack.cells.biome has length 1");

    (document.world.pack.cells as unknown as Record<string, unknown>).biome = new Uint8Array([1, 1]);
    (document.world.pack.cells as unknown as Record<string, unknown>).state = new Uint16Array([1, 9]);
    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "pack.cells.state references missing entity 9"
    );
  });

  it("rejects entity records that point outside the topology", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    (document.world.pack as unknown as Record<string, unknown>).burgs = [{ i: 1, cell: 9, state: 1 }];

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "pack.burgs[0].cell references missing entity 9"
    );
  });

  it("rejects network records with invalid cell references", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    (document.world.pack as unknown as Record<string, unknown>).rivers = [{ i: 1, source: 0, mouth: 1, cells: [0, 8] }];

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "pack.rivers[0].cells references missing entity 8"
    );
  });

  it("rejects malformed host-known extension slices before encoding", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    document.simulation.extensions = {
      economy: { good: new Uint16Array([1]) }
    };

    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "simulation.extensions.economy.good has length 1; expected 2"
    );

    document.simulation.extensions = { nobility: { rulerIdByState: { 9: 1 } } };
    await expect(new ChunkedWorldCodecAdapter().encode(document)).rejects.toThrow(
      "simulation.extensions.nobility.rulerIdByState references missing entity 9"
    );
  });

  it("round-trips populationLoss, navalTechBonus, and extension tick maps", async () => {
    const simulation = sampleSimulation();
    simulation.populationLoss = {
      simDay: 12.5,
      history: [
        {
          day: 12,
          byState: { 1: { combat: 10, famine: 0, natural: 2, other: 0, total: 12 } },
          combatByCell: { 0: 10 }
        }
      ]
    };
    simulation.navalTechBonus = { 1: 1.3 };
    simulation.extensions = {
      economy: { forestDepletion: { 0: 0.4, 1: 0.1 } },
      nobility: { voyageIntelBonus: { "1:2": 5 } }
    };

    const document = createWorldDocument(sampleWorld(), simulation, createPresentationData(), []);
    const codec = new ChunkedWorldCodecAdapter();
    const blob = await codec.encode(document);
    const staged = await codec.decode({
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer()),
      blob
    });

    expect(staged.document.simulation.populationLoss.simDay).toBe(12.5);
    expect(staged.document.simulation.populationLoss.history[0]?.byState[1]?.total).toBe(12);
    expect(staged.document.simulation.populationLoss.history[0]?.combatByCell[0]).toBe(10);
    expect(staged.document.simulation.navalTechBonus[1]).toBe(1.3);
    expect(
      (staged.document.simulation.extensions.economy as { forestDepletion: Record<string, number> }).forestDepletion
    ).toEqual({ 0: 0.4, 1: 0.1 });
    expect(
      (staged.document.simulation.extensions.nobility as { voyageIntelBonus: Record<string, number> }).voyageIntelBonus
    ).toEqual({ "1:2": 5 });
  });

  it("normalizes missing populationLoss and navalTechBonus on older archives", async () => {
    const document = createWorldDocument(sampleWorld(), sampleSimulation(), createPresentationData(), []);
    delete (document.simulation as { populationLoss?: unknown }).populationLoss;
    delete (document.simulation as { navalTechBonus?: unknown }).navalTechBonus;

    const codec = new ChunkedWorldCodecAdapter();
    const blob = await codec.encode(document);
    const staged = await codec.decode({
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer()),
      blob
    });

    expect(staged.document.simulation.populationLoss).toEqual({ simDay: 0, history: [] });
    expect(staged.document.simulation.navalTechBonus).toEqual({});
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
