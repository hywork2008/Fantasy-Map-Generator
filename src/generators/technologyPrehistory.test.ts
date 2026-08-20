import { describe, expect, it } from "vitest";
import {
  advancePrehistoryStage,
  PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID,
  PREHISTORY_TECHNOLOGY_DEFINITIONS,
  type PrehistorySignalKey,
  type PrehistorySignals,
  type PrehistoryTechnologyDefinition,
  prehistoryPrerequisitesMet,
  prehistoryThresholdsMet
} from "./technologyPrehistory";
import type { TechnologyStage } from "./technologyTypes";

const ZERO_SIGNALS: PrehistorySignals = {
  centralTreasury: 0,
  provincialAdministration: 0,
  masonryAndCivilEngineering: 0,
  metallurgy: 0,
  maritimeSecurity: 0,
  monasticScholarship: 0,
  seigneurialInstitution: 0,
  ironToolAccess: 0,
  equestrianContact: 0,
  millDemand: 0,
  fiscalCollapsePressure: 0,
  tradeRouteInsecurityPressure: 0
};

const MAX_SIGNALS: PrehistorySignals = {
  centralTreasury: 10_000,
  provincialAdministration: 1,
  masonryAndCivilEngineering: 1,
  metallurgy: 1,
  maritimeSecurity: 1,
  monasticScholarship: 1,
  seigneurialInstitution: 1,
  ironToolAccess: 1,
  equestrianContact: 1,
  millDemand: 1,
  fiscalCollapsePressure: 1,
  tradeRouteInsecurityPressure: 1
};

const allAdopted: (id: string) => TechnologyStage = () => "adopted";
const allLocked: (id: string) => TechnologyStage = () => "locked";

describe("technologyPrehistory", () => {
  it("defines 6 nodes per era, 18 total, matching roadmap §16.2-§16.4", () => {
    const byEra = (era: string) => PREHISTORY_TECHNOLOGY_DEFINITIONS.filter(def => def.era === era);
    expect(byEra("romanZenith")).toHaveLength(6);
    expect(byEra("declineAndFragmentation")).toHaveLength(6);
    expect(byEra("earlyMedievalRebuilding")).toHaveLength(6);
    expect(PREHISTORY_TECHNOLOGY_DEFINITIONS).toHaveLength(18);
  });

  it("has unique ids, each resolvable via getPrehistoryTechnologyDefinition", () => {
    const ids = PREHISTORY_TECHNOLOGY_DEFINITIONS.map(def => def.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get(id)?.id).toBe(id);
    }
  });

  it("every prerequisite id resolves to a node defined in this module", () => {
    for (const def of PREHISTORY_TECHNOLOGY_DEFINITIONS) {
      for (const prereq of def.prerequisites) {
        expect(PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.has(prereq)).toBe(true);
      }
    }
  });

  it("thresholds escalate known <= demonstrated <= adopted for every shared signal key", () => {
    for (const def of PREHISTORY_TECHNOLOGY_DEFINITIONS) {
      const known = def.known.min ?? {};
      const demonstrated = def.demonstrated.min ?? {};
      const adopted = def.adopted.min ?? {};
      for (const key of Object.keys(known) as PrehistorySignalKey[]) {
        if (demonstrated[key] !== undefined) {
          expect(demonstrated[key]!, `${def.id}.${key} demonstrated >= known`).toBeGreaterThanOrEqual(known[key]!);
        }
      }
      for (const key of Object.keys(demonstrated) as PrehistorySignalKey[]) {
        if (adopted[key] !== undefined) {
          expect(adopted[key]!, `${def.id}.${key} adopted >= demonstrated`).toBeGreaterThanOrEqual(demonstrated[key]!);
        }
      }
    }
  });

  it("only the three §16.3 collapse nodes carry affectsMaintenanceOf metadata, and each target exists", () => {
    const collapseIds = new Set([
      "collapseOfCentralMaintenance",
      "dissolutionOfLegionsIntoRetinues",
      "fragmentationOfUnifiedTrade"
    ]);
    for (const def of PREHISTORY_TECHNOLOGY_DEFINITIONS) {
      if (collapseIds.has(def.id)) {
        expect(def.affectsMaintenanceOf.length).toBeGreaterThan(0);
        for (const target of def.affectsMaintenanceOf) {
          expect(PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.has(target)).toBe(true);
        }
      } else {
        expect(def.affectsMaintenanceOf).toEqual([]);
      }
    }
  });

  describe("prehistoryThresholdsMet", () => {
    it("is vacuously true when a stage has no min thresholds", () => {
      expect(prehistoryThresholdsMet({}, ZERO_SIGNALS)).toBe(true);
    });

    it("requires every listed signal to meet its minimum", () => {
      const thresholds = { min: { metallurgy: 0.5, centralTreasury: 100 } };
      expect(prehistoryThresholdsMet(thresholds, { ...ZERO_SIGNALS, metallurgy: 0.5, centralTreasury: 100 })).toBe(
        true
      );
      expect(prehistoryThresholdsMet(thresholds, { ...ZERO_SIGNALS, metallurgy: 0.49, centralTreasury: 100 })).toBe(
        false
      );
    });
  });

  describe("prehistoryPrerequisitesMet", () => {
    const def = PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get("aqueductsAndUrbanWaterSupply")!;

    it("is satisfied when every prerequisite is at least adopted", () => {
      expect(prehistoryPrerequisitesMet(def, allAdopted)).toBe(true);
    });

    it("fails when a prerequisite has not reached adopted", () => {
      expect(prehistoryPrerequisitesMet(def, allLocked)).toBe(false);
    });

    it("is vacuously true for a root node with no prerequisites", () => {
      const root = PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get("hydraulicConcreteConstruction")!;
      expect(prehistoryPrerequisitesMet(root, allLocked)).toBe(true);
    });
  });

  describe("advancePrehistoryStage", () => {
    const root: PrehistoryTechnologyDefinition = PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get(
      "hydraulicConcreteConstruction"
    )!;

    it("stays locked when no thresholds are met", () => {
      expect(advancePrehistoryStage("locked", root, ZERO_SIGNALS, allLocked)).toBe("locked");
    });

    it("can climb locked -> known -> demonstrated -> adopted in a single call given strong signals", () => {
      expect(advancePrehistoryStage("locked", root, MAX_SIGNALS, allLocked)).toBe("adopted");
    });

    it("caps at adopted — diffusion accumulation is out of scope for this pure function", () => {
      expect(advancePrehistoryStage("adopted", root, MAX_SIGNALS, allLocked)).toBe("adopted");
    });

    it("never regresses even when signals later fail thresholds", () => {
      expect(advancePrehistoryStage("adopted", root, ZERO_SIGNALS, allLocked)).toBe("adopted");
    });

    it("refuses to advance past the current stage while a prerequisite is unmet", () => {
      const dependent = PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get("aqueductsAndUrbanWaterSupply")!;
      expect(advancePrehistoryStage("locked", dependent, MAX_SIGNALS, allLocked)).toBe("locked");
      expect(advancePrehistoryStage("locked", dependent, MAX_SIGNALS, allAdopted)).toBe("adopted");
    });
  });
});
