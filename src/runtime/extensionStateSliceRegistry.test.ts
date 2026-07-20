import { afterEach, describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import {
  assertRegisteredSliceCoreDeletesAllowed,
  checksumBytes,
  clearRegisteredStateSlices,
  demoteRegisteredSliceToOpaque,
  demoteUnregisteredExtensionSlices,
  EXTENSION_SLICE_MEDIA_TYPE,
  type ExtensionStateSliceSpec,
  encodeExtensionSlicePayload,
  promoteRegisteredOpaqueChunks,
  registerStateSliceSpec,
  tryPromoteOpaqueChunk
} from "./extensionStateSliceRegistry";
import { ensureBuiltinStateSlicesRegistered } from "./extensionStateSlices";
import { createPresentationData } from "./presentationData";
import { createWorldDocument, worldMigrationPipeline } from "./worldArchive";
import { createWorldRuntime } from "./worldRuntime";

function sampleWorld(): WorldContext {
  return {
    mapId: 7,
    seed: "slice-reg",
    pack: {
      cells: { i: new Uint16Array([0, 1]), state: new Uint16Array([1, 1]) },
      burgs: [{ i: 0 }, { i: 1 }],
      states: [{ i: 0 }, { i: 1 }],
      cultures: [{ i: 0 }, { i: 1 }]
    },
    grid: { cells: { h: new Uint8Array([20, 30]) } }
  } as unknown as WorldContext;
}

function sampleSimulation(extensions: Record<string, Record<string, unknown>> = {}): SimulationContext {
  return {
    currentYear: 1,
    currentMonth: 1,
    currentDay: 1,
    tickCount: 0,
    extensions
  } as SimulationContext;
}

function modPackSpec(overrides: Partial<ExtensionStateSliceSpec> = {}): ExtensionStateSliceSpec {
  return {
    extensionId: "mod-pack",
    schemaVersion: 2,
    defaultState: () => ({ notes: [] }),
    validate: value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("mod-pack slice must be a record");
      }
      const slice = value as Record<string, unknown>;
      if (slice.notes !== undefined && !Array.isArray(slice.notes)) {
        throw new Error("mod-pack.notes must be an array");
      }
    },
    migrate: (fromVersion, value) => {
      if (!value || typeof value !== "object") return { notes: [] };
      const slice = { ...(value as Record<string, unknown>) };
      if (fromVersion < 2 && slice.note && !slice.notes) {
        slice.notes = [slice.note];
        delete slice.note;
      }
      return slice;
    },
    collectCoreReferences: slice => {
      const stateId = (slice as { stateId?: unknown }).stateId;
      if (typeof stateId === "number" && Number.isInteger(stateId) && stateId > 0) {
        return [{ kind: "state", id: stateId, onDelete: "restrict" }];
      }
      return [];
    },
    ...overrides
  };
}

afterEach(() => {
  clearRegisteredStateSlices();
  ensureBuiltinStateSlicesRegistered();
});

