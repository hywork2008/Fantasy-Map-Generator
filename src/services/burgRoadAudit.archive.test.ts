/** Opt-in local acceptance against a user's saved map; no archive is checked into git. */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { readFmgArchive } from "../../scripts/lib/fmgArchiveReader";
import { parseCeRoadReference } from "../../scripts/lib/fmgCityAudit/ceRoads";
import { buildCityAudit } from "../../scripts/lib/fmgCityAudit/model";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { bindSimulationBurgState } from "../runtime/simulationBurgState";
import { bindSimulationCellColumns } from "../runtime/simulationCellColumns";
import { useOptionsState } from "../store/optionsState";
import { getBurgRoadAuditReference } from "./burgSiteDescriptor";

const input = process.env.FMG_AUDIT_ARCHIVE;
it.skipIf(!input)(
  "compares the actual CE road handoff with the immutable saved input",
  async () => {
    const archive = await readFmgArchive(path.resolve(input!));
    const before = archive.inputHash;
    Object.assign(worldContext, structuredClone(archive.world));
    Object.assign(simulationContext, structuredClone(archive.simulation));
    bindSimulationBurgState(worldContext, simulationContext);
    bindSimulationCellColumns(worldContext, simulationContext);
    useOptionsState.setState({ distanceUnit: "km", heightExponent: 1.8 });
    const burgId = Number(process.env.FMG_AUDIT_BURG ?? 347);
    const reference = getBurgRoadAuditReference(burgId, archive.inputHash)!;
    expect(reference).not.toBeNull();
    parseCeRoadReference(JSON.parse(JSON.stringify(reference)));
    const result = buildCityAudit(archive, {
      burgIds: [burgId],
      all: false,
      distanceUnit: "km",
      travelMode: "auto",
      avoidSea: false,
      preferSea: false,
      ceHandoff: reference
    });
    expect(result.ceDifferences.filter(d => d.comparison === "captured_inputs_vs_handoff")).toEqual([]);
    expect(result.findings.some(f => f.ruleId === "CE_HANDOFF_MISMATCH" && f.status === "pass")).toBe(true);
    expect(archive.inputHash).toBe(before);
    if (process.env.FMG_AUDIT_REFERENCE_OUTPUT)
      await writeFile(path.resolve(process.env.FMG_AUDIT_REFERENCE_OUTPUT), `${JSON.stringify(reference, null, 2)}\n`);
  },
  120000
);
