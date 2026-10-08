import type { CastlePlan, CityDocument, HistoricalPeriod } from "../core/types";

export type CastleStyle =
  | "classic" // Traditional original single-style castle (simple keep & halls with access roads)
  | "norman-keep" // High medieval Norman/Romanesque square keep & hall
  | "motte-bailey" // Early medieval timber/stone motte with earthen slopes & palisade
  | "concentric" // Late medieval concentric fortress with round drum towers & double wards
  | "bastion-citadel" // Early modern Renaissance trace-italienne bastion & barracks
  | "japanese-shiro" // East Asian / Japanese castle with curved stone ramparts (tenshu-dai) & multi-gable roofs
  | "islamic-qalat" // Middle Eastern / Moorish fortress with sand-stone towers, patio cistern & pointed merlons
  | "ancient-castra"; // Classical antiquity Roman castra / Greek acropolis with colonnades & rectangular redoubts

export interface CastlePalette {
  groundFill: string;
  groundStroke: string;
  courtFill: string;
  courtStroke: string;
  pathStroke: string;
  keepWall: string;
  keepStroke: string;
  keepRoof: string;
  keepAccent: string;
  rangeWall: string;
  rangeStroke: string;
  rangeRoof: string;
  serviceWall: string;
  serviceStroke: string;
  chapelWall: string;
  chapelStroke: string;
  rampartFill: string;
  rampartStroke: string;
}

export interface CastleStyleProfile {
  style: CastleStyle;
  label: string;
  palette: CastlePalette;
  keepFeatures: {
    turretType: "square" | "round" | "tenshu_corner" | "none";
    hasButtresses: boolean;
    hasRampartBase: boolean;
    roofStyle: "crenellated_open" | "timber_deck" | "round_conical" | "tenshu_gables" | "pitched_tile" | "flat_dome";
    hasArrowSlits: boolean;
  };
  rangeFeatures: {
    roofStyle: "gable" | "hip" | "tenshu_shoin" | "flat_parapet" | "pitched_tile";
    hasChimneys: boolean;
    hasArcade: boolean;
  };
  courtFeatures: {
    texture: "flagstones" | "packed_dirt" | "white_gravel" | "geometric_patio" | "parade_ground";
    hasWell: boolean;
    hasFountainPool: boolean;
    hasGardenTrees: boolean;
    hasMotteHatching: boolean;
  };
}

