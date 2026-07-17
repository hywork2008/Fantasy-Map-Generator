import { describe, expect, it } from "vitest";
import type { DeckLandCellGeometry } from "./adapters/deckDataAdapters";
import {
  InProcessLandTopologyProjectionJobAdapter,
  type LandTopologyProjectionWorker,
  StaleLandTopologyProjectionError,
  WorkerLandTopologyProjectionAdapter
} from "./landTopologyProjectionWorkerAdapter";

class FakeProjectionWorker implements LandTopologyProjectionWorker {
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private errorListener: ((event: ErrorEvent) => void) | null = null;
  readonly requests: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.requests.push(message);
  }

  addEventListener(
    type: "message" | "error",
    listener: ((event: MessageEvent) => void) | ((event: ErrorEvent) => void)
  ): void {
    if (type === "message") this.messageListener = listener as (event: MessageEvent) => void;
    else this.errorListener = listener as (event: ErrorEvent) => void;
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(requestId: number, revision: number): void {
    this.messageListener?.({
      data: {
        kind: "result",
        requestId,
        revision,
        topology: {
          cellIds: new Uint32Array([revision]),
          polygonOffsets: new Uint32Array([0, 2]),
          coordinates: new Float32Array([revision, revision])
        }
      }
    } as MessageEvent);
  }

  fail(message: string): void {
    this.errorListener?.({ message } as ErrorEvent);
  }
}

const geometry: readonly DeckLandCellGeometry[] = [{ cellId: 1, polygon: [[0, 0]] }];

describe("WorkerLandTopologyProjectionAdapter", () => {
  it("keeps an async-compatible in-process fallback for environments without Worker", async () => {
    const adapter = new InProcessLandTopologyProjectionJobAdapter();

    await expect(adapter.project({ revision: 7, geometry })).resolves.toMatchObject({
      revision: 7,
      topology: { cellIds: new Uint32Array([1]) }
    });
  });

  it("rejects a superseded request and accepts only the latest worker result", async () => {
    const worker = new FakeProjectionWorker();
    const adapter = new WorkerLandTopologyProjectionAdapter(worker);

    const first = adapter.project({ revision: 10, geometry });
    const second = adapter.project({ revision: 11, geometry });

    await expect(first).rejects.toBeInstanceOf(StaleLandTopologyProjectionError);
    worker.respond(2, 11);
    await expect(second).resolves.toMatchObject({ revision: 11, topology: { cellIds: new Uint32Array([11]) } });
    expect(worker.requests).toHaveLength(2);
  });

  it("terminates its worker and rejects outstanding projection work on disposal", async () => {
    const worker = new FakeProjectionWorker();
    const adapter = new WorkerLandTopologyProjectionAdapter(worker);
    const pending = adapter.project({ revision: 10, geometry });

    adapter.dispose();

    await expect(pending).rejects.toThrow("disposed");
    expect(worker.terminated).toBe(true);
  });

  it("rejects pending work when the worker fails", async () => {
    const worker = new FakeProjectionWorker();
    const adapter = new WorkerLandTopologyProjectionAdapter(worker);
    const pending = adapter.project({ revision: 10, geometry });

    worker.fail("worker crashed");

    await expect(pending).rejects.toThrow("worker crashed");
  });
});
