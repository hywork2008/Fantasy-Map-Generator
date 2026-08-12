import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getAcademyKnowledgeStocks,
  getGreatLibraryProjects,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setAcademyKnowledgeStocks,
  setGreatLibraryProjects,
  setGuildKnowledgeStocks
} from "../economyContext";
import { applyConquestDisruption } from "./conquestDisruption";
import type { GreatLibraryProject } from "./greatLibraryTypes";

describe("applyConquestDisruption()", () => {
  afterEach(() => clearEconomyContext());

  it("disrupts both guild and academy stocks for the Burg when economy context is ready", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);
    setAcademyKnowledgeStocks([{ burgId: 1, domain: "administration", stock: 0.6 }]);

    applyConquestDisruption(1);

    expect(getGuildKnowledgeStocks()[0].stock).toBeLessThan(0.8);
    expect(getAcademyKnowledgeStocks()[0].stock).toBeLessThan(0.6);
  });

  it("is a no-op when economy's context has not been initialized (e.g. a Nobility unit test)", () => {
    expect(() => applyConquestDisruption(1)).not.toThrow();
  });

  describe("Great Library disruption (docs/plan/great-library.md §征服・占領)", () => {
    // Marker plumbing (docs/plan/great-library.md PR3.5/PR6) is exercised by
    // src/services/mapMarkerApi.test.ts; here it only needs to not throw.
    const api = {
      worldContext,
      createMapMarker: () => null,
      updateMapMarker: () => false,
      requestWebglRender: () => {}
    } as unknown as ExtensionAPI;

    function project(overrides: Partial<GreatLibraryProject>): GreatLibraryProject {
      return {
        id: 1,
        stateId: 1,
        burgId: 1,
        status: "building",
        phase: "structure",
        progress: 6,
        startedYear: 490,
        totalSpent: 100,
        endowment: 0,
        name: "Test Great Library",
        ...overrides
      };
    }

    it("cuts a building project's progress to 30%, keeping it alive on a non-ruin roll", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      // id=1, year=500 lands above the 0.40 ruin threshold (see greatLibrary.ts's conquestRuinRoll).
      setGreatLibraryProjects([project({ id: 1, status: "building", progress: 6 })]);

      applyConquestDisruption(1);

      const result = getGreatLibraryProjects()[0];
      expect(result.status).toBe("building");
      expect(result.progress).toBeCloseTo(1.8, 4); // 6 * 0.3
    });

    it("can ruin a building project outright, zeroing its endowment", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      // id=2, year=500 lands below the 0.40 ruin threshold.
      setGreatLibraryProjects([project({ id: 2, status: "building", progress: 6 })]);

      applyConquestDisruption(1);

      const result = getGreatLibraryProjects()[0];
      expect(result.status).toBe("ruined");
      expect(result.ruinedYear).toBe(500);
      expect(result.endowment).toBe(0);
    });

    it("cuts a completed project's endowment to 40%, and can ruin it outright", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      // id=2, year=500 lands below the 0.25 completed-ruin threshold.
      setGreatLibraryProjects([project({ id: 2, status: "completed", endowment: 0.5, completedYear: 480 })]);

      applyConquestDisruption(1);

      const result = getGreatLibraryProjects()[0];
      expect(result.status).toBe("ruined");
      expect(result.endowment).toBe(0);
    });

    it("drops a planning project outright — no name/investment to disrupt", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      setGreatLibraryProjects([project({ status: "planning", progress: 0 })]);

      applyConquestDisruption(1);

      expect(getGreatLibraryProjects()).toHaveLength(0);
    });

    it("only touches projects sited at the conquered Burg", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      setGreatLibraryProjects([project({ id: 1, burgId: 2, status: "building", progress: 6 })]);

      applyConquestDisruption(1); // conquers Burg 1, not Burg 2

      expect(getGreatLibraryProjects()[0].progress).toBe(6);
    });

    it("leaves an already-ruined project untouched", () => {
      initEconomyContext(api);
      worldContext.pack = {} as unknown as PackedGraph;
      worldContext.options = { year: 500 };
      setGreatLibraryProjects([project({ status: "ruined", ruinedYear: 400, progress: 6 })]);

      applyConquestDisruption(1);

      expect(getGreatLibraryProjects()[0]).toEqual(project({ status: "ruined", ruinedYear: 400, progress: 6 }));
    });
  });
});
