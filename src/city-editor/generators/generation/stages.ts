import { inferredWallSettings, supportsUrbanMorphology } from "../../../utils/urbanMorphology";
import type { GenerationSettings, GenerationStageDefinition } from "../../types/generation";

export const GENERATION_STAGE_DEFINITIONS: GenerationStageDefinition[] = [
  {
    id: "coast",
    step: 1,
    processStep: 1,
    labelKey: "cityEditor.generationStages.coast.label",
    hintKey: "cityEditor.generationStages.coast.hint"
  },
  {
    id: "river",
    step: 2,
    processStep: 2,
    labelKey: "cityEditor.generationStages.river.label",
    hintKey: "cityEditor.generationStages.river.hint"
  },
  {
    id: "urban",
    step: 3,
    processStep: 3,
    labelKey: "cityEditor.generationStages.urban.label",
    hintKey: "cityEditor.generationStages.urban.hint"
  },
  {
    id: "walls",
    step: 4,
    processStep: 4,
    wallCheckpoint: "walls",
    labelKey: "cityEditor.generationStages.walls.label",
    hintKey: "cityEditor.generationStages.walls.hint"
  },
  {
    id: "riverPassages",
    step: 5,
    processStep: 4,
    wallCheckpoint: "riverPassages",
    labelKey: "cityEditor.generationStages.riverPassages.label",
    hintKey: "cityEditor.generationStages.riverPassages.hint"
  },
  {
    id: "passages",
    step: 6,
    processStep: 4,
    wallCheckpoint: "passages",
    labelKey: "cityEditor.generationStages.passages.label",
    hintKey: "cityEditor.generationStages.passages.hint"
  },
  {
    id: "gates",
    step: 7,
    processStep: 4,
    labelKey: "cityEditor.generationStages.gates.label",
    hintKey: "cityEditor.generationStages.gates.hint"
  },
  {
    id: "streets",
    step: 8,
    processStep: 5,
    labelKey: "cityEditor.generationStages.streets.label",
    hintKey: "cityEditor.generationStages.streets.hint"
  },
  {
    id: "wards",
    step: 9,
    processStep: 6,
    wallCheckpoint: "wards",
    labelKey: "cityEditor.generationStages.wards.label",
    hintKey: "cityEditor.generationStages.wards.hint"
  },
  {
    id: "centerRoads",
    step: 10,
    processStep: 6,
    labelKey: "cityEditor.generationStages.centerRoads.label",
    hintKey: "cityEditor.generationStages.centerRoads.hint"
  },
  {
    id: "innerWall",
    step: 11,
    processStep: 7,
    wallCheckpoint: "innerWall",
    labelKey: "cityEditor.generationStages.innerWall.label",
    hintKey: "cityEditor.generationStages.innerWall.hint"
  },
  {
    id: "innerGates",
    step: 12,
    processStep: 7,
    wallCheckpoint: "innerGates",
    labelKey: "cityEditor.generationStages.innerGates.label",
    hintKey: "cityEditor.generationStages.innerGates.hint"
  },
  {
    id: "townStreets",
    step: 13,
    processStep: 7,
    wallCheckpoint: "streets",
    labelKey: "cityEditor.generationStages.townStreets.label",
    hintKey: "cityEditor.generationStages.townStreets.hint"
  },
  {
    id: "geometry",
    step: 14,
    processStep: 7,
    labelKey: "cityEditor.generationStages.geometry.label",
    hintKey: "cityEditor.generationStages.geometry.hint"
  },
  {
    id: "blocks",
    step: 15,
    processStep: 8,
    labelKey: "cityEditor.generationStages.blocks.label",
    hintKey: "cityEditor.generationStages.blocks.hint"
  },
  {
    id: "buildings",
    step: 16,
    processStep: 9,
    labelKey: "cityEditor.generationStages.buildings.label",
    hintKey: "cityEditor.generationStages.buildings.hint"
  },
  {
    id: "conceal",
    step: 17,
    processStep: 10,
    labelKey: "cityEditor.generationStages.conceal.label",
    hintKey: "cityEditor.generationStages.conceal.hint"
  }
];

/** Keep the original slider sequence; the experiment exposes the old curtain
 * and its passages before the outer-wall checkpoints. */
export function generationStageDefinitions(settings: GenerationSettings): GenerationStageDefinition[] {
  if (settings.generationMethod === "skeleton-first") return SKELETON_STAGE_DEFINITIONS;
  const profile = settings.descriptor?.urbanMorphology;
  const rings =
    settings.townWallRings ??
    (profile && supportsUrbanMorphology(profile.period)
      ? inferredWallSettings(profile, settings.descriptor!.burg.dwellings).townWallRings
      : undefined);
  if (rings !== "double" || settings.townWallBuildOrder !== "inner-first") return GENERATION_STAGE_DEFINITIONS;
  const ids = [
    "coast",
    "river",
    "urban",
    "innerWall",
    "innerGates",
    "walls",
    "riverPassages",
    "passages",
    "gates",
    "streets",
    "wards",
    "centerRoads",
    "townStreets",
    "geometry",
    "blocks",
    "buildings",
    "conceal"
  ];
  return ids.map((id, index) => {
    const stage = GENERATION_STAGE_DEFINITIONS.find(s => s.id === id)!;
    return {
      ...stage,
      step: (index + 1) as GenerationStageDefinition["step"],
      ...(id === "innerWall"
        ? {
            hintKey: "cityEditor.generationStages.firstInnerWall.hint" as const
          }
        : {}),
      ...(id === "innerGates"
        ? {
            wallCheckpoint: "firstInnerGates" as const,
            labelKey: "cityEditor.generationStages.firstInnerGates.label" as const,
            hintKey: "cityEditor.generationStages.firstInnerGates.hint" as const
          }
        : {})
    };
  });
}

/** Negative process steps are vector-only K previews; positive steps reuse the
 * existing downstream preview contract without renumbering the old stages. */
export const SKELETON_STAGE_DEFINITIONS: GenerationStageDefinition[] = [
  ...(
    ["skeletonInputs", "skeletonCore", "skeletonWall", "skeletonCrossings", "skeletonCheck", "conformingMesh"] as const
  ).map((id, i) => ({
    id,
    step: (i + 1) as GenerationStageDefinition["step"],
    processStep: -(i + 1),
    labelKey: `cityEditor.generationStages.${id}.label` as GenerationStageDefinition["labelKey"],
    hintKey: `cityEditor.generationStages.${id}.hint` as GenerationStageDefinition["hintKey"]
  })),
  ...GENERATION_STAGE_DEFINITIONS.filter(s =>
    ["wards", "centerRoads", "townStreets", "geometry", "blocks", "buildings", "conceal"].includes(s.id)
  ).map((s, i) => ({ ...s, step: (i + 7) as GenerationStageDefinition["step"] }))
];
