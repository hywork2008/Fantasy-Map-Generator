import { describe, expect, it } from "vitest";
import { DATA_FIELD_OWNERSHIP, findFieldOwnership } from "./dataFieldOwnership";
import { EXTENSION_ENTITY_SLICE_DEFINITIONS, EXTENSION_SLICE_DEFINITIONS } from "./extensionStateSlices";
import { SIMULATION_BURG_FIELDS } from "./simulationBurgState";
import { SIMULATION_CELL_COLUMN_DEFINITIONS } from "./simulationCellColumns";
import { SIMULATION_STATE_FIELDS } from "./simulationStateState";

describe("Phase 8 data field ownership inventory", () => {
  it("assigns every recorded legacy path to exactly one owner and topic", () => {
    const paths = DATA_FIELD_OWNERSHIP.map(field => field.path);

    expect(new Set(paths).size).toBe(paths.length);
    for (const field of DATA_FIELD_OWNERSHIP) {
      expect(field.owner).not.toBe("");
      expect(field.topic).not.toBe("");
      expect(field.deletePolicy).not.toBe("");
    }
  });

  it("covers every simulation cell compatibility column individually", () => {
    for (const definition of SIMULATION_CELL_COLUMN_DEFINITIONS) {
      expect(findFieldOwnership(`pack.cells.${definition.legacyField}`)).toMatchObject({
        owner: "simulation",
        topic: "simulation.cells"
      });
    }
  });

  it("covers every simulation burg compatibility field individually", () => {
    for (const field of SIMULATION_BURG_FIELDS) {
      expect(findFieldOwnership(`pack.burgs.${field}`)).toMatchObject({
        owner: "simulation",
        topic: "simulation.burgs"
      });
    }
  });

  it("covers every simulation state compatibility field individually", () => {
    for (const field of SIMULATION_STATE_FIELDS) {
      expect(findFieldOwnership(`pack.states.${field}`)).toMatchObject({
        owner: "simulation",
        topic: "simulation.states"
      });
    }
  });

  it("covers every extension compatibility field in its namespaced owner", () => {
    for (const definition of EXTENSION_SLICE_DEFINITIONS) {
      const path = `simulation.extensions.${definition.extensionId}.${definition.legacyField}`;
      expect(findFieldOwnership(path)?.owner).toBe(`extension:${definition.extensionId}`);
    }
  });

  it("covers every extension entity compatibility field in its namespaced owner", () => {
    for (const definition of EXTENSION_ENTITY_SLICE_DEFINITIONS) {
      const path = `simulation.extensions.${definition.extensionId}.${definition.sliceField}`;
      expect(findFieldOwnership(path)?.owner).toBe(`extension:${definition.extensionId}`);
    }
  });
});
