import { installMasterReferenceRunner, type MasterReferenceRunner } from "../masterReference";
import type { MasterReferenceMessage } from "../masterReferenceProtocol";

const browserRunner: MasterReferenceRunner = (request, progress, current) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../masterReferenceWorker.ts", import.meta.url), { type: "module" });
    const timer = setInterval(() => {
      if (!current()) {
        clearInterval(timer);
        worker.terminate();
        reject(Error("Reference preparation cancelled"));
      }
    }, 100);
    const finish = () => {
      clearInterval(timer);
      worker.terminate();
    };
    worker.onerror = event => {
      finish();
      const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
      reject(
        event.error instanceof Error
          ? event.error
          : Error(event.message || `Master reference worker failed to start or execute${location}`)
      );
    };
    worker.onmessage = (event: MessageEvent<MasterReferenceMessage>) => {
      const value = event.data;
      if (value.kind === "progress") progress(value);
      else if (value.kind === "error") {
        finish();
        reject(Error(value.message));
      } else {
        finish();
        resolve(value.document);
      }
    };
    worker.postMessage(request);
  });

export function installBrowserMasterReference(): void {
  installMasterReferenceRunner(browserRunner);
}
