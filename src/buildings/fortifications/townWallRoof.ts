import { BUILDING_PALETTES, type BuildingPaletteId } from "../appearance/palette";
import type { BuildingAppearanceProfile } from "../appearance/types";

/** Durable roof coverings for fortified towers, using the housing culture swatches. */
export function townWallRoofPalette(profile: BuildingAppearanceProfile): number[] {
  const palettes: Record<BuildingAppearanceProfile, BuildingPaletteId> = {
    legacy: "slate",
    mediterranean: "terracotta",
    atlantic: "atlantic-tile",
    "northern-wooded": "shingle",
    "northern-urban": "urban-tile",
    "stone-upland": "local-stone-roof"
  };
  return BUILDING_PALETTES[palettes[profile]].map(color => Number.parseInt(color.slice(1), 16));
}
