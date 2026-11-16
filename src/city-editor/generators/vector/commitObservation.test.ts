import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { parseVectorDocument } from "../../services/io/vector/documentCodec";
import { reconcileVectorEdit } from "./editing/dependencies";
import { detachFabricHouse } from "./editing/fabricHouses";
import { setVectorPlacementPolicy } from "./editing/placements";
import { VectorDocumentHistory } from "./history";
import { assertVectorDocument, validateVectorDocument } from "./validation/document";

const output = process.env.CE_MESHLESS_COMMIT_OUT;
const input = process.env.CE_MESHLESS_COMMIT_DIR ?? "docs/analytics/raw/scaling-s21g-20261108";
const time = (f: () => unknown) => {
  const t = performance.now();
  f();
  return Math.round(performance.now() - t);
};

/** Opt-in S4: what one committed edit costs on a saved fabric document (copies, validation, render). */
describe.runIf(!!output)("meshless commit cost observation", () => {
  it("records copy, validation, detach, commit, render and reconciliation times", () => {
    const rows: Record<string, unknown> = {};
    for (const population of [5000, 50000]) {
      const doc = parseVectorDocument(readFileSync(`${input}/scaling-${population}.json`, "utf8"))!,
        cell = Object.values(doc.fabric!.cells).find(c => c.houses.offsets.length)!,
        r: Record<string, unknown> = {};
      r.structuredClone = time(() => structuredClone(doc));
      r.assertVectorDocument = time(() => assertVectorDocument(doc));
      const phases: Record<string, number> = {};
      validateVectorDocument(doc, false, (phase, ms) => {
        phases[phase] = Math.round((phases[phase] ?? 0) + ms);
      });
      r.validationPhases = phases;
      r.jsonStringify = time(() => JSON.stringify(doc));
      let detached: ReturnType<typeof detachFabricHouse> | undefined;
      r.detachFabricHouse = time(() => {
        detached = detachFabricHouse(doc, `${cell.id}#0`);
      });
      const history = new VectorDocumentHistory(doc);
      r.historyDocumentGetter = time(() => history.document);
      r.historyCommit = time(() => history.commit(detached!.document, "detach"));
      r.vectorRenderData = time(() => vectorRenderData(detached!.document));
      r.renderVectorDocument = time(() => renderVectorDocument(detached!.document));
      const candidate = setVectorPlacementPolicy(detached!.document, detached!.placementId, "fixed");
      r.reconcileFix = time(() => reconcileVectorEdit(detached!.document, candidate));
      rows[population] = r;
    }
    writeFileSync(
      output!,
      `${JSON.stringify({ format: "ce-meshless-commit-observation", version: 1, measuredAtUtc: new Date().toISOString(), input, scope: "Node + jsdom, one run each; validation phases from validateVectorDocument's timing observer.", rows }, null, 2)}\n`
    );
  }, 600000);
});
