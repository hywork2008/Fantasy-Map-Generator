import type { Burg, State } from "../types/models";
import { getAdjective, trimVowels } from "../utils";

export interface WarCasusBelliContext {
  attacker: State;
  defender: State;
  attackerReligionName?: string;
  defenderReligionName?: string;
  attackerCultureName?: string;
  defenderCultureName?: string;
  warCount: number;
  targetBurg?: Burg;
  rng?: () => number;
}

export type CasusBelliCategory = "feud" | "religious" | "succession" | "trade" | "raiding" | "territorial";

export interface WarCasusBelli {
  category: CasusBelliCategory;
  action: string;
  reason: string;
  rawText: string;
  warName: string;
}

const romanize = (num: number): string => {
  const lookup: { [key: string]: number } = {
    M: 1000,
    CM: 900,
    D: 500,
    CD: 400,
    C: 100,
    XC: 90,
    L: 50,
    XL: 40,
    X: 10,
    IX: 9,
    V: 5,
    IV: 4,
    I: 1
  };
  let roman = "";
  for (const i in lookup) {
    while (num >= lookup[i]) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
};

interface CasusBelliDefinition {
  category: CasusBelliCategory;
  action: string;
  reasons: string[];
  generateWarName: (an: string, dn: string, count: number, targetBurg?: Burg) => string;
}

const CASUS_BELLI_DEFINITIONS: Record<CasusBelliCategory, CasusBelliDefinition> = {
  feud: {
    category: "feud",
    action: "declared a war of vengeance on its rival",
    reasons: [
      "to avenge bitter defeats and casualties suffered in the previous war",
      "reigniting the ancient blood feud between the two realms",
      "seeking righteous retribution for historic grievances and broken treaties",
      "vowing to settle generation-long border hostilities once and for all"
    ],
    generateWarName: (an, dn, count) => {
      const baseName = `The ${an}-${trimVowels(dn)}ian War`;
      return count > 1 ? `${baseName} ${romanize(count)}` : `The ${getAdjective(an)} War of Retribution`;
    }
  },
  religious: {
    category: "religious",
    action: "declared a holy war on its rival",
    reasons: [
      "launching a sacred crusade to cleanse heretical practices",
      "proclaiming a holy war to liberate historic holy sanctuaries from infidels",
      "responding to the righteous outcry over the persecution of co-religionists across the border",
      "sanctioned by divine authorities to suppress heathen teachings"
    ],
    generateWarName: (an, _dn, count, targetBurg) => {
      if (targetBurg?.name) return `The Crusade for ${targetBurg.name}`;
      const adj = getAdjective(an);
      return count > 1 ? `The ${adj} Crusade ${romanize(count)}` : `The ${adj} Holy War`;
    }
  },
  succession: {
    category: "succession",
    action: "declared a war of succession on its rival",
    reasons: [
      "pressing a disputed dynastic claim to the crown through royal lineage",
      "contesting the legitimacy of the succession following the demise of the monarch",
      "championing an exiled claimant to the royal throne against the ruling house",
      "retaliating against an egregious diplomatic insult following a severed royal betrothal"
    ],
    generateWarName: (_an, dn, count) => {
      const adj = getAdjective(dn);
      return count > 1
        ? `The ${count === 2 ? "Second" : count === 3 ? "Third" : romanize(count)} War of the ${adj} Succession`
        : `The War of the ${adj} Succession`;
    }
  },
  trade: {
    category: "trade",
    action: "declared a trade war on its rival",
    reasons: [
      "following fierce disputes over lucrative maritime trade routes and naval blockades",
      "after extortionate river transit tolls and retaliatory merchant embargoes were enforced",
      "demanding unhindered merchant access and commercial privileges in key maritime ports",
      "challenging rival dominance over lucrative merchant lanes and trade monopolies"
    ],
    generateWarName: (an, dn, count) => {
      return count > 1 ? `The ${an}-${dn} Trade War ${romanize(count)}` : `The ${an}-${dn} Trade War`;
    }
  },
  raiding: {
    category: "raiding",
    action: "launched a grand campaign of conquest on its rival",
    reasons: [
      "launching a devastating seasonal campaign for plunder, grain stores, and captives",
      "seeking vital fertile pastures and grazing grounds across the border",
      "conducting an aggressive expansion to pillage wealthy border settlements",
      "pressing into agrarian heartlands driven by resource scarcity and nomadic ambition"
    ],
    generateWarName: (an, _dn, count) => {
      const adj = getAdjective(an);
      return count > 1 ? `The ${adj} Incursion ${romanize(count)}` : `The Great ${adj} Incursion`;
    }
  },
  territorial: {
    category: "territorial",
    action: "declared a war of conquest on its rival",
    reasons: [
      "claiming disputed fertile borderlands along the contested frontier",
      "launching a pre-emptive strike to seize vital border passes and defensible strongholds",
      "demanding the restitution of ancestral border provinces",
      "contesting strategic river crossings and frontier fortifications",
      "seeking territorial expansion to counterbalance growing rival hegemony"
    ],
    generateWarName: (an, dn, count, targetBurg) => {
      if (targetBurg?.name && count === 1 && Math.random() < 0.3) {
        return `The War for ${targetBurg.name}`;
      }
      const baseName = `The ${an}-${trimVowels(dn)}ian War`;
      return count > 1 ? `${baseName} ${romanize(count)}` : baseName;
    }
  }
};

/**
 * Chooses an authentic ancient/medieval casus belli based on state properties,
 * geography, governance, religion, and war history.
 */
export function generateWarCasusBelli(context: WarCasusBelliContext): WarCasusBelli {
  const {
    attacker,
    defender,
    attackerReligionName,
    defenderReligionName,
    warCount,
    targetBurg,
    rng = Math.random
  } = context;

  const an = attacker.name;
  const dn = defender.name;

  // Weight scores for each category
  const weights: Record<CasusBelliCategory, number> = {
    feud: 0,
    religious: 0,
    succession: 0,
    trade: 0,
    raiding: 0,
    territorial: 10 // Baseline default
  };

  // 1. Feud / Retribution: strongly favored if states have fought before
  if (warCount > 1) {
    weights.feud += 30 + Math.min(warCount * 10, 40);
  }

  // 2. Religious: different religions or theocratic states
  const differentReligion =
    attackerReligionName && defenderReligionName && attackerReligionName !== defenderReligionName;
  const attackerIsTheocracy = attacker.form === "Theocracy" || attacker.formName?.includes("Holy");
  const defenderIsTheocracy = defender.form === "Theocracy" || defender.formName?.includes("Holy");

  if (differentReligion) {
    weights.religious += 25;
    if (attackerIsTheocracy || defenderIsTheocracy) {
      weights.religious += 40;
    }
  } else if (attackerIsTheocracy) {
    // Holy state expanding or purging internal heterodoxy
    weights.religious += 15;
  }

  // 3. Dynastic / Succession: Monarchies / Feudal realms (excluding nomadic hordes)
  const isRaidingCulture = (s: State) => s.type === "Nomadic" || s.type === "Hunting" || s.formName?.includes("Horde");

  const isMonarchy = (s: State) =>
    !isRaidingCulture(s) &&
    (s.form === "Monarchy" || ["Kingdom", "Empire", "Duchy", "Grand Duchy", "Principality"].includes(s.formName ?? ""));

  if (isMonarchy(attacker) && isMonarchy(defender)) {
    weights.succession += 30;
  } else if (isMonarchy(attacker)) {
    weights.succession += 10;
  }

  // 4. Trade / Maritime: Naval states, republics, maritime trade powers
  const isMaritimeOrMerchant = (s: State) =>
    s.type === "Naval" ||
    s.form === "Republic" ||
    s.formName?.includes("Republic") ||
    s.formName?.includes("League") ||
    s.formName?.includes("Trade");

  if (isMaritimeOrMerchant(attacker) || isMaritimeOrMerchant(defender)) {
    weights.trade += 30;
    if (isMaritimeOrMerchant(attacker) && isMaritimeOrMerchant(defender)) {
      weights.trade += 25;
    }
  }

  // 5. Raiding / Nomad incursion: Nomadic, Horde, Hunting cultures
  if (isRaidingCulture(attacker)) {
    weights.raiding += 60;
  }

  // Pick category by weighted random
  let totalWeight = 0;
  for (const w of Object.values(weights)) totalWeight += w;

  let roll = rng() * totalWeight;
  let selectedCategory: CasusBelliCategory = "territorial";

  for (const [cat, w] of Object.entries(weights) as [CasusBelliCategory, number][]) {
    roll -= w;
    if (roll <= 0) {
      selectedCategory = cat;
      break;
    }
  }

  const def = CASUS_BELLI_DEFINITIONS[selectedCategory];
  const reasonIdx = Math.floor(rng() * def.reasons.length);
  const reason = def.reasons[reasonIdx];
  const warName = def.generateWarName(an, dn, warCount, targetBurg);
  const rawText = `${an} ${def.action} ${dn}, ${reason}`;

  return {
    category: selectedCategory,
    action: def.action,
    reason,
    rawText,
    warName
  };
}
