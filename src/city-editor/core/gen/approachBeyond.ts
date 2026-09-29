import { featureGroupVertices } from "../features";
import { townGates } from "../fortifications";
import type {
  ApproachBeyond,
  ApproachBeyondAssessment,
  ApproachBeyondData,
  BeyondRealmRelation,
  CityDocument,
  EdgeFeatureGroup,
  Point,
  SettlementRole,
  SettlementScale
} from "../types";
import { azimuthDelta, vecToAzimuth } from "./geom";
import { makeRng } from "./prng";
import type { BurgSiteDescriptor } from "./site/burgSiteDescriptor";

export type RealmRelation = BeyondRealmRelation;

export const REALM_RELATIONS: readonly BeyondRealmRelation[] = [
  "domestic",
  "Ally",
  "Friendly",
  "Neutral",
  "Suspicion",
  "Enemy",
  "Rival",
  "Vassal",
  "Suzerain",
  "Unknown"
] as const;

export const REALM_RELATION_LABELS: Record<BeyondRealmRelation, string> = {
  domestic: "自国",
  Ally: "同盟国",
  Friendly: "友好国",
  Neutral: "中立国",
  Suspicion: "警戒国",
  Enemy: "敵国",
  Rival: "対抗国 (ライバル)",
  Vassal: "従属国",
  Suzerain: "宗主国",
  Unknown: "未知の国"
};

export const SETTLEMENT_SCALES: readonly SettlementScale[] = ["hamlet", "village", "town", "city"] as const;

export const SETTLEMENT_SCALE_LABELS: Record<SettlementScale, string> = {
  hamlet: "過疎の村",
  village: "農村",
  town: "町",
  city: "大都市"
};

export const SETTLEMENT_ROLES: readonly SettlementRole[] = [
  "generic",
  "granary",
  "market",
  "fortress",
  "capital"
] as const;

export const SETTLEMENT_ROLE_LABELS: Record<SettlementRole, string> = {
  generic: "一般",
  granary: "食料供給 (穀倉)",
  market: "商業・交易拠点",
  fortress: "軍事要塞",
  capital: "首都・政庁"
};

/** Legacy string values kept for backwards compatibility. */
export const APPROACH_BEYONDS = ["city", "granary", "enemy", "ally", "hamlet"] as const;

export const APPROACH_BEYOND_LABELS: Record<(typeof APPROACH_BEYONDS)[number], string> = {
  city: "大都市",
  granary: "食料を送る農村",
  enemy: "敵国",
  ally: "同盟国",
  hamlet: "過疎の村"
};

/** Normalize legacy string or structured object into ApproachBeyondData. */
export function normalizeApproachBeyond(value: unknown): ApproachBeyondData | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    switch (value) {
      case "city":
        return {
          realm: { relation: "domestic" },
          settlement: { scale: "city", role: "generic", population: 15000, wealth: 70 }
        };
      case "granary":
        return {
          realm: { relation: "domestic" },
          settlement: { scale: "village", role: "granary", population: 800, wealth: 45 }
        };
      case "enemy":
        return {
          realm: { relation: "Enemy" },
          settlement: { scale: "town", role: "fortress", population: 4000, wealth: 50 }
        };
      case "ally":
        return {
          realm: { relation: "Ally" },
          settlement: { scale: "city", role: "market", population: 12000, wealth: 75 }
        };
      case "hamlet":
        return {
          realm: { relation: "domestic" },
          settlement: { scale: "hamlet", role: "generic", population: 150, wealth: 30 }
        };
      default:
        return undefined;
    }
  }
  if (typeof value === "object" && value !== null && "realm" in value && "settlement" in value) {
    const candidate = value as ApproachBeyondData;
    if (candidate.realm && candidate.settlement) return candidate;
  }
  return undefined;
}

export function isApproachBeyond(value: unknown): value is ApproachBeyond {
  if (typeof value === "string") return (APPROACH_BEYONDS as readonly string[]).includes(value);
  return Boolean(normalizeApproachBeyond(value));
}

