import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { repairDualPortPlacements } from "../runtime/dualPortPlacementTask";
import { bindSimulationBurgState } from "../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import { useOptionsState } from "../store/optionsState";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { getBurgSiteDescriptor } from "./burgSiteDescriptor";
import { footprintTouchesWater } from "./riverPhysicalGeometry";
import { SettlementGeometrySession } from "./settlementGeometrySession";
import { burgCityRadiusMeters, waterfrontIssues } from "./waterfrontSettlement";

const archive = resolve(import.meta.dirname, "../../temp/000.savdata/Triviers_2026-10-12-18-47.fmg");
afterEach(() => vi.restoreAllMocks());

describe.skipIf(!existsSync(archive))("folded river placement — Leigh regression", () => {
  it("finds a complete local survey and a dry bank without changing the saved city", async () => {
    const buffer = readFileSync(archive);
    const decoded = await decodeAndValidateWorldArchive({
      blob: new Blob([buffer]),
      header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
    });
    Object.assign(worldContext, decoded.document.world);
    bindSimulationBurgState(worldContext, decoded.document.simulation);
    useOptionsState.getState().setOptions({ distanceUnit: "km" });
    const burg = worldContext.pack.burgs[1];
    expect(burg.name).toBe("Leigh");
    expect(burg.riverSiteStatus?.reason).toBe("folded-banks");
    const before = JSON.stringify(burg);
    const session = new SettlementGeometrySession();
    session.prepare(worldContext, "km");
    const steps = Burgs.resiteOnRiverBankSteps(burg, [burg.x, burg.y], session);
    let next = steps.next();
    while (!next.done) next = steps.next();
    const after = next.value!;
    expect(after?.riverSiteStatus?.status).toBe("placed");
    expect(JSON.stringify(burg)).toBe(before);
    expect(Math.hypot(after.x - burg.x, after.y - burg.y)).toBeGreaterThan(0);
    const scale = mapUnitMeters(worldContext.distanceScale, "km");
    const radius = burgCityRadiusMeters(
      worldContext.pack,
      after,
      worldContext.populationRate,
      worldContext.urbanization
    );
    expect(waterfrontIssues(worldContext, after, radius, scale, new Map())).toEqual([]);
    const footprint = after.riverPlacement!.footprintMeters!;
    const water = session.resolve(worldContext, worldContext.pack.rivers.find(r => r.i === 163)!, "km", {
      minX: Math.min(...footprint.map(p => p[0])),
      maxX: Math.max(...footprint.map(p => p[0])),
      minY: Math.min(...footprint.map(p => p[1])),
      maxY: Math.max(...footprint.map(p => p[1]))
    });
    expect("geometry" in water).toBe(true);
    if ("geometry" in water) expect(footprintTouchesWater(footprint, water.geometry.water)).toBe(false);
    // Exercise the load-time repair and road reconnection with only Leigh unlocked.
    for (const other of worldContext.pack.burgs) if (other?.i && other.i !== burg.i) other.lock = true;
    await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
    expect(burg.riverSiteStatus?.status).toBe("placed");
    expect(burg.waterfrontCheck).toBeUndefined();
    const descriptor = getBurgSiteDescriptor(1);
    expect(descriptor?.burg.riverSiteStatus?.status).toBe("placed");
    expect(descriptor?.burg.waterfrontCheck).toBeUndefined();
    expect(descriptor?.rivers.find(r => r.riverId === 163)?.rawOffsetMeters).toBeGreaterThan(0);
  });
});
