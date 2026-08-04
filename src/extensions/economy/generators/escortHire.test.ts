import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import type { RNGService } from "../../../utils/probabilityUtils";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getEscortActiveContracts,
  getEscortHireApplications,
  getEscortJobPostings,
  initEconomyContext,
  setEscortJobPostings
} from "../economyContext";
import {
  applyCharacterToEscortJob,
  cancelEscortApplication,
  clearEscortHiringSession,
  getCharacterEscortContract,
  getCharacterPendingEscortApplication,
  resignEscortJob,
  tickEscortHiring
} from "./escortHire";
import type { EscortJobPosting } from "./escortHireTypes";
import { clearEscortHireState, ESCORT_PLAYER_HIRE_LAG_DAYS } from "./escortJobPostings";

function alwaysSuccessRng(): RNGService {
  let i = 0;
  const seq = [0.9, 0.5, 0.99, 0.9, 0.5, 0.99];
  return {
    rand: () => seq[i++ % seq.length] ?? 0.9,
    P: () => false,
    each: () => () => false,
    gauss: () => 0,
    Pint: n => Math.floor(n),
    ra: <T>(a: T[]) => a[0],
    rw: () => "",
    biased: () => 0,
    getNumberInRange: () => 0,
    generateSeed: () => "0"
  };
}

function makePosting(overrides?: Partial<EscortJobPosting>): EscortJobPosting {
  return {
    i: 1,
    burgId: 1,
    stateId: 1,
    destinationBurgId: 2,
    kind: "trade",
    transport: "caravan",
    missionDays: 5,
    threat: {
      avgDanger: 0.1,
      maxDanger: 0.2,
      banditThreat: 0.1,
      beastThreat: 0.1,
      securityDeficit: 0.1,
      threatScore: 0.15
    },
    fee: 4,
    feePartial: 1.6,
    marketRate: "market",
    rateMultiplier: 1,
    openSeats: 1,
    postedAtDay: 100,
    expiresInDays: 30,
    label: "Escort caravan to Westport (market)",
    ...overrides
  };
}

function setupTwoBurgs(): void {
  worldContext.pack = {
    cells: {
      i: Uint16Array.from({ length: 4 }, (_, i) => i),
      c: [[1], [0, 2], [1, 3], [2]],
      h: new Uint8Array(4).fill(25),
      state: new Uint16Array([1, 1, 1, 1]),
      danger: new Uint8Array([0, 10, 20, 5])
    },
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        state: 1,
        name: "Eastburg",
        x: 0,
        y: 0,
        removed: false,
        group: "town",
        population: 3
      },
      {
        i: 2,
        cell: 3,
        state: 1,
        name: "Westport",
        x: 10,
        y: 0,
        removed: false,
        group: "port",
        population: 4
      }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Aster", treasury: 50, removed: false }
    ],
    characters: [
      {
        i: 10,
        name: "Guard",
        location: 1,
        wealth: 1,
        dead: false,
        skills: { martial: 70, prowess: 75 },
        roles: []
      }
    ]
  } as unknown as typeof worldContext.pack;

  simulationContext.currentYear = 100;
  simulationContext.currentMonth = 1;
  simulationContext.currentDay = 1;
}

describe("escort hire board", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext
    } as unknown as ExtensionAPI);
    clearEscortHireState();
    clearEscortHiringSession();
    setupTwoBurgs();
    setEscortJobPostings([makePosting()]);
  });

  afterEach(() => {
    clearEscortHireState();
    clearEscortHiringSession();
    clearEconomyContext();
  });

  it("applies, accepts after lag, resolves with pay and arrival", () => {
    const apply = applyCharacterToEscortJob({ characterId: 10, postingId: 1 });
    expect(apply.ok).toBe(true);
    expect(getCharacterPendingEscortApplication(10)?.daysRemaining).toBe(ESCORT_PLAYER_HIRE_LAG_DAYS);
    expect(getEscortHireApplications()).toHaveLength(1);

    // Lag completes → contract
    tickEscortHiring(ESCORT_PLAYER_HIRE_LAG_DAYS, alwaysSuccessRng());
    const contract = getCharacterEscortContract(10);
    expect(contract).not.toBeNull();
    expect(contract?.escrow).toBeGreaterThan(0);
    expect(getEscortHireApplications()).toHaveLength(0);

    const treasuryAfterEscrow = worldContext.pack.states[1].treasury ?? 0;
    const wealthBefore = worldContext.pack.characters![0].wealth;

    // Mission completes
    tickEscortHiring(contract!.missionDaysRemaining, alwaysSuccessRng());
    expect(getEscortActiveContracts()).toHaveLength(0);
    const character = worldContext.pack.characters!.find(c => c.i === 10)!;
    expect(character.location).toBe(2);
    expect(character.wealth).toBeGreaterThan(wealthBefore);
    expect(worldContext.pack.states[1].treasury).toBeLessThanOrEqual(treasuryAfterEscrow);
  });

  it("cancels pending application", () => {
    applyCharacterToEscortJob({ characterId: 10, postingId: 1 });
    const cancel = cancelEscortApplication(10);
    expect(cancel.ok).toBe(true);
    expect(getCharacterPendingEscortApplication(10)).toBeNull();
  });

  it("resigns active contract and forfeits escrow", () => {
    applyCharacterToEscortJob({ characterId: 10, postingId: 1 });
    tickEscortHiring(ESCORT_PLAYER_HIRE_LAG_DAYS, alwaysSuccessRng());
    expect(getCharacterEscortContract(10)).not.toBeNull();
    const resign = resignEscortJob(10);
    expect(resign.ok).toBe(true);
    expect(getCharacterEscortContract(10)).toBeNull();
  });

  it("rejects dual apply while already pending", () => {
    applyCharacterToEscortJob({ characterId: 10, postingId: 1 });
    const second = applyCharacterToEscortJob({ characterId: 10, postingId: 1 });
    expect(second.ok).toBe(false);
  });

  it("keeps postings in the slice after clear only when reset", () => {
    expect(getEscortJobPostings()).toHaveLength(1);
    clearEscortHireState();
    expect(getEscortJobPostings()).toHaveLength(0);
  });
});