export const CASTLE_STYLE_PROFILES: Record<CastleStyle, CastleStyleProfile> = {
  classic: {
    style: "classic",
    label: "従来の標準城郭 (クラシック)",
    palette: {
      groundFill: "#d5cfbf",
      groundStroke: "#a7977f",
      courtFill: "#d8cdb6",
      courtStroke: "#a7977f",
      pathStroke: "#b7a78e",
      keepWall: "#827364",
      keepStroke: "#4f463c",
      keepRoof: "#4f463c",
      keepAccent: "#e2d5be",
      rangeWall: "#a49380",
      rangeStroke: "#4f463c",
      rangeRoof: "#4f463c",
      serviceWall: "#a49380",
      serviceStroke: "#4f463c",
      chapelWall: "#a49380",
      chapelStroke: "#4f463c",
      rampartFill: "#d5cfbf",
      rampartStroke: "#a7977f"
    },
    keepFeatures: {
      turretType: "none",
      hasButtresses: false,
      hasRampartBase: false,
      roofStyle: "crenellated_open",
      hasArrowSlits: false
    },
    rangeFeatures: {
      roofStyle: "gable",
      hasChimneys: false,
      hasArcade: false
    },
    courtFeatures: {
      texture: "packed_dirt",
      hasWell: false,
      hasFountainPool: false,
      hasGardenTrees: false,
      hasMotteHatching: false
    }
  },
  "norman-keep": {
    style: "norman-keep",
    label: "ノルマン方形主塔城郭 (High Medieval)",
    palette: {
      groundFill: "#dcd6c8",
      groundStroke: "#9f9382",
      courtFill: "#d5cbb8",
      courtStroke: "#b0a38f",
      pathStroke: "#bdae97",
      keepWall: "#63594e",
      keepStroke: "#383129",
      keepRoof: "#4a4239",
      keepAccent: "#84776a",
      rangeWall: "#847565",
      rangeStroke: "#483e35",
      rangeRoof: "#5e4b3e",
      serviceWall: "#988b7b",
      serviceStroke: "#5b5043",
      chapelWall: "#73675a",
      chapelStroke: "#413930",
      rampartFill: "#8a7f72",
      rampartStroke: "#4c4339"
    },
    keepFeatures: {
      turretType: "square",
      hasButtresses: true,
      hasRampartBase: false,
      roofStyle: "crenellated_open",
      hasArrowSlits: true
    },
    rangeFeatures: {
      roofStyle: "gable",
      hasChimneys: true,
      hasArcade: false
    },
    courtFeatures: {
      texture: "flagstones",
      hasWell: true,
      hasFountainPool: false,
      hasGardenTrees: false,
      hasMotteHatching: false
    }
  },
  "motte-bailey": {
    style: "motte-bailey",
    label: "モット・アンド・ベイリー (Early Medieval)",
    palette: {
      groundFill: "#c9be9f",
      groundStroke: "#8a7c5c",
      courtFill: "#c8baa0",
      courtStroke: "#9e8b6b",
      pathStroke: "#a89674",
      keepWall: "#59432d",
      keepStroke: "#362617",
      keepRoof: "#75593c",
      keepAccent: "#412f1f",
      rangeWall: "#785f46",
      rangeStroke: "#423223",
      rangeRoof: "#5c4834",
      serviceWall: "#876f55",
      serviceStroke: "#4e3d2c",
      chapelWall: "#6d5843",
      chapelStroke: "#3d2f21",
      rampartFill: "#8a7550",
      rampartStroke: "#524328"
    },
    keepFeatures: {
      turretType: "none",
      hasButtresses: false,
      hasRampartBase: true,
      roofStyle: "timber_deck",
      hasArrowSlits: false
    },
    rangeFeatures: {
      roofStyle: "hip",
      hasChimneys: false,
      hasArcade: false
    },
    courtFeatures: {
      texture: "packed_dirt",
      hasWell: true,
      hasFountainPool: false,
      hasGardenTrees: false,
      hasMotteHatching: true
    }
  },
  concentric: {
    style: "concentric",
    label: "同心円・円塔囲郭城塞 (Late Medieval)",
    palette: {
      groundFill: "#dbd5c5",
      groundStroke: "#9d927f",
      courtFill: "#cfc6b3",
      courtStroke: "#a49984",
      pathStroke: "#b8ac95",
      keepWall: "#58524a",
      keepStroke: "#2c2823",
      keepRoof: "#3f3b35",
      keepAccent: "#726b61",
      rangeWall: "#7a7267",
      rangeStroke: "#453f37",
      rangeRoof: "#54463d",
      serviceWall: "#8f867a",
      serviceStroke: "#534c43",
      chapelWall: "#696359",
      chapelStroke: "#3a362f",
      rampartFill: "#857e74",
      rampartStroke: "#454039"
    },
    keepFeatures: {
      turretType: "round",
      hasButtresses: false,
      hasRampartBase: false,
      roofStyle: "round_conical",
      hasArrowSlits: true
    },
    rangeFeatures: {
      roofStyle: "gable",
      hasChimneys: true,
      hasArcade: true
    },
    courtFeatures: {
      texture: "flagstones",
      hasWell: true,
      hasFountainPool: false,
      hasGardenTrees: false,
      hasMotteHatching: false
    }
  },
  "bastion-citadel": {
    style: "bastion-citadel",
    label: "近世星形要塞・城塞 (Early Modern)",
    palette: {
      groundFill: "#ded8cc",
      groundStroke: "#9c9383",
      courtFill: "#d2cbbe",
      courtStroke: "#a2998a",
      pathStroke: "#bcb2a1",
      keepWall: "#6e665d",
      keepStroke: "#3a342e",
      keepRoof: "#4a535c",
      keepAccent: "#887f75",
      rangeWall: "#8e867b",
      rangeStroke: "#4c463e",
      rangeRoof: "#5d6a78",
      serviceWall: "#9f978c",
      serviceStroke: "#59534a",
      chapelWall: "#7d756b",
      chapelStroke: "#433d36",
      rampartFill: "#828c7c",
      rampartStroke: "#4a5744"
    },
    keepFeatures: {
      turretType: "none",
      hasButtresses: false,
      hasRampartBase: true,
      roofStyle: "flat_dome",
      hasArrowSlits: true
    },
    rangeFeatures: {
      roofStyle: "hip",
      hasChimneys: true,
      hasArcade: false
    },
    courtFeatures: {
      texture: "parade_ground",
      hasWell: false,
      hasFountainPool: true,
      hasGardenTrees: true,
      hasMotteHatching: false
    }
  },
  "japanese-shiro": {
    style: "japanese-shiro",
    label: "日本式城郭・天守曲輪 (East Asian)",
    palette: {
      groundFill: "#ece6d8",
      groundStroke: "#a29b8a",
      courtFill: "#dfd8c7",
      courtStroke: "#b0a896",
      pathStroke: "#c2baa8",
      keepWall: "#2b2a29",
      keepStroke: "#151413",
      keepRoof: "#363a40",
      keepAccent: "#e6e5e0",
      rangeWall: "#463f38",
      rangeStroke: "#241f1a",
      rangeRoof: "#3d4249",
      serviceWall: "#63594e",
      serviceStroke: "#362e26",
      chapelWall: "#8c3b31",
      chapelStroke: "#4f1e18",
      rampartFill: "#706d66",
      rampartStroke: "#3e3b36"
    },
    keepFeatures: {
      turretType: "tenshu_corner",
      hasButtresses: false,
      hasRampartBase: true,
      roofStyle: "tenshu_gables",
      hasArrowSlits: true
    },
    rangeFeatures: {
      roofStyle: "tenshu_shoin",
      hasChimneys: false,
      hasArcade: false
    },
    courtFeatures: {
      texture: "white_gravel",
      hasWell: true,
      hasFountainPool: false,
      hasGardenTrees: true,
      hasMotteHatching: false
    }
  },
  "islamic-qalat": {
    style: "islamic-qalat",
    label: "イスラム要塞宮殿・カラート (Middle Eastern / Moorish)",
    palette: {
      groundFill: "#e4dac2",
      groundStroke: "#9e8e6b",
      courtFill: "#dcceb0",
      courtStroke: "#b5a381",
      pathStroke: "#c4b491",
      keepWall: "#877457",
      keepStroke: "#493d2b",
      keepRoof: "#9c8766",
      keepAccent: "#b5a17e",
      rangeWall: "#9f8c6e",
      rangeStroke: "#584b37",
      rangeRoof: "#7b5e43",
      serviceWall: "#ad9b7e",
      serviceStroke: "#635641",
      chapelWall: "#8c795b",
      chapelStroke: "#4d412e",
      rampartFill: "#998667",
      rampartStroke: "#574a35"
    },
    keepFeatures: {
      turretType: "square",
      hasButtresses: true,
      hasRampartBase: false,
      roofStyle: "flat_dome",
      hasArrowSlits: true
    },
    rangeFeatures: {
      roofStyle: "flat_parapet",
      hasChimneys: false,
      hasArcade: true
    },
    courtFeatures: {
      texture: "geometric_patio",
      hasWell: false,
      hasFountainPool: true,
      hasGardenTrees: true,
      hasMotteHatching: false
    }
  },
  "ancient-castra": {
    style: "ancient-castra",
    label: "古代要塞・カストラ / アクロポリス (Classical Antiquity)",
    palette: {
      groundFill: "#ded4be",
      groundStroke: "#9b8c6e",
      courtFill: "#d4c8ad",
      courtStroke: "#ad9f80",
      pathStroke: "#c0b293",
      keepWall: "#73644f",
      keepStroke: "#3d3427",
      keepRoof: "#875a40",
      keepAccent: "#96856d",
      rangeWall: "#8c7d67",
      rangeStroke: "#4d4233",
      rangeRoof: "#946348",
      serviceWall: "#9e907a",
      serviceStroke: "#5b5042",
      chapelWall: "#877760",
      chapelStroke: "#473d2f",
      rampartFill: "#827561",
      rampartStroke: "#473f32"
    },
    keepFeatures: {
      turretType: "square",
      hasButtresses: true,
      hasRampartBase: false,
      roofStyle: "pitched_tile",
      hasArrowSlits: false
    },
    rangeFeatures: {
      roofStyle: "pitched_tile",
      hasChimneys: false,
      hasArcade: true
    },
    courtFeatures: {
      texture: "flagstones",
      hasWell: true,
      hasFountainPool: false,
      hasGardenTrees: false,
      hasMotteHatching: false
    }
  }
};

