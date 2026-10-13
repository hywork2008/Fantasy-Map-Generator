import { editorText } from "../../../../i18n/editorMessages";
import { installCastle, registerTownCircuit } from "../../../core/castles";
import { townCircuits } from "../../../core/fortifications";
import type { CityProgram } from "../../../core/gen/types";
import type { CityDocument, Point } from "../../../core/types";
import type { Plan } from "../contracts";
import type { AssemblyReject } from "./contracts";
import { settingsLegacy } from "./documentProperties";

export interface ApplyCircuitsInput {
  stageStep: number;
  plan: Pick<Plan, "urban" | "castleSite" | "moats" | "legacyCastles">;
  next: CityDocument;
  urbanRegions: Point[][];
  program: CityProgram;
  actualTownFaces: Set<string> | null;
  faceIdOf: string[];
  firstWallId: string | undefined;
  castleInstalledFirst: boolean;
  source: CityDocument;
  reject: AssemblyReject;
  mesh: import("../../../core/types").Mesh;
}

/** Registers accepted town circuits, installs the castle and assigns moat settings before road routing. */
export function applyCircuits(input: ApplyCircuitsInput) {
  let {
    stageStep,
    plan,
    next,
    urbanRegions,
    program,
    actualTownFaces,
    faceIdOf,
    firstWallId,
    castleInstalledFirst,
    source,
    reject,
    mesh
  } = input;
  if (stageStep >= 4 && !settingsLegacy(plan)) {
    registerTownCircuit(
      next,
      urbanRegions,
      program.walls,
      actualTownFaces ? [...actualTownFaces] : [...plan.urban].map(id => faceIdOf[id]),
      firstWallId ? 1 : undefined
    );
    if (firstWallId) {
      const innerFaces = new Set(next.defenseCircuits!.find(c => c.id === firstWallId)!.areaFaceIds);
      const outer = townCircuits(next).at(-1)!;
      for (const id of outer.areaFaceIds) next.mesh.faces[id].properties.wallRing = innerFaces.has(id) ? 0 : 1;
    }
    if (plan.castleSite && !castleInstalledFirst) {
      const castleDetails: string[] = [];
      const installed = installCastle(
        next,
        plan.castleSite,
        plan.castleSite.faceId,
        source.generationSeed ?? "",
        castleDetails
      );
      if (!installed) {
        return {
          stopped: true as const,
          document: reject(
            next,
            "castle",
            "castle-layout-too-small",
            editorText("cityEditor.messages.castleGatesCourtyardAndRequiredBuildingsDoNotFitIn"),
            undefined,
            castleDetails
          )
        };
      }
      next = installed;
      mesh = next.mesh;
    }
  }

  for (const circuit of next.defenseCircuits ?? []) {
    if (!circuit.locked && plan.moats?.[circuit.scope] !== undefined)
      circuit.moat = { enabled: !!plan.moats[circuit.scope], widthMeters: circuit.scope === "town" ? 12 : 8 };
  }

  return { stopped: false as const, next, mesh };
}

export type ApplyCircuitsResult = ReturnType<typeof applyCircuits>;
