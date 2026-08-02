import type { InnClass, LodgingStyle } from "./innFacilityTypes";

export type InnPresentation = {
  label: string;
  sceneCue: string;
};

type LodgingStylePresentation = {
  label: string;
  description: string;
  facilities: Readonly<Record<InnClass, InnPresentation>>;
};

/**
 * Read-only names and scene cues for a future city-detail renderer. The simulation stores only
 * InnClass, ensuring that a visual style switch cannot change lodging capacity or demand.
 */
export const LODGING_STYLE_PRESENTATIONS: Readonly<Record<LodgingStyle, LodgingStylePresentation>> = {
  medievalCentralEuropean: {
    label: "Medieval Central European",
    description: "Steep roofs, painted hanging signs, enclosed yards, and practical stabling.",
    facilities: {
      wayside: { label: "Wayside Inn", sceneCue: "road sign and covered hitching rail" },
      market: { label: "Market Inn", sceneCue: "street-front hall and shared yard" },
      waterside: { label: "Quay Inn", sceneCue: "loading doors and riverside storehouse" },
      grand: { label: "Great Inn", sceneCue: "deep courtyard and ornate hanging sign" },
      caravanserai: { label: "Caravanserai", sceneCue: "enclosed court and animal sheds" }
    }
  },
  highFantasy: {
    label: "High fantasy",
    description: "Broad common rooms, heraldic signs, lantern light, and storybook courtyards.",
    facilities: {
      wayside: { label: "Trail Rest", sceneCue: "lantern post and quest notice board" },
      market: { label: "Wayfarers' Rest", sceneCue: "heraldic sign and bustling common room" },
      waterside: { label: "Sailor's Lantern", sceneCue: "pier lanterns and cargo loft" },
      grand: { label: "Crown & Compass", sceneCue: "bannered court and carriage arch" },
      caravanserai: { label: "Caravan Court", sceneCue: "guarded court and pack-animal arcade" }
    }
  },
  jrpg: {
    label: "JRPG",
    description: "Friendly town landmarks with bright signs, tidy forecourts, and clear traveller cues.",
    facilities: {
      wayside: { label: "Traveler's Lodge", sceneCue: "warm window light and tidy hitching post" },
      market: { label: "Town Inn", sceneCue: "bright signboard and flowered forecourt" },
      waterside: { label: "Harbor Inn", sceneCue: "blue awning and dockside crates" },
      grand: { label: "Grand Inn", sceneCue: "wide entrance and welcoming notice board" },
      caravanserai: { label: "Caravan Rest", sceneCue: "sunlit court and covered wagon bays" }
    }
  }
};

export function getLodgingStylePresentation(style: LodgingStyle): LodgingStylePresentation {
  return LODGING_STYLE_PRESENTATIONS[style];
}

export function getInnPresentation(innClass: InnClass, style: LodgingStyle): InnPresentation {
  return LODGING_STYLE_PRESENTATIONS[style].facilities[innClass];
}
