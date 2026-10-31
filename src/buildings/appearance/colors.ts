import { BUILDING_PALETTES } from "./palette";
import { BUILDING_APPEARANCE_VERSION, type BuildingAppearance } from "./types";

/** Both SVG and three use these exact sRGB swatches. Legacy keeps its original renderer colors. */
export function buildingAppearanceColors(appearance?: BuildingAppearance) {
  if (
    !appearance ||
    appearance.version !== BUILDING_APPEARANCE_VERSION ||
    (appearance.profileId === "legacy" && appearance.wallFinish === "legacy")
  )
    return undefined;
  return {
    roof: BUILDING_PALETTES[appearance.roofPaletteId][appearance.shadeBin],
    wall: BUILDING_PALETTES[appearance.wallPaletteId][appearance.shadeBin],
    frame: appearance.framePaletteId ? BUILDING_PALETTES[appearance.framePaletteId][appearance.shadeBin] : undefined
  };
}
