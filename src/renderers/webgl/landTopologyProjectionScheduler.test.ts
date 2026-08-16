import { describe, expect, it, vi } from "vitest";
import type { FlatLandTopology } from "./flatLandTopology";
import {
  type AnimationFrameScheduler,
  type LandTopologyProjectionCache,
  LandTopologyProjectionScheduler
} from "./landTopologyProjectionScheduler";
import type {
  AsyncLandTopologyProjectionAdapter,
  LandTopologyProjectionRequest,
  LandTopologyProjectionResult
} from "./landTopologyProjectionWorkerAdapter";

class ControlledAdapter implements AsyncLandTopologyProjectionAdapter {
  readonly requests: LandTopologyProjectionRequest[] = [];
  private readonly pending: Array<{
    resolve: (result: LandTopologyProjectionResult) => void;
    reject: (error: Error) => void;
  }> = [];

  project(request: LandTopologyProjectionRequest): Promise<LandTopologyProjectionResult> {
    this.requests.push(request);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  resolve(index: number, revision: number): void {
    this.pending[index]?.resolve({ revision, topology: topology(revision) });
  }

  reject(index: number, message: string): void {
    this.pending[index]?.reject(new Error(message));
  }

  dispose = vi.fn();
}

function topology(value: number): FlatLandTopology {
  return {
    cellIds: new Uint32Array([value]),
    polygonOffsets: new Uint32Array([0, 2]),
    coordinates: new Float32Array([value, value]),
    isFringe: new Uint8Array([0])
  };
}

function createFrames(): AnimationFrameScheduler & { flush(): void } {
  let callback: FrameRequestCallback | null = null;
  return {
    request: next => {
      callback = next;
      return 1;
    },
    cancel: vi.fn(),
    flush: () => {
      const next = callback;
      callback = null;
      next?.(0);
    }
  };
}

describe("LandTopologyProjectionScheduler", () => {
  it("coalesces commits to the latest rAF request and publishes its topology", async () => {
    const adapter = new ControlledAdapter();
    const frames = createFrames();
    let signature = "topology:1";
    let revision = 1;
    const cache: LandTopologyProjectionCache = {
      markPending: vi.fn(),
      publish: vi.fn(),
      clearPending: vi.fn()
    };
    const onReady = vi.fn();
    const scheduler = new LandTopologyProjectionScheduler({
      adapter,
      frames,
      source: {
        getSignature: () => signature,
        buildRequest: () => ({ revision, geometry: [{ cellId: 1, polygon: [[0, 0]] }] })
      },
      cache,
      onReady,
      onFailure: vi.fn()
    });

    scheduler.schedule();
    signature = "topology:2";
    revision = 2;
    scheduler.schedule();
    frames.flush();
    adapter.resolve(0, 2);
    await Promise.resolve();

    expect(adapter.requests).toEqual([{ revision: 2, geometry: [{ cellId: 1, polygon: [[0, 0]] }] }]);
    expect(cache.clearPending).toHaveBeenCalledWith("topology:1");
    expect(cache.publish).toHaveBeenCalledWith("topology:2", { revision: 2, topology: topology(2) });
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("clears the pending marker and preserves the synchronous fallback on failure", async () => {
    const adapter = new ControlledAdapter();
    const frames = createFrames();
    const onFailure = vi.fn();
    const cache: LandTopologyProjectionCache = {
      markPending: vi.fn(),
      publish: vi.fn(),
      clearPending: vi.fn()
    };
    const scheduler = new LandTopologyProjectionScheduler({
      adapter,
      frames,
      source: {
        getSignature: () => "topology:1",
        buildRequest: () => ({ revision: 1, geometry: [] })
      },
      cache,
      onReady: vi.fn(),
      onFailure
    });

    scheduler.schedule();
    frames.flush();
    adapter.reject(0, "worker failed");
    await Promise.resolve();
    await Promise.resolve();

    expect(cache.clearPending).toHaveBeenCalledWith("topology:1");
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ message: "worker failed" }));
  });
});
