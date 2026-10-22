import { parentPort, workerData } from "node:worker_threads";
import { register } from "tsx/esm/api";
import { register as registerCommonJS } from "tsx/cjs/api";
registerCommonJS();
register();
try {
  const { evaluateMasterReference } = await import("../masterReferenceEngine.ts");
  await evaluateMasterReference(workerData, message => parentPort.postMessage(message));
} catch (error) {
  parentPort.postMessage({ kind: "error", message: error instanceof Error ? error.stack ?? error.message : String(error) });
}
