/**
 * Lightweight dynasty / house assignment (Phase E).
 */

import { P, rand } from "../hostUtils";
import { inferRoleClass } from "./backstoryProfile";
import type { Character, Dynasty } from "./characterTypes";

const MOTTOS = [
  "By blood and iron",
  "Faith before fortune",
  "We endure",
  "Honor binds us",
  "The river remembers",
  "Gold is quieter than steel",
  "No crown without duty",
  "Shadows serve the light",
  "From stone, a name",
  "Trade opens every gate"
];

export function deriveHouseName(character: Character, stateName?: string): string {
  const parts = character.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1]!;
    return `House ${surname}`;
  }
  if (stateName) return `House of ${stateName}`;
  return `House ${parts[0] ?? "Nameless"}`;
}

function shouldFoundDynasty(character: Character): boolean {
  const origin = character.backstory?.origin;
  if (!origin) return false;
  const role = inferRoleClass(character);
  const s = origin.socialStratum;

  if (role === "ruler") return true;
  if (role === "province_lord" && (s === "royal" || s === "high_noble" || s === "minor_noble")) return true;
  if (role === "central_officer" && (s === "royal" || s === "high_noble") && P(0.55)) return true;
  if (role === "merchant" && s === "merchant_born" && character.prestige >= 55 && P(0.35)) return true;
  if ((s === "royal" || s === "high_noble") && P(0.4)) return true;
  return false;
}

function pickMotto(character: Character): string | undefined {
  if (!P(0.45)) return undefined;
  const primary = character.backstory?.commitment.primary.kind;
  if (primary === "faith") return "Faith before fortune";
  if (primary === "wealth" || primary === "craft") return "Gold is quieter than steel";
  if (primary === "house" || primary === "family") return "By blood and iron";
  if (primary === "state" || primary === "liege") return "No crown without duty";
  if (primary === "comrades") return "We endure";
  return MOTTOS[rand(0, MOTTOS.length - 1)];
}

export interface AssignDynastiesContext {
  /** stateId → display name */
  stateNames: Record<number, string>;
}

/**
 * Create dynasty records for eligible characters and set lineageId/lineageName.
 * Officers without their own house may join the ruler's dynasty of the same state.
 */
export function assignDynasties(characters: Character[], context: AssignDynastiesContext): Dynasty[] {
  const dynasties: Dynasty[] = [];
  let nextId = 1;

  // stateId → ruler dynasty id
  const rulerDynastyByState = new Map<number, number>();

  // Pass 1: founders
  for (const character of characters) {
    if (character.dead || !character.backstory) continue;
    if (!shouldFoundDynasty(character)) continue;

    const stateName = context.stateNames[character.state];
    const dynasty: Dynasty = {
      i: nextId++,
      name: deriveHouseName(character, stateName),
      culture: character.culture,
      stateId: character.state || undefined,
      founderBurgId: character.backstory.origin.homeBurgId ?? character.backstory.origin.birthBurgId,
      founderCharacterId: character.i,
      motto: pickMotto(character)
    };
    dynasties.push(dynasty);
    character.backstory.origin.lineageId = dynasty.i;
    character.backstory.origin.lineageName = dynasty.name;

    if (inferRoleClass(character) === "ruler" && character.state) {
      rulerDynastyByState.set(character.state, dynasty.i);
    }
  }

  // Pass 2: minor nobles / court officers join ruling house sometimes
  for (const character of characters) {
    if (character.dead || !character.backstory) continue;
    if (character.backstory.origin.lineageId !== undefined) continue;

    const s = character.backstory.origin.socialStratum;
    const role = inferRoleClass(character);
    const rulingId = rulerDynastyByState.get(character.state);
    if (
      rulingId !== undefined &&
      (s === "royal" || s === "high_noble" || s === "minor_noble") &&
      (role === "central_officer" || role === "commander" || role === "religious") &&
      P(0.35)
    ) {
      const house = dynasties.find(d => d.i === rulingId);
      if (house) {
        character.backstory.origin.lineageId = house.i;
        character.backstory.origin.lineageName = house.name;
      }
    }
  }

  return dynasties;
}

export function getDynasty(dynasties: Dynasty[] | undefined, id: number | undefined): Dynasty | undefined {
  if (id === undefined || !dynasties?.length) return undefined;
  return dynasties.find(d => d.i === id);
}
