import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { Grid } from "../types/Grid";
import type { PackedGraph, PackedGraphCells } from "../types/PackedGraph";
import { DATA_FIELD_OWNERSHIP, type DataFieldOwnership, findFieldOwnership } from "./dataFieldOwnership";
import { EXTENSION_ENTITY_SLICE_DEFINITIONS, EXTENSION_SLICE_DEFINITIONS } from "./extensionStateSlices";
import type { PresentationData } from "./presentationData";
import { SIMULATION_BURG_FIELDS } from "./simulationBurgState";
import { SIMULATION_CELL_COLUMN_DEFINITIONS } from "./simulationCellColumns";
import { SIMULATION_STATE_FIELDS } from "./simulationStateState";
import { type DataTopic, FULL_REPLACE_TOPICS } from "./worldRuntime";

/** Expand inventory brace groups such as `pack.cells.{h,t,f}` into leaf paths. */
function expandOwnershipPath(path: string): string[] {
  const match = path.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (!match) return [path];
  const [, prefix, body, suffix] = match;
  return body.split(",").map(part => `${prefix}${part.trim()}${suffix}`);
}

function allExpandedPaths(): string[] {
  return DATA_FIELD_OWNERSHIP.flatMap(field => expandOwnershipPath(field.path));
}

function pathCovered(path: string): boolean {
  if (findFieldOwnership(path)) return true;
  return allExpandedPaths().includes(path);
}