/**
 * Resolves the appropriate castle style based on historicalPeriod, culture/burialProfile, and optional overrides.
 */
export function resolveCastleStyle(document: CityDocument, castle?: CastlePlan | null): CastleStyleProfile {
  // If the castle has an explicit style recorded, honor it
  const explicit = (castle as unknown as { castleStyle?: CastleStyle })?.castleStyle;
  if (explicit && CASTLE_STYLE_PROFILES[explicit]) {
    return CASTLE_STYLE_PROFILES[explicit];
  }

  // Check culture traits via burialProfile or metadata
  const profileId = document.burialProfile?.id?.toLowerCase() ?? "";
  const sanctuary = document.burialProfile?.sanctuary;
  const vegetation = document.burialProfile?.vegetation;

  // 1. Japanese / East Asian indicators
  if (
    profileId.includes("shinto") ||
    profileId.includes("torii") ||
    profileId.includes("edo") ||
    sanctuary === "ancestral_hall" ||
    vegetation === "oriental_evergreen"
  ) {
    return CASTLE_STYLE_PROFILES["japanese-shiro"];
  }

  // 2. Middle Eastern / Islamic indicators
  if (
    profileId.includes("sunni") ||
    profileId.includes("islam") ||
    profileId.includes("moorish") ||
    profileId.includes("turbe") ||
    sanctuary === "mausoleum_dome" ||
    vegetation === "mediterranean_cypress"
  ) {
    return CASTLE_STYLE_PROFILES["islamic-qalat"];
  }

  // 3. Historical period mapping
  const period: HistoricalPeriod = document.historicalPeriod ?? "highMedieval";

  switch (period) {
    case "classicalAntiquity":
      return CASTLE_STYLE_PROFILES["ancient-castra"];
    case "earlyMedieval":
      return CASTLE_STYLE_PROFILES["motte-bailey"];
    case "highMedieval":
      return CASTLE_STYLE_PROFILES["norman-keep"];
    case "lateMedieval":
      return CASTLE_STYLE_PROFILES["concentric"];
    case "ageOfExploration":
    case "maritimeEra":
    case "preIndustrialEra":
    case "steamEra":
    case "industrialChemistryEra":
    case "petroleumEra":
    case "rocketryEra":
      return CASTLE_STYLE_PROFILES["bastion-citadel"];
    default:
      return CASTLE_STYLE_PROFILES["norman-keep"];
  }
}