/** Formatted text for roadside indicator on the map SVG and inspector. */
export function approachBeyondLabel(value: ApproachBeyond | undefined): string | null {
  const norm = normalizeApproachBeyond(value);
  if (!norm) return null;
  if (norm.customLabel) return norm.customLabel;

  const relLabel = REALM_RELATION_LABELS[norm.realm.relation] ?? "他国";
  const scaleText = SETTLEMENT_SCALE_LABELS[norm.settlement.scale] ?? "集落";
  const roleText =
    norm.settlement.role === "granary"
      ? "食料供給"
      : norm.settlement.role === "fortress"
        ? "要塞"
        : norm.settlement.role === "market"
          ? "交易"
          : norm.settlement.role === "capital"
            ? "首都"
            : "";

  const namePart = norm.settlement.name ? `${norm.settlement.name} ` : "";
  const typePart = roleText ? `${roleText}${scaleText}` : scaleText;
  return `${namePart}${typePart}（${relLabel}）`;
}

export interface CurrentCityContext {
  extentMeters?: number;
  population?: number;
  wealth?: number;
  treasury?: number;
  hasWalls?: boolean;
}

/**
 * Evaluates the utility and military defense requirements of the destination
 * compared to the current city.
 */
export function evaluateApproachBeyond(
  value: ApproachBeyond | undefined,
  context?: CurrentCityContext
): ApproachBeyondAssessment | null {
  const norm = normalizeApproachBeyond(value);
  if (!norm) return null;

  const { realm, settlement } = norm;
  const currentPop =
    context?.population ?? Math.max(500, Math.round(((context?.extentMeters ?? 1000) / 100) ** 2 * 30));
  const currentWealth = context?.wealth ?? 50;
  const targetPop =
    settlement.population ??
    (settlement.scale === "city"
      ? 15000
      : settlement.scale === "town"
        ? 4000
        : settlement.scale === "village"
          ? 800
          : 150);
  const targetWealth = settlement.wealth ?? 50;
  const hasWalls = context?.hasWalls ?? true;

  // --- 1. 有用性評価 (Utility) ---
  let relCoeff = 1.0;
  switch (realm.relation) {
    case "domestic":
      relCoeff = 1.0;
      break;
    case "Ally":
      relCoeff = 0.95;
      break;
    case "Friendly":
      relCoeff = 0.9;
      break;
    case "Vassal":
      relCoeff = 0.85;
      break;
    case "Suzerain":
      relCoeff = 0.8;
      break;
    case "Neutral":
      relCoeff = 0.6;
      break;
    case "Unknown":
      relCoeff = 0.4;
      break;
    case "Suspicion":
      relCoeff = 0.25;
      break;
    case "Rival":
      relCoeff = 0.2;
      break;
    case "Enemy":
      relCoeff = 0.05;
      break;
  }

  let roleScore = 20;
  let roleUtilityText = "日常的な交通と往来";
  if (settlement.role === "granary") {
    const foodNeed = currentPop > 2000 ? 50 : 35;
    roleScore = foodNeed;
    roleUtilityText = "都市の消費を支える食料供給地";
  } else if (settlement.role === "market") {
    roleScore = 45;
    roleUtilityText = "高付加価値な交易・商業拠点";
  } else if (settlement.role === "capital") {
    roleScore = 40;
    roleUtilityText = "政庁・中央との重要連絡幹線";
  } else if (settlement.scale === "city") {
    roleScore = 35;
    roleUtilityText = "巨大な消費地・需要先";
  } else if (settlement.scale === "town") {
    roleScore = 25;
    roleUtilityText = "地方都市との定期流通";
  }

  const wealthDiff = targetWealth - currentWealth;
  const wealthFactor = Math.min(30, Math.max(5, Math.round(targetWealth * 0.25 + wealthDiff * 0.1)));
  const rawUtility = Math.min(100, Math.round((roleScore + wealthFactor + 15) * relCoeff));

  let utilityLevel: ApproachBeyondAssessment["utilityLevel"] = "medium";
  let utilityLabel = "普通（適度な交流）";
  if (rawUtility >= 70) {
    utilityLevel = "critical";
    utilityLabel = "生命線（極めて高い）";
  } else if (rawUtility >= 45) {
    utilityLevel = "high";
    utilityLabel = "高い（重要交易路）";
  } else if (rawUtility < 25) {
    utilityLevel = "low";
    utilityLabel = "低い（限定的/交流途絶）";
  }

  let utilityReason = `${roleUtilityText}。`;
  if (realm.relation === "Enemy" || realm.relation === "Rival") {
    utilityReason += `しかし${REALM_RELATION_LABELS[realm.relation]}であるため正規の交易は途絶・制限されています。`;
  } else if (realm.relation === "domestic" || realm.relation === "Ally") {
    utilityReason += `${REALM_RELATION_LABELS[realm.relation]}への道であり、流通や支援が極めて安定しています。`;
  }

  // --- 2. 軍事的備えの必要性 (Defense / Military Preparedness) ---
  let baseThreat = 0;
  switch (realm.relation) {
    case "Enemy":
      baseThreat = 65;
      break;
    case "Rival":
      baseThreat = 45;
      break;
    case "Suspicion":
      baseThreat = 30;
      break;
    case "Unknown":
      baseThreat = 20;
      break;
    case "Neutral":
      baseThreat = 10;
      break;
    case "Suzerain":
      baseThreat = 15;
      break;
    case "Vassal":
      baseThreat = 10;
      break;
    case "Friendly":
      baseThreat = 2;
      break;
    case "Ally":
      baseThreat = 0;
      break;
    case "domestic":
      baseThreat = 2;
      break;
  }

  let settlementThreat = 0;
  if (settlement.role === "fortress") settlementThreat += 25;
  if (settlement.scale === "city") settlementThreat += 15;
  else if (settlement.scale === "town") settlementThreat += 8;

  if (targetPop > currentPop * 2) settlementThreat += 10;

  let wallVulnerability = 0;
  if (!hasWalls && baseThreat >= 25) {
    wallVulnerability = 15;
  }

  const rawDefense = Math.min(
    100,
    Math.round(baseThreat + (baseThreat > 0 ? settlementThreat : 0) + wallVulnerability)
  );

  let defenseLevel: ApproachBeyondAssessment["defenseLevel"] = "safe";
  let defenseLabel = "安全（備え不要）";
  if (rawDefense >= 70) {
    defenseLevel = "critical";
    defenseLabel = "防衛急務（最前線）";
  } else if (rawDefense >= 45) {
    defenseLevel = "high";
    defenseLabel = "要警戒（防備強化推奨）";
  } else if (rawDefense >= 25) {
    defenseLevel = "medium";
    defenseLabel = "通常警戒（関所・見張り）";
  } else if (rawDefense >= 10) {
    defenseLevel = "low";
    defenseLabel = "平穏（軽微な警戒）";
  }

  let defenseReason = "";
  if (defenseLevel === "critical" || defenseLevel === "high") {
    defenseReason = `${REALM_RELATION_LABELS[realm.relation]}の${SETTLEMENT_SCALE_LABELS[settlement.scale]}に直面しており、侵攻や軍事的圧力への厳重な備えが必要です。`;
    if (!hasWalls) defenseReason += "現在城壁が未整備であるため、防壁・門の建設が急務です。";
  } else if (defenseLevel === "medium") {
    defenseReason = `${REALM_RELATION_LABELS[realm.relation]}との境界に位置するため、街道の関所や哨戒体制が推奨されます。`;
  } else {
    defenseReason = `${REALM_RELATION_LABELS[realm.relation]}と隣接しているため直接の軍事的脅威は小さく、後方拠点として平穏です。`;
  }

  const summary = `【有用性: ${utilityLabel}】${utilityReason} 【防備: ${defenseLabel}】${defenseReason}`;

  return {
    utilityScore: rawUtility,
    utilityLevel,
    utilityLabel,
    utilityReason,
    defenseScore: rawDefense,
    defenseLevel,
    defenseLabel,
    defenseReason,
    summary
  };
}

