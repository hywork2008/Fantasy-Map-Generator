import { createGridDocument, descriptorFrameGridOptions, seaPortShoreDistanceMeters } from "../../generators/document";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import type { CityEditorShare } from "./incomingCity";

/** Settings object City Editor builds in `applyShare` before generating. */
export function cityEditorSettings(share: CityEditorShare): GenerationSettings {
  return {
    ...defaultGenerationSettings(),
    buildingPattern: "legacy",
    ...structuredClone(share.settings),
    descriptor: share.descriptor
  };
}

/** Grid document City Editor builds from an incoming share, including a fitted hamlet window. */
export function cityEditorDocument(share: CityEditorShare): CityDocument {
  return createGridDocument({
    size: share.size,
    grid: share.grid,
    seed: share.gridSeed ?? share.seed,
    hexSizeMeters: share.hexSizeMeters,
    patchParams: share.patchParams,
    ...(share.descriptor
      ? descriptorFrameGridOptions(
          share.descriptor.frame,
          share.descriptor.burg.waterAccess?.port.river === true,
          share.descriptor.burg.riverPlacement?.bankDistanceMeters,
          seaPortShoreDistanceMeters(share.descriptor)
        )
      : {}),
    measureBlockSize: share.measureBlockSize === true,
    biome: share.descriptor?.biome
  });
}
