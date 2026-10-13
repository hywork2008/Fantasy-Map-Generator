import { sizePresetForExtent } from "../../../core/document";
import { classifyUrban } from "../../../core/gen/classifyUrban";
import type { RoutedRiver } from "../../../core/gen/riverPath";
import {
  evolutionWallInsetRings,
  extendCoreToCoast,
  insetWalledCore,
  outerWalledAreaShare,
  splitUrbanCore
} from "../../../core/gen/settlementExtent";
import type { Cell, CityParams, CityProgram } from "../../../core/gen/types";
import type { Mesh } from "../../../core/types";
import type { GenerationSettings } from "../../../types/generation";

export interface PlanUrbanInput {
  plannedUrban: import("../../../core/gen/classifyUrban").UrbanClassification | null;
  cells: Cell[];
  sea: Set<number>;
  river: import("../../../core/gen/classifyRiver").RiverClassification;
  urbanBearings: number[];
  urbanRadius: number;
  params: CityParams;
  complete: boolean;
  stageStep: number;
  settings: Pick<GenerationSettings, "urbanCoreMode" | "townWallRings" | "walledAreaShare">;
  program: CityProgram;
  compactCore: boolean;
  openCoastalCore: boolean;
  plannedCore: Set<number> | null;
  mark: (phase: string, counts?: Record<string, number>) => void;
  mesh: Mesh;
  faceIdOf: string[];
  preserveImportedCore: boolean;
  effectiveLayout: "organic" | "circulade" | "bram" | "classic";
  outsideRiver: boolean;
  seed: string;
  gridKind: "hex" | "voronoi" | "evolution" | undefined;
  retainBurg: (core: Set<number>) => Set<number>;
  burgCell: Cell | null;
  rivers: RoutedRiver[];
}