const TEMPLATES: ApproachBeyondData[] = [
  {
    realm: { relation: "domestic" },
    settlement: { scale: "village", role: "granary", population: 900, wealth: 45 }
  },
  {
    realm: { relation: "domestic" },
    settlement: { scale: "hamlet", role: "generic", population: 180, wealth: 25 }
  },
  {
    realm: { relation: "domestic" },
    settlement: { scale: "city", role: "market", population: 18000, wealth: 75 }
  },
  {
    realm: { relation: "Ally" },
    settlement: { scale: "city", role: "market", population: 14000, wealth: 70 }
  },
  {
    realm: { relation: "Friendly" },
    settlement: { scale: "town", role: "generic", population: 3500, wealth: 50 }
  },
  {
    realm: { relation: "Neutral" },
    settlement: { scale: "town", role: "generic", population: 4200, wealth: 48 }
  },
  {
    realm: { relation: "Suspicion" },
    settlement: { scale: "town", role: "fortress", population: 3800, wealth: 45 }
  },
  {
    realm: { relation: "Enemy" },
    settlement: { scale: "town", role: "fortress", population: 5000, wealth: 55 }
  }
];

/** One role per external gate road. Same seed and count always return the same list. */
export function assignApproachBeyonds(
  seed: string,
  count: number,
  _context?: CurrentCityContext
): ApproachBeyondData[] {
  if (count <= 0) return [];
  const rng = makeRng(`${seed}:approach-beyond`);
  const start = rng.int(0, TEMPLATES.length);
  const roles: ApproachBeyondData[] = [];
  for (let i = 0; i < count; i++) {
    const tmpl = TEMPLATES[(start + i) % TEMPLATES.length];
    roles.push(structuredClone(tmpl));
  }
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const swap = roles[i];
    roles[i] = roles[j];
    roles[j] = swap;
  }
  return roles;
}

