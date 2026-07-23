import type { DeckLandCellGeometry } from "./adapters/deckDataAdapters";
import { buildFlatLandTopology, type FlatLandTopology } from "./flatLandTopology";

export interface LandTopologyProjectionRequest {
  readonly revision: number;
  readonly geometry: readonly DeckLandCellGeometry[];
}

export interface LandTopologyProjectionResult {
  readonly revision: number;
  readonly topology: FlatLandTopology;
}

export interface AsyncLandTopologyProjectionAdapter {
  project(request: LandTopologyProjectionRequest): Promise<LandTopologyProjectionResult>;
  dispose(): void;
}

/** Async-compatible fallback used when Worker construction is unavailable. */
export class InProcessLandTopologyProjectionJobAdapter implements AsyncLandTopologyProjectionAdapter {
  project(request: LandTopologyProjectionRequest): Promise<LandTopologyProjectionResult> {
    return Promise.resolve({ revision: request.revision, topology: buildFlatLandTopology(request.geometry) });
  }

  dispose(): void {}
}

interface WorkerRequest {
  readonly kind: "project";
  readonly requestId: number;
  readonly revision: number;
  readonly geometry: readonly DeckLandCellGeometry[];
}

interface WorkerSuccessResponse {
  readonly kind: "result";
  readonly requestId: number;
  readonly revision: number;
  readonly topology: FlatLandTopology;
}

interface WorkerFailureResponse {
  readonly kind: "error";
  readonly requestId: number;
  readonly message: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerFailureResponse;

export interface LandTopologyProjectionWorker {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

type PendingProjection = {
  readonly resolve: (result: LandTopologyProjectionResult) => void;
  readonly reject: (reason: Error) => void;
};

export class StaleLandTopologyProjectionError extends Error {
  constructor() {
    super("Land topology projection was superseded by a newer world revision");
    this.name = "StaleLandTopologyProjectionError";
  }
}

/**
 * Worker-backed CPU projection. It transfers only flat renderer-derived
 * buffers back to the main thread; it never receives a mutable WorldContext or
 * constructs deck.gl resources.
 */
export class WorkerLandTopologyProjectionAdapter implements AsyncLandTopologyProjectionAdapter {
  private readonly pending = new Map<number, PendingProjection>();
  private nextRequestId = 0;
  private latestRequestId = 0;
  private disposed = false;

  constructor(private readonly worker: LandTopologyProjectionWorker = createProjectionWorker()) {
    this.worker.addEventListener("message", event => this.handleMessage(event.data));
    this.worker.addEventListener("error", event =>
      this.rejectAll(new Error(event.message || "Topology worker failed"))
    );
  }

  project(request: LandTopologyProjectionRequest): Promise<LandTopologyProjectionResult> {
    if (this.disposed) return Promise.reject(new Error("Land topology projection adapter has been disposed"));

    const requestId = ++this.nextRequestId;
    this.latestRequestId = requestId;
    for (const [pendingRequestId, pending] of this.pending) {
      if (pendingRequestId >= requestId) continue;
      this.pending.delete(pendingRequestId);
      pending.reject(new StaleLandTopologyProjectionError());
    }

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ kind: "project", requestId, revision: request.revision, geometry: request.geometry });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAll(new Error("Land topology projection adapter has been disposed"));
    this.worker.terminate();
  }

  private handleMessage(response: WorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);

    if (response.kind === "error") {
      pending.reject(new Error(response.message));
      return;
    }
    if (response.requestId !== this.latestRequestId) {
      pending.reject(new StaleLandTopologyProjectionError());
      return;
    }
    pending.resolve({ revision: response.revision, topology: response.topology });
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function createProjectionWorker(): LandTopologyProjectionWorker {
  return new Worker(new URL("./landTopologyProjectionWorker.ts", import.meta.url), {
    type: "module",
    name: "fmg-land-topology"
  }) as unknown as LandTopologyProjectionWorker;
}