/** Requires river banks and the provisional core. Returns the current mesh and urban sets. The urban observer mark deliberately precedes inset adjustments. */
export function planUrban(input: PlanUrbanInput) {
  const {
    plannedUrban,
    cells,
    sea,
    river,
    urbanBearings,
    urbanRadius,
    params,
    complete,
    stageStep,
    settings,
    program,
    compactCore,
    openCoastalCore,
    plannedCore,
    mark,
    mesh,
    faceIdOf,
    preserveImportedCore,
    effectiveLayout,
    outsideRiver,
    seed,
    gridKind,
    retainBurg,
    burgCell,
    rivers
  } = input;
  // S3 — urban core. `params.urbanNPatches` (debug/tuning override) caps the
  // fill to a fixed cell count; otherwise accumulate actual area up to π R².
  // `urbanStages` records each admitted cell in fill order for
  // `generateUrbanPatchStep`'s per-loop scrub.
  const classification =
    plannedUrban ??
    classifyUrban(
      cells,
      { sea, bank: river.bank },
      urbanBearings,
      urbanRadius,
      null,
      params.urbanNPatches ?? null,
      params.cellSizeMeters,
      !complete && stageStep === 3,
      settings.urbanCoreMode
    );
  // City extent and wall capacity are independent. The outer residential
  // belt retains the rest of the same flood-fill, including its connectivity.
  // Grid evolution may then pull a tiny/small curtain in by one or two cells.
  const walledShare = program.walls ? outerWalledAreaShare(settings, params.extentMeters) : 1;
  const split = splitUrbanCore(cells, classification.urban, compactCore ? 1 : walledShare);
  // An open curtain must meet the shore; a smaller wall capacity must not
  // leave a dry ring between the protected core and its natural boundary.
  const urban = openCoastalCore
    ? extendCoreToCoast(cells, plannedCore ?? split.urban, classification.urban, sea)
    : (plannedCore ?? split.urban);
  const residentialOutskirts = new Set([...classification.urban].filter(id => !urban.has(id)));
  const outskirts = new Set([...classification.outskirts, ...residentialOutskirts]);
  let urbanStages = classification.stages.filter(stage => urban.has(stage.cellId));
  const builtUp = classification.urban;
  mark("urban", { urbanFaces: urban.size, recordedStages: urbanStages.length, builtUpFaces: builtUp.size });

  const currentMesh = mesh;
  const currentFaceIdOf = faceIdOf;
  const currentCells = cells;
  let currentUrban = urban;
  const currentBuiltUp = builtUp;
  const currentOutskirts = outskirts;
  const meshModified = false;

  // Wall routing owns river conflicts. Planning must not subdivide every
  // river-side cell before a usable curtain route has been found.

  // Bram's spoke roads have to meet a curtain outside the 120 m core. A
  // one-cell peel on this coarse mesh drops that curtain onto the spoke and
  // leaves the gates unroutable, so Bram keeps the settlement-edge curtain.
  // Imports without bridgeable rivers keep the supplied disk rather than a random inset.
  const insetRings =
    preserveImportedCore || openCoastalCore || effectiveLayout === "bram" || outsideRiver
      ? 0
      : evolutionWallInsetRings(sizePresetForExtent(params.extentMeters), seed, gridKind, program.walls, walledShare);
  if (!compactCore && insetRings > 0 && currentUrban.size > 0) {
    const inset = insetWalledCore(currentCells, retainBurg(currentUrban), insetRings, burgCell?.id);
    if (inset.peeled.size) {
      currentUrban = inset.urban;
      for (const id of inset.peeled) {
        residentialOutskirts.add(id);
        currentOutskirts.add(id);
      }
      // Original cell IDs are retained throughout the wall plan.
      urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
    }
  }
  // A channel can leave the flooded core on the far bank. The curtain belongs
  // around the burg; grow that core on the near bank instead of walling the
  // opposite shore.
  if (program.walls && burgCell && !currentUrban.has(burgCell.id) && effectiveLayout !== "bram") {
    const target = Math.max(currentUrban.size, 1);
    const byId = new Map(currentCells.map(cell => [cell.id, cell]));
    const grown = new Set<number>([burgCell.id]);
    const pending = [burgCell.id];
    while (pending.length && grown.size < target) {
      const id = pending.shift()!;
      const cell = byId.get(id);
      if (!cell) continue;
      const neighbors = cell.neighbors.filter(
        neighbor => !grown.has(neighbor) && !sea.has(neighbor) && byId.has(neighbor)
      );
      neighbors.sort((a, b) => {
        const pa = byId.get(a)!.centroid;
        const pb = byId.get(b)!.centroid;
        return pa[0] ** 2 + pa[1] ** 2 - (pb[0] ** 2 + pb[1] ** 2);
      });
      for (const neighbor of neighbors) {
        grown.add(neighbor);
        pending.push(neighbor);
        if (grown.size >= target) break;
      }
    }
    for (const id of currentUrban) {
      if (grown.has(id)) continue;
      residentialOutskirts.add(id);
      currentOutskirts.add(id);
    }
    currentUrban = grown;
    urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
  }
  // One cell has no interior vertex once the gate passage splits it, so the
  // street snaps onto the curtain. Keep a second dry cell beside the burg,
  // off the river so the curtain does not inherit a shared bank.
  if (
    program.walls &&
    burgCell &&
    currentUrban.has(burgCell.id) &&
    currentUrban.size < 2 &&
    effectiveLayout !== "bram"
  ) {
    const byId = new Map(currentCells.map(cell => [cell.id, cell]));
    const riverVertices = new Set(
      rivers.flatMap(river =>
        river.edgePoints.map(point => `${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`)
      )
    );
    const touchesRiver = (cellId: number) =>
      byId
        .get(cellId)
        ?.polygon.some(point => riverVertices.has(`${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`)) ??
      false;
    const neighbors = burgCell.neighbors
      .filter(
        neighbor => !currentUrban.has(neighbor) && !sea.has(neighbor) && !touchesRiver(neighbor) && byId.has(neighbor)
      )
      .sort((a, b) => {
        const pa = byId.get(a)!.centroid;
        const pb = byId.get(b)!.centroid;
        return pa[0] ** 2 + pa[1] ** 2 - (pb[0] ** 2 + pb[1] ** 2);
      });
    if (neighbors.length) {
      currentUrban = new Set([...currentUrban, neighbors[0]]);
      urbanStages = classification.stages.filter(stage => currentUrban.has(stage.cellId));
    }
  }

  return {
    residentialOutskirts,
    urbanStages,
    currentMesh,
    currentFaceIdOf,
    currentCells,
    currentUrban,
    currentBuiltUp,
    currentOutskirts,
    meshModified
  };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanUrbanResult = ReturnType<typeof planUrban>;