export interface ExternalGateRoad {
  group: EdgeFeatureGroup;
  outward: Point;
  bearing: number;
}

/** Roads joining an outer gate to the map boundary. Distance from the origin
 * cannot distinguish an interior street from an approach in coastal towns. */
export function externalGateRoads(document: CityDocument): ExternalGateRoad[] {
  const gates = new Set(townGates(document).map(gate => gate.vertexId));
  const found: ExternalGateRoad[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || group.id.startsWith("gc:bridge-")) continue;
    const ids = featureGroupVertices(document, group);
    if (ids.length < 2) continue;
    const start = ids[0];
    const end = ids[ids.length - 1];
    const startIsGate = gates.has(start);
    const endIsGate = gates.has(end);
    if (startIsGate === endIsGate) continue;
    const gateId = startIsGate ? start : end;
    const outId = startIsGate ? end : start;
    const gate = document.mesh.vertices[gateId]?.point;
    const outward = document.mesh.vertices[outId]?.point;
    if (!gate || !outward) continue;
    if (!onMapBoundary(document, outward)) continue;
    const bearing = vecToAzimuth(outward[0], outward[1]);
    found.push({ group, outward, bearing });
  }
  found.sort((a, b) => a.bearing - b.bearing || a.group.id.localeCompare(b.group.id));
  return found;
}

function onMapBoundary(document: CityDocument, point: Point): boolean {
  const half = document.frame.extentMeters / 2;
  return Math.abs(Math.max(Math.abs(point[0]), Math.abs(point[1])) - half) <= 0.05;
}

function beyondFromBurg(burg: NonNullable<BurgSiteDescriptor["roads"][number]["nextBurg"]>): ApproachBeyondData {
  const scale = (burg.scale ?? "town") as SettlementScale;
  const role = (burg.role ?? (burg.capital ? "capital" : "generic")) as SettlementRole;
  return {
    realm: {
      relation: (burg.diplomacyRelation ?? (burg.isDomestic ? "domestic" : "Neutral")) as BeyondRealmRelation,
      stateId: burg.stateId,
      stateName: burg.stateName
    },
    settlement: {
      scale,
      role,
      name: burg.name,
      burgId: burg.id,
      population: burg.population,
      wealth: burg.wealth,
      treasury: burg.treasury,
      distanceMeters: burg.distanceMeters
    }
  };
}

