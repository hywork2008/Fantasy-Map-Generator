import type { DeckLandCellGeometry } from "./adapters/deckDataAdapters";
import { buildFlatLandTopology } from "./flatLandTopology";

interface ProjectionRequest {
  readonly kind: "project";
  readonly requestId: number;
  readonly revision: number;
  readonly geometry: readonly DeckLandCellGeometry[];
}

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<ProjectionRequest>) => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

workerScope.addEventListener("message", event => {
  const request = event.data;
  if (request.kind !== "project") return;

  try {
    const topology = buildFlatLandTopology(request.geometry);
    workerScope.postMessage({ kind: "result", requestId: request.requestId, revision: request.revision, topology }, [
      topology.cellIds.buffer,
      topology.polygonOffsets.buffer,
      topology.coordinates.buffer
    ]);
  } catch (error) {
    workerScope.postMessage(
      {
        kind: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : "Land topology projection failed"
      },
      []
    );
  }
});
