import { describe, expect, it } from "vitest";
import { appServices, initRng, restoreRngFromSimulation } from "../context/appServices";
import type { SimulationContext } from "../context/simulationContext";
import { createPresentationData } from "./presentationData";
import {
  assertValidSimulationRngState,
  createSimulationRngState,
  createSystemStepRng,
  deriveSystemStreamSeed,
  exportLiveSimulationRng,
  installSimulationRng,
  runWithSystemRng,
  simulationRngStatesEqual,
  syncSimulationRngToContext
} from "./simulationRng";
import { ChunkedWorldCodecAdapter, createWorldDocument } from "./worldArchive";
import { createWorldRuntime } from "./worldRuntime";

function sampleWorld(seed = "rng-seed") {
  return {
    mapId: 1,
    seed,
    pack: {
      cells: { i: new Uint16Array([0, 1]), state: new Uint16Array([0, 1]) },
      burgs: [],
      states: [{ i: 0 }, { i: 1 }]
    },
    grid: { cells: { h: new Uint8Array([20, 30]) } }
  } as never;
}

function sampleSimulation(seed = "rng-seed"): SimulationContext {
  return {
    currentYear: 100,
    currentMonth: 1,
    currentDay: 1,
    era: "Test",
    tickCount: 0,
    worldSeason: "spring",
    rng: createSimulationRngState(seed),
    cells: {
      population: new Float32Array(2),
      carryingCapacity: new Float32Array(2),
      children: new Float32Array(2),
      maleAdults: new Float32Array(2),
      femaleAdults: new Float32Array(2),
      elders: new Float32Array(2),
      danger: new Uint8Array(2)
    },
    burgs: {},
    states: {},
    military: {},
    extensions: {},
    intelligence: {},
    strategicGoals: {},
    populationLoss: { simDay: 0, history: [] },
    navalTechBonus: {}
  };
}

