import { afterEach, describe, expect, it, vi } from "vitest";
import { createVectorDocument } from "../generators/vector/document";
import { startVectorEdit, type VectorEditReply, type VectorEditRequest } from "./vectorEditWorkerClient";

class FakeWorker {
  onmessage: ((event: MessageEvent<VectorEditReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  request!: VectorEditRequest;
  terminate = vi.fn();
  postMessage(value: VectorEditRequest) {
    this.request = value;
  }
}
afterEach(() => vi.useRealTimers());
describe("vector edit jobs", () => {
  it("matches job id and input revision, terminates after completion and ignores other replies", async () => {
    const fake = new FakeWorker(),
      doc = createVectorDocument(),
      job = startVectorEdit(doc, doc, () => fake as unknown as Worker),
      reply = {
        document: doc,
        impact: {
          changedPaths: [],
          changedPlacements: [],
          changedConnections: false,
          relocatedPlacements: [],
          retainedPlacements: [],
          removedLanes: [],
          affectedBlocks: []
        }
      };
    fake.onmessage!({
      data: { id: fake.request.id + 1, inputRevision: 0, result: reply }
    } as MessageEvent<VectorEditReply>);
    expect(fake.terminate).not.toHaveBeenCalled();
    fake.onmessage!({
      data: { id: fake.request.id, inputRevision: 1, result: reply }
    } as MessageEvent<VectorEditReply>);
    expect(fake.terminate).not.toHaveBeenCalled();
    fake.onmessage!({
      data: { id: fake.request.id, inputRevision: 0, result: reply }
    } as MessageEvent<VectorEditReply>);
    expect(await job.result).toEqual(reply);
    expect(fake.terminate).toHaveBeenCalledOnce();
    expect(fake.onmessage).toBeNull();
  });
  it("cancels immediately even if a geometry loop has not finished", async () => {
    const fake = new FakeWorker(),
      doc = createVectorDocument(),
      job = startVectorEdit(doc, doc, () => fake as unknown as Worker);
    job.cancel();
    job.cancel();
    expect(await job.result).toBeNull();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });
  it("reports worker failures and bounded timeouts without returning a candidate", async () => {
    vi.useFakeTimers();
    const fake = new FakeWorker(),
      doc = createVectorDocument(),
      job = startVectorEdit(doc, doc, () => fake as unknown as Worker);
    const result = expect(job.result).rejects.toThrow("dependency-timeout");
    await vi.advanceTimersByTimeAsync(60000);
    await result;
    expect(fake.terminate).toHaveBeenCalledOnce();
  });
});