/** Core (non-extension) DataTopic values that must appear in the ownership inventory. */
const CORE_DATA_TOPICS: readonly DataTopic[] = [
  "map.identity",
  "map.topology",
  "map.physical",
  "map.politics",
  "map.settlements",
  "map.networks",
  "map.annotations",
  "simulation.clock",
  "simulation.rng",
  "simulation.cells",
  "simulation.states",
  "simulation.burgs",
  "simulation.military",
  "presentation.styles",
  "presentation.layers",
  "presentation.labels",
  "presentation.overlays"
];

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

  it("maps every core DataTopic and FULL_REPLACE topic to at least one inventory field (P3-3)", () => {
    const topics = new Set(DATA_FIELD_OWNERSHIP.map(field => field.topic));
    for (const topic of CORE_DATA_TOPICS) {
      expect(topics.has(topic), `missing ownership coverage for topic ${topic}`).toBe(true);
    }
    for (const topic of FULL_REPLACE_TOPICS) {
      expect(topics.has(topic), `FULL_REPLACE topic ${topic} has no ownership field`).toBe(true);
    }
  });

  it("only uses valid DataTopic values (extension.* or core union) (P3-3)", () => {
    const core = new Set<string>(CORE_DATA_TOPICS);
    for (const field of DATA_FIELD_OWNERSHIP) {
      const topic = field.topic;
      if (typeof topic === "string" && topic.startsWith("extension.")) {
        expect(field.owner.startsWith("extension:")).toBe(true);
        continue;
      }
      expect(core.has(topic), `unknown topic ${topic} on ${field.path}`).toBe(true);
    }
  });

  it("covers every WorldContext top-level field (P3-3)", () => {
    const keys: Array<keyof WorldContext> = [
      "pack",
      "grid",
      "seed",
      "mapId",
      "mapHistory",
      "notes",
      "options",
      "biomesData",
      "nameBases",
      "graphWidth",
      "graphHeight",
      "mapCoordinates",
      "urbanization",
      "urbanDensity",
      "populationRate",
      "distanceScale"
    ];
    for (const key of keys) {
      if (key === "pack" || key === "grid") {
        // Covered by pack.* / grid.* groups rather than a single world.pack leaf.
        expect(DATA_FIELD_OWNERSHIP.some(f => f.path.startsWith(`${key}.`))).toBe(true);
        continue;
      }
      expect(pathCovered(`world.${key}`), `world.${key}`).toBe(true);
    }
  });

  it("covers every SimulationContext top-level field (P3-3)", () => {
    const keys: Array<keyof SimulationContext> = [
      "currentYear",
      "currentMonth",
      "currentDay",
      "era",
      "tickCount",
      "worldSeason",
      "rng",
      "cells",
      "burgs",
      "states",
      "military",
      "extensions",
      "intelligence",
      "strategicGoals",
      "populationLoss",
      "navalTechBonus",
      "frontier"
    ];
    // Clock fields share simulation.clock; cells/burgs/states/military use pack.* compatibility paths.
    const pathByKey: Partial<Record<keyof SimulationContext, string | "group">> = {
      currentYear: "simulation.clock",
      currentMonth: "simulation.clock",
      currentDay: "simulation.clock",
      era: "simulation.clock",
      tickCount: "simulation.clock",
      worldSeason: "simulation.clock",
      rng: "simulation.rng",
      cells: "group",
      burgs: "group",
      states: "group",
      military: "group",
      extensions: "group",
      intelligence: "simulation.intelligence",
      strategicGoals: "simulation.strategicGoals",
      populationLoss: "simulation.populationLoss",
      navalTechBonus: "simulation.navalTechBonus",
      frontier: "simulation.frontier"
    };
    for (const key of keys) {
      const mapped = pathByKey[key];
      expect(mapped, key).toBeTruthy();
      if (mapped === "group") {
        if (key === "extensions") {
          expect(DATA_FIELD_OWNERSHIP.some(f => f.path.startsWith("simulation.extensions."))).toBe(true);
        } else if (key === "cells") {
          expect(DATA_FIELD_OWNERSHIP.some(f => f.topic === "simulation.cells")).toBe(true);
        } else if (key === "burgs") {
          expect(DATA_FIELD_OWNERSHIP.some(f => f.topic === "simulation.burgs")).toBe(true);
        } else if (key === "states") {
          expect(DATA_FIELD_OWNERSHIP.some(f => f.topic === "simulation.states")).toBe(true);
        } else if (key === "military") {
          expect(DATA_FIELD_OWNERSHIP.some(f => f.topic === "simulation.military")).toBe(true);
        }
        continue;
      }
      expect(pathCovered(mapped!), key).toBe(true);
    }
  });

  it("covers every PresentationData field (P3-3)", () => {
    const keys: Array<keyof PresentationData> = ["styles", "activeLayers", "layerOrder", "labels", "overlays"];
    for (const key of keys) {
      expect(pathCovered(`presentation.${key}`), `presentation.${key}`).toBe(true);
    }
  });

  it("covers every PackedGraph top-level table (P3-3)", () => {
    const keys: Array<keyof PackedGraph> = [
      "cells",
      "vertices",
      "rivers",
      "features",
      "burgs",
      "states",
      "cultures",
      "routes",
      "religions",
      "zones",
      "markers",
      "frontierForts",
      "ice",
      "provinces",
      "monsters"
    ];
    for (const key of keys) {
      if (key === "cells" || key === "vertices" || key === "states" || key === "burgs") {
        expect(
          DATA_FIELD_OWNERSHIP.some(f => f.path.startsWith(`pack.${key}.`) || f.path === `pack.${key}`),
          `pack.${key}`
        ).toBe(true);
        continue;
      }
      expect(pathCovered(`pack.${key}`), `pack.${key}`).toBe(true);
    }
  });

  it("covers every PackedGraphCells column via exact or brace-group path (P3-3)", () => {
    const cellKeys: Array<keyof PackedGraphCells> = [
      "i",
      "c",
      "v",
      "p",
      "b",
      "h",
      "q",
      "t",
      "r",
      "f",
      "fl",
      "s",
      "pop",
      "conf",
      "haven",
      "g",
      "culture",
      "biomeCode",
      "harbor",
      "enclosure",
      "burg",
      "religion",
      "state",
      "area",
      "province",
      "routes",
      "danger",
      "capacity",
      "children",
      "maleAdults",
      "femaleAdults",
      "elders"
    ];
    for (const key of cellKeys) {
      expect(pathCovered(`pack.cells.${key}`), `pack.cells.${key}`).toBe(true);
    }
  });

  it("covers Grid topology identity fields as group inventory (P3-3)", () => {
    // Grid stores spacing/cellsDesired/seed under the coarse grid.identity group.
    expect(findFieldOwnership("grid.identity")).toBeDefined();
    expect(findFieldOwnership("grid.boundary")).toBeDefined();
    expect(findFieldOwnership("grid.points")).toBeDefined();
    const gridKeys: Array<keyof Grid> = ["boundary", "points", "cells", "vertices", "features"];
    for (const key of gridKeys) {
      if (key === "cells" || key === "vertices") {
        expect(DATA_FIELD_OWNERSHIP.some(f => f.path.startsWith(`grid.${key}`))).toBe(true);
      } else {
        expect(pathCovered(`grid.${key}`), `grid.${key}`).toBe(true);
      }
    }
  });

  it("never double-classifies the same expanded leaf path (P3-3)", () => {
    const leaves = allExpandedPaths();
    expect(new Set(leaves).size).toBe(leaves.length);
  });

  it("keeps owner namespace consistent with topic family (P3-3)", () => {
    for (const field of DATA_FIELD_OWNERSHIP as readonly DataFieldOwnership[]) {
      if (field.topic.startsWith("map.")) expect(field.owner).toBe("map");
      else if (field.topic.startsWith("simulation.")) expect(field.owner).toBe("simulation");
      else if (field.topic.startsWith("presentation.")) expect(field.owner).toBe("presentation");
      else if (field.topic.startsWith("extension.")) {
        expect(field.owner.startsWith("extension:")).toBe(true);
      }
    }
  });
});
