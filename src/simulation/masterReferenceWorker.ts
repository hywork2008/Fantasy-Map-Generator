import { evaluateMasterReference } from "./masterReferenceEngine";
import type { MasterReferenceMessage, MasterReferenceRequest } from "./masterReferenceProtocol";

const port = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MasterReferenceRequest>) => void) | null;
  postMessage(message: MasterReferenceMessage): void;
};
port.onmessage = event => {
  void evaluateMasterReference(event.data, message => port.postMessage(message)).catch(error =>
    port.postMessage({
      kind: "error",
      message: error instanceof Error ? (error.stack ?? error.message) : String(error)
    })
  );
};