describe("extension state slice registration lifecycle", () => {
  it("demotes unregistered simulation.extensions into opaque chunks on capture", async () => {
    const world = sampleWorld();
    const simulation = sampleSimulation({
      "foreign-mod": { marker: "keep-me", stateId: 1 }
    });
    const runtime = createWorldRuntime(world, simulation);
    const document = await runtime.captureArchiveDocument();

    expect(document.simulation.extensions?.["foreign-mod"]).toBeUndefined();
    expect(document.opaqueExtensionChunks).toHaveLength(1);
    expect(document.opaqueExtensionChunks[0]?.extensionId).toBe("foreign-mod");
    expect(document.opaqueExtensionChunks[0]?.coreReferences).toBe("unknown");
    expect(document.opaqueExtensionChunks[0]?.mediaType).toBe(EXTENSION_SLICE_MEDIA_TYPE);
  });

  it("promotes an opaque chunk after registerStateSlice migrate+validate", async () => {
    const world = sampleWorld();
    const simulation = sampleSimulation();
    const runtime = createWorldRuntime(world, simulation);
    const spec = modPackSpec();
    const bytes = encodeExtensionSlicePayload(spec, { note: "legacy", stateId: 1 } as unknown as Record<
      string,
      unknown
    >);
    // Force v1 payload shape through migrate path.
    const v1Bytes = new TextEncoder().encode(JSON.stringify({ note: "legacy", stateId: 1 }));
    const opaque = {
      extensionId: "mod-pack",
      schemaVersion: 1,
      mediaType: EXTENSION_SLICE_MEDIA_TYPE,
      bytes: v1Bytes,
      checksum: await checksumBytes(v1Bytes),
      coreReferences: [{ kind: "state" as const, id: 1, onDelete: "restrict" as const }]
    };
    const document = createWorldDocument(world, simulation, createPresentationData(), [opaque]);
    await runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document } });

    expect(simulation.extensions?.["mod-pack"]).toBeUndefined();

    const unregister = runtime.registerStateSlice(spec);
    expect(simulation.extensions?.["mod-pack"]).toEqual({ notes: ["legacy"], stateId: 1 });
    expect(() => assertRegisteredSliceCoreDeletesAllowed(simulation, [{ kind: "state", id: 1 }])).toThrow(
      "extension mod-pack restricts that reference"
    );
    // Orphan culture deletes remain allowed for this slice (no culture refs).
    expect(() => assertRegisteredSliceCoreDeletesAllowed(simulation, [{ kind: "culture", id: 1 }])).not.toThrow();

    unregister();
    // bytes was only used to prove encode path compiles
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("leaves opaque bytes unchanged when promote validation fails", async () => {
    const world = sampleWorld();
    const simulation = sampleSimulation();
    const runtime = createWorldRuntime(world, simulation);
    const broken = new TextEncoder().encode(JSON.stringify({ notes: "not-an-array" }));
    const document = createWorldDocument(world, simulation, createPresentationData(), [
      {
        extensionId: "mod-pack",
        schemaVersion: 2,
        mediaType: EXTENSION_SLICE_MEDIA_TYPE,
        bytes: broken,
        checksum: await checksumBytes(broken),
        coreReferences: "unknown"
      }
    ]);
    await runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document } });

    runtime.registerStateSlice(modPackSpec());
    expect(simulation.extensions?.["mod-pack"]).toBeUndefined();
    const captured = await runtime.captureArchiveDocument();
    expect(captured.opaqueExtensionChunks).toHaveLength(1);
    expect(captured.opaqueExtensionChunks[0]?.bytes).toEqual(broken);
  });

  it("round-trips demotion and promotion through the migration pipeline", async () => {
    const world = sampleWorld();
    const simulation = sampleSimulation({
      "mod-pack": { notes: ["alpha"], stateId: 1 }
    });
    // No registration yet: demote unregistered slice.
    const demoted = await demoteUnregisteredExtensionSlices(
      createWorldDocument(world, simulation, createPresentationData(), [])
    );
    expect(demoted.simulation.extensions?.["mod-pack"]).toBeUndefined();
    expect(demoted.opaqueExtensionChunks).toHaveLength(1);

    const unregister = registerStateSliceSpec(modPackSpec());
    const promoted = promoteRegisteredOpaqueChunks(demoted);
    expect(promoted.simulation.extensions?.["mod-pack"]).toEqual({ notes: ["alpha"], stateId: 1 });
    expect(promoted.opaqueExtensionChunks).toHaveLength(0);

    const migrated = await worldMigrationPipeline.migrate({ stage: "decoded", document: demoted });
    expect(migrated.document.simulation.extensions?.["mod-pack"]).toEqual({ notes: ["alpha"], stateId: 1 });
    unregister();
  });

  it("demotes a registered slice with collectCoreReferences for later restrict policy", async () => {
    const world = sampleWorld();
    const unregister = registerStateSliceSpec(modPackSpec());
    const opaque = await demoteRegisteredSliceToOpaque("mod-pack", { notes: [], stateId: 1 }, world);
    expect(opaque.coreReferences).toEqual([{ kind: "state", id: 1, onDelete: "restrict" }]);
    expect(opaque.schemaVersion).toBe(2);

    const promoted = tryPromoteOpaqueChunk(opaque, world);
    expect(promoted?.slice).toEqual({ notes: [], stateId: 1 });
    unregister();
  });
});
