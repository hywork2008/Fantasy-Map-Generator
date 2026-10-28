export type RelationKey =
  | "Ally"
  | "Friendly"
  | "Neutral"
  | "Suspicion"
  | "Enemy"
  | "Unknown"
  | "Rival"
  | "Vassal"
  | "Suzerain";

/** Shared relation presentation used by the Diplomacy Editor and both map renderers. */
export const relations: Record<RelationKey, { inText: string; color: string; tip: string; icon: string }> = {
  Ally: {
    inText: "is an ally of",
    color: "#00b300",
    icon: "★",
    tip: "Allies formed a defensive pact and protect each other in case of third party aggression"
  },
  Friendly: {
    inText: "is friendly to",
    color: "#d4f8aa",
    icon: "♥",
    tip: "State is friendly to anouther state when they share some common interests"
  },
  Neutral: {
    inText: "is neutral to",
    color: "#edeee8",
    icon: "=",
    tip: "Neutral means states relations are neither positive nor negative"
  },
  Suspicion: {
    inText: "is suspicious of",
    color: "#eeafaa",
    icon: "!",
    tip: "Suspicion means state has a cautious distrust of another state"
  },
  Enemy: { inText: "is at war with", color: "#e64b40", icon: "⚔", tip: "Enemies are states at war with each other" },
  Unknown: {
    inText: "does not know about",
    color: "#a9a9a9",
    icon: "?",
    tip: "Relations are unknown if states do not have enough information about each other"
  },
  Rival: {
    inText: "is a rival of",
    color: "#ad5a1f",
    icon: "✕",
    tip: "Rivalry is a state of competing for dominance in the region"
  },
  Vassal: {
    inText: "is a vassal of",
    color: "#87CEFA",
    icon: "▼",
    tip: "Vassal is a state having obligation to its suzerain"
  },
  Suzerain: {
    inText: "is suzerain to",
    color: "#00008B",
    icon: "♛",
    tip: "Suzerain is a state having some control over its vassals"
  }
};
