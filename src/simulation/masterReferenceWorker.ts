import type { MasterReferenceMessage, MasterReferenceRequest } from "./masterReferenceProtocol";

const port = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MasterReferenceRequest>) => void) | null;
  postMessage(message: MasterReferenceMessage): void;
};
port.onmessage = event => {
  // Keep engine loading inside the error boundary: module initialization can fail
  // before the worker installs its message handler when imported statically.
  void import("./masterReferenceEngine")
    .then(({ evaluateMasterReference }) => evaluateMasterReference(event.data, message => port.postMessage(message)))
    .catch(error =>
      port.postMessage({
        kind: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error)
      })
    );
};