describe("SimulationRngState", () => {
  it("creates a deterministic stream from a seed", () => {
    const a = createSimulationRngState("same");
    const b = createSimulationRngState("same");
    expect(a).toEqual(b);
    assertValidSimulationRngState(a);

    const serviceA = installSimulationRng(a);
    const serviceB = installSimulationRng(b);
    expect(serviceA.rand()).toBe(serviceB.rand());
  });

  it("export/import preserves the stream position", () => {
    initRng("export-import");
    const first = appServices.rng.rand();
    const mid = exportLiveSimulationRng();
    expect(mid).not.toBeNull();
    const second = appServices.rng.rand();

    appServices.rng = installSimulationRng(mid!);
    expect(appServices.rng.rand()).toBe(second);
    expect(appServices.rng.rand()).not.toBe(first);
  });

  it("syncs live state onto SimulationContext for archive capture", () => {
    const simulation = sampleSimulation("sync-seed");
    appServices.rng = installSimulationRng(simulation.rng);
    appServices.rng.rand();
    appServices.rng.rand();
    syncSimulationRngToContext(simulation);

    const restored = sampleSimulation("other");
    restored.rng = structuredClone(simulation.rng);
    restoreRngFromSimulation("sync-seed", restored);
    const afterRestore = appServices.rng.rand();

    appServices.rng = installSimulationRng(simulation.rng);
    expect(appServices.rng.rand()).toBe(afterRestore);
  });

  it("round-trips through the .fmg archive and world.replace", async () => {
    const world = sampleWorld("archive-rng");
    const simulation = sampleSimulation("archive-rng");
    appServices.rng = installSimulationRng(simulation.rng);
    // Advance the stream so we are not at the initial seed position.
    appServices.rng.rand();
    appServices.rng.rand();
    appServices.rng.rand();
    syncSimulationRngToContext(simulation);
    const expectedNext = (() => {
      const probe = installSimulationRng(structuredClone(simulation.rng));
      return probe.rand();
    })();
    // Re-install after probe.
    appServices.rng = installSimulationRng(simulation.rng);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);
    const codec = new ChunkedWorldCodecAdapter();
    const blob = await codec.encode(document);
    const staged = await codec.decode({
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer()),
      blob
    });

    expect(staged.document.simulation.rng).toEqual(simulation.rng);

    const liveWorld = sampleWorld("live");
    const liveSimulation = sampleSimulation("live");
    const runtime = createWorldRuntime(liveWorld, liveSimulation, createPresentationData());
    await runtime.dispatch({
      type: "world.replace",
      payload: { stage: "validated", document: staged.document }
    });

    expect(simulationRngStatesEqual(liveSimulation.rng, simulation.rng)).toBe(true);
    expect(appServices.rng.rand()).toBe(expectedNext);
  });

  it("materialises missing rng from the map seed for older archives", async () => {
    const world = sampleWorld("legacy-seed");
    const simulation = sampleSimulation("legacy-seed");
    const document = createWorldDocument(world, simulation, createPresentationData(), []);
    delete (document.simulation as { rng?: unknown }).rng;

    const codec = new ChunkedWorldCodecAdapter();
    // encode validates and fills rng from the map seed.
    const blob = await codec.encode(document);
    const staged = await codec.decode({
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer()),
      blob
    });
    expect(staged.document.simulation.rng?.seed).toBe("legacy-seed");
    expect(staged.document.simulation.rng?.algorithm).toBe("alea-0.9");
    expect(staged.document.simulation.rng?.streams).toEqual({});
  });

  it("derives independent per-system streams from seed + system id + tick + date", () => {
    const keyA = { systemId: "economy.tick", tick: 3, year: 1000, month: 1, day: 4 };
    const keyB = { systemId: "nobility.tick", tick: 3, year: 1000, month: 1, day: 4 };
    expect(deriveSystemStreamSeed("map", keyA)).not.toBe(deriveSystemStreamSeed("map", keyB));
    expect(deriveSystemStreamSeed("map", keyA)).not.toBe(deriveSystemStreamSeed("map", { ...keyA, tick: 4 }));

    const a1 = createSystemStepRng("map", keyA);
    const a2 = createSystemStepRng("map", keyA);
    expect(a1.service.rand()).toBe(a2.service.rand());

    const b = createSystemStepRng("map", keyB);
    // Rebuild A after B draws heavily — A must be unaffected.
    for (let i = 0; i < 50; i++) b.service.rand();
    const aAgain = createSystemStepRng("map", keyA);
    const aFresh = createSystemStepRng("map", keyA);
    expect(aAgain.service.rand()).toBe(aFresh.service.rand());
  });

  it("records system stream endings and keeps the shared root stream isolated", () => {
    const simulation = sampleSimulation("iso-seed");
    appServices.rng = installSimulationRng(simulation.rng);
    const rootBefore = exportLiveSimulationRng();
    const holder = { rng: appServices.rng };

    const drawsA: number[] = [];
    const drawsB: number[] = [];
    runWithSystemRng(simulation, { systemId: "sys-a", tick: 1, year: 1, month: 1, day: 1 }, holder, rng => {
      for (let i = 0; i < 5; i++) drawsA.push(rng.rand());
    });
    runWithSystemRng(simulation, { systemId: "sys-b", tick: 1, year: 1, month: 1, day: 1 }, holder, rng => {
      for (let i = 0; i < 20; i++) drawsB.push(rng.rand());
    });
    // Re-run A with a heavy B already done — same A sequence.
    const drawsA2: number[] = [];
    runWithSystemRng(simulation, { systemId: "sys-a", tick: 1, year: 1, month: 1, day: 1 }, holder, rng => {
      for (let i = 0; i < 5; i++) drawsA2.push(rng.rand());
    });
    expect(drawsA2).toEqual(drawsA);
    expect(drawsB).not.toEqual(drawsA);

    expect(simulation.rng.streams["sys-a"]).toBeDefined();
    expect(simulation.rng.streams["sys-b"]).toBeDefined();
    // Shared root stream was not advanced by system draws.
    expect(simulationRngStatesEqual(exportLiveSimulationRng() ?? undefined, rootBefore ?? undefined)).toBe(true);
  });

  it("round-trips algorithm, seed, root state, and per-system streams in .fmg", async () => {
    const world = sampleWorld("stream-seed");
    const simulation = sampleSimulation("stream-seed");
    appServices.rng = installSimulationRng(simulation.rng);
    appServices.rng.rand();
    syncSimulationRngToContext(simulation);

    runWithSystemRng(
      simulation,
      { systemId: "economy.tick", tick: 2, year: 100, month: 1, day: 2 },
      appServices,
      rng => {
        rng.rand();
        rng.rand();
      }
    );
    expect(Object.keys(simulation.rng.streams)).toContain("economy.tick");

    const document = createWorldDocument(world, simulation, createPresentationData(), []);
    const codec = new ChunkedWorldCodecAdapter();
    const blob = await codec.encode(document);
    const staged = await codec.decode({
      header: new Uint8Array(await blob.slice(0, 4).arrayBuffer()),
      blob
    });

    expect(staged.document.simulation.rng.algorithm).toBe("alea-0.9");
    expect(staged.document.simulation.rng.seed).toBe("stream-seed");
    expect(staged.document.simulation.rng.streams["economy.tick"]).toEqual(simulation.rng.streams["economy.tick"]);
    expect(simulationRngStatesEqual(staged.document.simulation.rng, simulation.rng)).toBe(true);
  });
});
