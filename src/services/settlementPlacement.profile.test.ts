import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { bindSimulationBurgState } from "../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import { useOptionsState } from "../store/optionsState";
import { IndexedPhysicalWater } from "./indexedPhysicalWater";
import { RegionalRiverGeometry } from "./regionalRiverGeometry";
import * as physical from "./riverPhysicalGeometry";
import { SettlementGeometrySession } from "./settlementGeometrySession";
import * as sites from "./settlementRiverSite";
import * as rivers from "./worldRiverGeometry";

// Opt-in diagnostic: no machine-dependent timing assertion in the normal test suite.
const archive = process.env.SETTLEMENT_PROFILE_ARCHIVE;
describe.skipIf(!archive)("settlement placement cost profile", () => {
  it("records cold and warm placement work on the same world", async () => {
    expect(existsSync(archive!)).toBe(true);
    const buffer = readFileSync(archive!);
    const runs = [];
    const repetitions = Number(process.env.SETTLEMENT_PROFILE_REPETITIONS ?? 1);
    expect(Number.isSafeInteger(repetitions) && repetitions > 0 && repetitions <= 20).toBe(true);
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const result = await decodeAndValidateWorldArchive({
        blob: new Blob([buffer]),
        header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
      });
      Object.assign(worldContext, result.document.world);
      bindSimulationBurgState(worldContext, result.document.simulation);
      const { pack } = worldContext;
      const positions = pack.burgs.map(b => [b.x, b.y]);
      const geometrySession = new SettlementGeometrySession();
      for (const pass of ["cold", "warm"]) {
        pack.burgs.forEach((b, i) => {
          if (!b.i) return;
          [b.x, b.y] = positions[i];
        });
        const metrics = {
          pass,
          repetition,
          heapBytes: 0,
          maxWorkStepMs: 0,
          wallMs: 0,
          regionCalls: 0,
          regionMs: 0,
          maxRegionMs: 0,
          sectionsBuilt: 0,
          indexedCollisionCalls: 0,
          indexedCollisionMs: 0,
          indexedEdgesVisited: 0,
          surveyCalls: 0,
          surveyMs: 0,
          maxSurveyMs: 0,
          boundsCalls: 0,
          boundsMs: 0,
          searchCalls: 0,
          searchMs: 0,
          maxSearchMs: 0,
          bankEdgesScanned: 0,
          obstacleRingsSupplied: 0,
          obstacleVerticesSupplied: 0,
          supportCalls: 0,
          supportMs: 0,
          collisionCalls: 0,
          collisionMs: 0,
          collisionVerticesSupplied: 0,
          placed: 0,
          unresolved: {} as Record<string, number>
        };
        const survey = sites.settlementRiverGeometry;
        const search = sites.findRiverSettlementSiteSteps;
        const bounds = rivers.worldRiverOccupiedBounds;
        const collision = physical.footprintTouchesWater;
        let inSearch = false;
        let inSupport = false;
        const regionQuery = RegionalRiverGeometry.prototype.querySteps;
        const indexedTouches = IndexedPhysicalWater.prototype.touches;
        const spies = [
          vi.spyOn(RegionalRiverGeometry.prototype, "querySteps").mockImplementation(function* (
            this: RegionalRiverGeometry,
            ...args
          ) {
            const builds = this.sectionBuilds;
            metrics.regionCalls++;
            const steps = regionQuery.apply(this, args);
            let ms = 0;
            while (true) {
              const t = performance.now(),
                result = steps.next();
              const workMs = performance.now() - t;
              ms += workMs;
              metrics.maxWorkStepMs = Math.max(metrics.maxWorkStepMs, workMs);
              if (result.done) {
                metrics.regionMs += ms;
                metrics.maxRegionMs = Math.max(metrics.maxRegionMs, ms);
                metrics.sectionsBuilt += this.sectionBuilds - builds;
                return result.value;
              }
              yield;
            }
          }),
          vi.spyOn(IndexedPhysicalWater.prototype, "touches").mockImplementation(function (
            this: IndexedPhysicalWater,
            ...args
          ) {
            const start = performance.now(),
              visits = this.visitedEdges;
            const result = indexedTouches.apply(this, args);
            metrics.indexedCollisionCalls++;
            metrics.indexedCollisionMs += performance.now() - start;
            metrics.indexedEdgesVisited += this.visitedEdges - visits;
            return result;
          }),
          vi.spyOn(physical, "footprintTouchesWater").mockImplementation((...args) => {
            if (!inSearch || inSupport) return collision(...args);
            const start = performance.now();
            const value = collision(...args);
            metrics.collisionCalls++;
            metrics.collisionMs += performance.now() - start;
            metrics.collisionVerticesSupplied += args[1].rings.reduce((n, ring) => n + ring.length, 0);
            return value;
          }),
          vi.spyOn(sites, "settlementRiverGeometry").mockImplementation((...args) => {
            const start = performance.now();
            const value = survey(...args);
            const ms = performance.now() - start;
            metrics.surveyCalls++;
            metrics.surveyMs += ms;
            metrics.maxSurveyMs = Math.max(metrics.maxSurveyMs, ms);
            return value;
          }),
          vi.spyOn(rivers, "worldRiverOccupiedBounds").mockImplementation((...args) => {
            const start = performance.now();
            const value = bounds(...args);
            metrics.boundsCalls++;
            metrics.boundsMs += performance.now() - start;
            return value;
          }),
          vi.spyOn(sites, "findRiverSettlementSiteSteps").mockImplementation(function* (input) {
            metrics.searchCalls++;
            metrics.bankEdgesScanned += input.geometry.water.rings.reduce((n, ring) => n + ring.length, 0);
            for (const water of input.otherWater)
              for (const ring of water.rings) {
                metrics.obstacleRingsSupplied++;
                metrics.obstacleVerticesSupplied += ring.length;
              }
            inSearch = true;
            const steps = search({
              ...input,
              supports: (...args) => {
                const t = performance.now();
                inSupport = true;
                const supported = input.supports(...args);
                inSupport = false;
                metrics.supportCalls++;
                metrics.supportMs += performance.now() - t;
                return supported;
              }
            });
            let ms = 0;
            while (true) {
              inSearch = true;
              const t = performance.now(),
                result = steps.next();
              const workMs = performance.now() - t;
              ms += workMs;
              metrics.maxWorkStepMs = Math.max(metrics.maxWorkStepMs, workMs);
              inSearch = false;
              if (result.done) {
                metrics.searchMs += ms;
                metrics.maxSearchMs = Math.max(metrics.maxSearchMs, ms);
                return result.value;
              }
              yield;
            }
          })
        ];
        try {
          const start = performance.now();
          await Burgs.shiftAsync({ geometrySession });
          metrics.wallMs = performance.now() - start;
        } finally {
          for (const spy of spies) spy.mockRestore();
        }
        for (const burg of pack.burgs) {
          const status = burg.riverSiteStatus;
          if (status?.status === "placed") metrics.placed++;
          else if (status?.status === "unresolved") {
            const reason = status.reason ?? "unknown";
            metrics.unresolved[reason] = (metrics.unresolved[reason] ?? 0) + 1;
          }
        }
        metrics.heapBytes = process.memoryUsage().heapUsed;
        runs.push(metrics);
      }
    }
    const { pack } = worldContext;
    const report = {
      archive: resolve(archive!),
      runtime: process.version,
      distanceUnit: useOptionsState.getState().distanceUnit,
      heightExponent: useOptionsState.getState().heightExponent,
      distanceScale: worldContext.distanceScale,
      cells: pack.cells.p.length,
      rivers: pack.rivers.length,
      burgs: pack.burgs.filter(b => b.i).length,
      riverTowns: pack.burgs.filter(b => b.i && !b.lock && pack.cells.r[b.cell]).length,
      settings: sites.SETTLEMENT_RIVER_SETTINGS,
      runs
    };
    writeFileSync(
      process.env.SETTLEMENT_PROFILE_OUTPUT ?? resolve(tmpdir(), "settlement-placement-profile.json"),
      JSON.stringify(report, null, 2)
    );
    expect(runs.every(run => run.surveyCalls > 0 || run.regionCalls > 0)).toBe(true);
  }, 120000);
});