/** Write `beyond` onto external gate roads and clear it from other generated roads. */
export function tagExternalGateRoads(document: CityDocument, seed: string, descriptor?: BurgSiteDescriptor): void {
  const roads = externalGateRoads(document);
  const externalIds = new Set(roads.map(road => road.group.id));
  for (const group of document.featureGroups) {
    if (group.kind === "road" && group.id.startsWith("gc:") && !externalIds.has(group.id)) delete group.beyond;
  }

  const descriptorRoads = descriptor?.roads ?? [];
  const roles = assignApproachBeyonds(seed, roads.length, {
    extentMeters: document.frame.extentMeters,
    hasWalls: document.featureGroups.some(g => g.kind === "wall")
  });

  roads.forEach((road, index) => {
    let matchedNextBurg: BurgSiteDescriptor["roads"][number]["nextBurg"] | null = null;
    if (descriptorRoads.length > 0) {
      let minDiff = 180;
      for (const dRoad of descriptorRoads) {
        if (!dRoad.nextBurg) continue;
        const diff = azimuthDelta(dRoad.entryAzimuthDeg, road.bearing);
        if (diff < minDiff && diff < 60) {
          minDiff = diff;
          matchedNextBurg = dRoad.nextBurg;
        }
      }
    }

    if (matchedNextBurg) {
      road.group.beyond = beyondFromBurg(matchedNextBurg);
    } else {
      road.group.beyond = roles[index];
    }
  });

  // Also tag river-crossing approach roads with their matching beyond descriptor
  for (const group of document.featureGroups) {
    if (group.kind !== "road" || !group.id.startsWith("gc:riverRoad-")) continue;
    const vertices = featureGroupVertices(document, group);
    if (
      ![vertices[0], vertices.at(-1)!].some(id => {
        const point = document.mesh.vertices[id]?.point;
        return point && onMapBoundary(document, point);
      })
    ) {
      delete group.beyond;
      continue;
    }
    const match = group.id.match(/^gc:riverRoad-\d+-(\d+)$/);
    if (match) {
      const pathIndex = Number.parseInt(match[1], 10);
      const dRoad = descriptorRoads[pathIndex];
      if (dRoad?.nextBurg) {
        group.beyond = beyondFromBurg(dRoad.nextBurg);
        continue;
      }
    }
    if (descriptorRoads.length > 0) {
      const ids = featureGroupVertices(document, group);
      const pStart = document.mesh.vertices[ids[0]]?.point;
      const pEnd = document.mesh.vertices[ids.at(-1)!]?.point;
      if (pStart && pEnd) {
        const outward = Math.hypot(pStart[0], pStart[1]) > Math.hypot(pEnd[0], pEnd[1]) ? pStart : pEnd;
        const az = vecToAzimuth(outward[0], outward[1]);
        let minDiff = 180;
        let matched: BurgSiteDescriptor["roads"][number]["nextBurg"] | null = null;
        for (const dRoad of descriptorRoads) {
          if (!dRoad.nextBurg) continue;
          const diff = azimuthDelta(dRoad.entryAzimuthDeg, az);
          if (diff < minDiff && diff < 60) {
            minDiff = diff;
            matched = dRoad.nextBurg;
          }
        }
        if (matched) {
          group.beyond = beyondFromBurg(matched);
        }
      }
    }
  }
}

/** Keep a label inside the frame, on the outer end of the road. */
export function approachBeyondAnchor(outward: Point, halfExtent: number): Point {
  const margin = Math.max(8, halfExtent * 0.06);
  const limit = Math.max(1, halfExtent - margin);
  let [x, y] = outward;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const peak = Math.max(ax, ay);
  if (peak > limit) {
    const scale = limit / peak;
    x *= scale;
    y *= scale;
  }
  return [x, y];
}
