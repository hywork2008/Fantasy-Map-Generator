/**
 * Persistent player technology-bias records on the economy slice.
 * Derived contribution scratchpads are not saved
 * (docs/plan/player-character-technology-bias.md PR-1).
 */

export interface ResearchNamedSeat {
  burgId: number;
  characterId: number;
  role: "workshopResearcher" | "trialMachinist" | "mineLaborer";
  mineOperationId?: number;
}

export interface ResearchHireApplication {
  i: number;
  burgId: number;
  role: ResearchNamedSeat["role"];
  characterId: number;
  daysRemaining: number;
  mineOperationId?: number;
}

export interface TechnologyInstructMission {
  characterId: number;
  burgId: number;
  stateId: number;
  kind: "teach" | "copy";
  daysRemaining: number;
  technologyIds: string[];
}

export interface InstructionResidue {
  burgId: number;
  domain: string;
  stock: number; // 0..1
  sourceCharacterId: number;
  lastPulseYear: number;
}

export interface TechnologyHint {
  stateId: number;
  technologyId: string;
  burgId: number;
  sourceCharacterId: number;
  firstEligibleYear: number;
  expiresAfterYear: number;
}

export interface PatronageDeposit {
  i: number;
  characterId: number;
  burgId: number;
  stateId: number;
  year: number;
  kind: "workshop" | "researchers" | "fuelTrial";
  gold: number;
  researcherCount?: number;
  mineOperationId?: number;
  coal?: number;
  tools?: number;
  iron?: number;
}
