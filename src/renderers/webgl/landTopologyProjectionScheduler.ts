import type {
  AsyncLandTopologyProjectionAdapter,
  LandTopologyProjectionRequest
} from "./landTopologyProjectionWorkerAdapter";

export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface LandTopologyProjectionSource {
  /** O(1) under WorldRuntime topic revisions; used before scheduling a WebGL redraw. */
  getSignature(): string;
  /** Builds the serializable geometry only for the latest rAF-coalesced request. */
  buildRequest(): LandTopologyProjectionRequest;
}

export interface LandTopologyProjectionCache {
  markPending(signature: string): void;
  publish(signature: string, result: Awaited<ReturnType<AsyncLandTopologyProjectionAdapter["project"]>>): void;
  clearPending(signature: string): void;
}

export interface LandTopologyProjectionSchedulerOptions {
  readonly adapter: AsyncLandTopologyProjectionAdapter;
  readonly source: LandTopologyProjectionSource;
  readonly cache: LandTopologyProjectionCache;
  readonly onReady: () => void;
  readonly onFailure: (error: unknown) => void;
  readonly frames?: AnimationFrameScheduler;
}

/**
 * Coalesces topology/physical commits to one job per animation frame. A job's
 * result is published only while it still represents the latest signature;
 * failures clear the pending marker so the synchronous cache fallback remains
 * available on the next WebGL redraw.
 */
export class LandTopologyProjectionScheduler {
  private readonly frames: AnimationFrameScheduler;
  private queuedSignature: string | null = null;
  private frameHandle: number | null = null;
  private disposed = false;

  constructor(private readonly options: LandTopologyProjectionSchedulerOptions) {
    this.frames = options.frames ?? browserAnimationFrames;
  }

  schedule(): void {
    if (this.disposed) return;
    const nextSignature = this.options.source.getSignature();
    if (this.queuedSignature && this.queuedSignature !== nextSignature) {
      this.options.cache.clearPending(this.queuedSignature);
    }
    this.queuedSignature = nextSignature;
    this.options.cache.markPending(nextSignature);
    if (this.frameHandle !== null) return;
    this.frameHandle = this.frames.request(() => this.run());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle !== null) this.frames.cancel(this.frameHandle);
    if (this.queuedSignature) this.options.cache.clearPending(this.queuedSignature);
    this.frameHandle = null;
    this.queuedSignature = null;
    this.options.adapter.dispose();
  }

  private run(): void {
    this.frameHandle = null;
    const signature = this.queuedSignature;
    if (!signature || this.disposed) return;
    this.queuedSignature = null;

    // buildRequest() walks the current pack/vertices synchronously; a malformed intermediate
    // edit state throwing here must still release the pending marker, or getCachedLandTopology()
    // would defer to this signature's (never-arriving) async result forever.
    let request: LandTopologyProjectionRequest;
    try {
      request = this.options.source.buildRequest();
    } catch (error) {
      this.options.cache.clearPending(signature);
      this.options.onFailure(error);
      return;
    }
    void this.options.adapter
      .project(request)
      .then(result => {
        if (this.disposed || this.queuedSignature) {
          this.options.cache.clearPending(signature);
          return;
        }
        this.options.cache.publish(signature, result);
        this.options.onReady();
      })
      .catch(error => {
        this.options.cache.clearPending(signature);
        if (!this.disposed) this.options.onFailure(error);
      });
  }
}

const browserAnimationFrames: AnimationFrameScheduler = {
  request: callback => requestAnimationFrame(callback),
  cancel: handle => cancelAnimationFrame(handle)
};
