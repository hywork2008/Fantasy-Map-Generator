import { Worker } from "node:worker_threads";
import { installMasterReferenceRunner } from "../masterReference";
import type { MasterReferenceMessage } from "../masterReferenceProtocol";

export function installNodeMasterReference(): void {
  installMasterReferenceRunner(
    (request, progress, current) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./masterReferenceNodeWorker.mjs", import.meta.url), { workerData: request });
        const timer = setInterval(() => {
          if (!current()) {
            finish();
            reject(Error("Reference preparation cancelled"));
          }
        }, 100);
        const finish = () => {
          clearInterval(timer);
          void worker.terminate();
        };
        worker.on("error", error => {
          finish();
          reject(error);
        });
        worker.on("message", (message: MasterReferenceMessage) => {
          if (message.kind === "progress") progress(message);
          else if (message.kind === "error") {
            finish();
            reject(Error(message.message));
          } else {
            finish();
            resolve(message.document);
          }
        });
      })
  );
}
