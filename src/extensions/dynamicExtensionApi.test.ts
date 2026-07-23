import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { ExtensionReadList, ExtensionReadNumericColumn, ExtensionReadRecord } from "../runtime/extensionReadModel";
import { createWorldRuntime } from "../runtime/worldRuntime";
import type { ExtensionAPI } from "../types/extension-api";
import { createDynamicExtensionAPI } from "./dynamicExtensionApi";

function asRecord(value: unknown): ExtensionReadRecord {
  if (!value || typeof value !== "object" || !("get" in value)) throw new Error("Expected a read record");
  return value as ExtensionReadRecord;
}

function asList(value: unknown): ExtensionReadList {
  if (!value || typeof value !== "object" || !("values" in value)) throw new Error("Expected a read list");
  return value as ExtensionReadList;
}

function asColumn(value: unknown): ExtensionReadNumericColumn {
  if (!value || typeof value !== "object" || !("copyRange" in value)) throw new Error("Expected a numeric column");
  return value as ExtensionReadNumericColumn;
}

describe("dynamic extension read facade", () => {
  it("does not expose the mutable world, simulation, or typed-array backing stores", async () => {
    const world = {
      pack: { burgs: [{ i: 1, name: "Alderwatch" }], cells: { h: new Uint8Array([12, 34]) } },
      grid: {},
      notes: []
    } as unknown as WorldContext;
    const simulation = { cells: { population: new Float32Array([5]) } } as unknown as SimulationContext;
    const runtime = createWorldRuntime(world, simulation);
    const api = createDynamicExtensionAPI({} as ExtensionAPI, runtime);

    const snapshot = api.world.read();
    const pack = asRecord(snapshot.world.get("pack"));
    const burgs = asList(pack.get("burgs"));
    const burg = asRecord(burgs.get(0));
    const cells = asRecord(pack.get("cells"));
    const heights = asColumn(cells.get("h"));

    expect(api.worldContext).toBe(snapshot.world);
    expect(api.simulationContext).toBe(snapshot.simulation);
    expect(burg.get("name")).toBe("Alderwatch");
    expect(heights.copyRange()).toEqual([12, 34]);
    expect("push" in (burgs as object)).toBe(false);
    expect("buffer" in (heights as object)).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    // Public compatibility names must not hand out the trusted mutable contexts.
    expect(api.worldContext).not.toBe(world as unknown);
    expect(api.simulationContext).not.toBe(simulation as unknown);
    expect(Array.isArray(burgs)).toBe(false);
    expect(ArrayBuffer.isView(heights)).toBe(false);

    world.pack.burgs[0].name = "Changed in host";
    expect(burg.get("name")).toBe("Alderwatch");

    await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: ["map.settlements"] })
    });
    expect(asRecord(asList(asRecord(api.world.read().world.get("pack")).get("burgs")).get(0)).get("name")).toBe(
      "Changed in host"
    );
  });
});
