import type { BuildingPaletteId } from "../appearance/palette";
import type { BuildingAppearanceProfile } from "../appearance/types";

/** Regional house styles, free of three.js so other generators (the Opus workhome, CE) can share them. */
type RegionalHouseProfile = Exclude<BuildingAppearanceProfile, "legacy">;

export type RegionalCover = "coppi" | "thatch" | "tile" | "stone" | "slate" | "shingle" | "turf" | "lead";
export interface HouseStyle {
  note: string;
  wall: BuildingPaletteId;
  roof: BuildingPaletteId;
  cover: RegionalCover;
  frame?: BuildingPaletteId;
  /** Vertical board-and-batten cladding instead of an infilled frame. */
  boarding?: boolean;
  /** Ground storey in coursed rubble under a framed upper storey. */
  stoneGround?: BuildingPaletteId;
  chimney: "round-pots" | "octagonal-pots" | "open-stack" | "tile-cowl" | "stone-cowl";
  plinth: BuildingPaletteId;
  jetty: number;
  overhang: number;
  verge: number;
  shutters?: readonly string[];
}

export const REGIONAL_HOUSE_STYLES: Record<RegionalHouseProfile, HouseStyle> = {
  mediterranean: {
    note: "Limewashed masonry houses with stone quoins, louvred shutters, a double tile-course eave, coppo (barrel) tile roofs, an iron balcony and tile-capped chimneys.",
    wall: "limewash",
    roof: "terracotta",
    cover: "coppi",
    chimney: "tile-cowl",
    plinth: "limestone",
    jetty: 0,
    overhang: 0.35,
    verge: 0.15,
    shutters: ["#4F6F5C", "#4D6A82", "#6E5B3E"]
  },
  atlantic: {
    note: "Close-studded timber frames with plaster infill and corner braces, a jettied upper storey on carved joist ends, thick straw thatch with a ridge roll and liggers, leaded casements and brick stacks.",
    wall: "plaster",
    frame: "frame",
    roof: "straw",
    cover: "thatch",
    chimney: "round-pots",
    plinth: "rubble",
    jetty: 0.4,
    overhang: 0.6,
    verge: 0.35
  },
  "northern-wooded": {
    note: "Board-and-batten log-house cladding on a raised rubble footing, reed thatch, crossed gable horns, small shuttered windows and a rough stone chimney.",
    wall: "timber",
    boarding: true,
    chimney: "open-stack",
    roof: "reed",
    cover: "thatch",
    plinth: "rubble",
    jetty: 0,
    overhang: 0.6,
    verge: 0.35,
    shutters: ["#5C4634", "#6A4E36", "#4E3D2E"]
  },
  "northern-urban": {
    note: "Gable-fronted burgher houses: dark frames with St Andrew's crosses under the windows, a jettied front, a loft door with hoist beam, plain-tile roofs and a brick stack.",
    wall: "plaster",
    frame: "northern-frame",
    chimney: "octagonal-pots",
    roof: "urban-tile",
    cover: "tile",
    plinth: "brick",
    jetty: 0.4,
    overhang: 0.3,
    verge: 0.2
  },
  "stone-upland": {
    note: "Coursed rubble ground storey with dressed quoins under a framed upper storey and gable gallery, heavy graded stone-slab roofs with low eaves and massive stone chimneys.",
    wall: "plaster",
    frame: "frame",
    stoneGround: "upland-stone",
    chimney: "stone-cowl",
    roof: "local-stone-roof",
    cover: "stone",
    plinth: "upland-stone",
    jetty: 0,
    overhang: 0.35,
    verge: 0.2,
    shutters: ["#5E4A36", "#6B5741", "#4F4030"]
  }
};
