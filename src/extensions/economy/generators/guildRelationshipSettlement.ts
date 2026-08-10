import { adjustSolidarity, getSolidarity, setSolidarity } from "../../characters/backstoryProfile";
import type { Character } from "../../characters/characterTypes";
import {
  assessTasteRelationship,
  projectTasteRelationshipDelta,
  type TasteRelationshipObserverRole
} from "../../characters/tasteRelationship";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

const INITIAL_CONTACT_SCORE = 4;
const INITIAL_MAX_POSITIVE_DELTA = 8;
const INITIAL_MAX_NEGATIVE_DELTA = 12;
const ANNUAL_MAX_POSITIVE_DELTA = 3;
const ANNUAL_MAX_NEGATIVE_DELTA = 5;

function mentorshipTasteIds(domain: CraftKnowledgeDomain): readonly string[] {
  if (domain === "metallurgy") return ["machinery", "debate", "company", "solitude"];
  return ["debate", "company", "solitude"];
}

function applyTasteDelta(
  observer: Character,
  counterpart: Character,
  domain: CraftKnowledgeDomain,
  observerRole: TasteRelationshipObserverRole,
  maxPositive: number,
  maxNegative: number
): number {
  const assessment = assessTasteRelationship(observer, counterpart, {
    situation: "mentorship",
    exposedTasteIds: mentorshipTasteIds(domain),
    exposure: 0.75,
    observerRole
  });
  const delta = projectTasteRelationshipDelta(assessment, {
    maxPositive,
    maxNegative,
    currentScore: getSolidarity(observer, counterpart.i)
  });
  return delta === 0 ? getSolidarity(observer, counterpart.i) : adjustSolidarity(observer, counterpart.i, delta);
}

function seedDirection(
  observer: Character,
  counterpart: Character,
  domain: CraftKnowledgeDomain,
  observerRole: TasteRelationshipObserverRole
): number {
  if (getSolidarity(observer, counterpart.i) !== 0) return getSolidarity(observer, counterpart.i);

  // Daily work creates a real, but deliberately sub-collegial, contact edge.
  setSolidarity(observer, counterpart.i, INITIAL_CONTACT_SCORE);
  return applyTasteDelta(
    observer,
    counterpart,
    domain,
    observerRole,
    INITIAL_MAX_POSITIVE_DELTA,
    INITIAL_MAX_NEGATIVE_DELTA
  );
}

/** Seed a master–apprentice relationship without replacing a pre-existing sentiment. */
export function seedMasterApprenticeTasteRelationship(
  master: Character,
  apprentice: Character,
  domain: CraftKnowledgeDomain
): void {
  if (master.dead || apprentice.dead || master.i === apprentice.i) return;
  seedDirection(master, apprentice, domain, "mentor");
  seedDirection(apprentice, master, domain, "apprentice");
}

/** Apply the small annual taste drift for every active apprentice of one master. */
export function settleMasterApprenticeTasteRelationships(
  master: Character,
  apprentices: readonly Character[],
  domain: CraftKnowledgeDomain
): void {
  if (master.dead) return;
  for (const apprentice of apprentices) {
    if (apprentice.dead || apprentice.i === master.i) continue;
    applyTasteDelta(master, apprentice, domain, "mentor", ANNUAL_MAX_POSITIVE_DELTA, ANNUAL_MAX_NEGATIVE_DELTA);
    applyTasteDelta(apprentice, master, domain, "apprentice", ANNUAL_MAX_POSITIVE_DELTA, ANNUAL_MAX_NEGATIVE_DELTA);
  }
}
