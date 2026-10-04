import { JSDOM } from "jsdom";
import { runnerImport } from "vite";
import { resolve } from "node:path";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window",
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "DOMParser",
  "XMLSerializer",
  "MutationObserver",
  "localStorage",
  "navigator",
  "getComputedStyle"
]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
}
const {
  module: { auditCityGeneration }
} = await runnerImport(resolve("scripts/lib/cityGenerationAuditEntry.ts"), { root: process.cwd() });
process.on("message", ({ row, captureRejected }) => {
  try {
    const result = auditCityGeneration(row, sample => process.send({ type: "progress", sample }), captureRejected);
    process.send({ type: "result", result });
  } catch (error) {
    process.send({
      type: "result",
      result: {
        burgId: Number(row.burg_id),
        name: row.name,
        status: "error",
        generated: false,
        error: error?.stack ?? String(error)
      }
    });
  }
});
process.send({ type: "ready" });
