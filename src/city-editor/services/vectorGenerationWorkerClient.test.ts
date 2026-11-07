import { afterEach, describe, expect, it, vi } from "vitest";
import { createVectorDocument } from "../generators/vector/document";
import { DEFAULT_VECTOR_GENERATION } from "../generators/vector/generation/pipeline";
import {
  startVectorGeneration,
  type VectorGenerationReply,
  type VectorGenerationRequest
} from "./vectorGenerationWorkerClient";

class FakeWorker {
  onmessage: ((event: MessageEvent<VectorGenerationReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  request!: VectorGenerationRequest;
  terminate = vi.fn();
  postMessage(request: VectorGenerationRequest) {
    this.request = request;
  }
}
afterEach(() => vi.useRealTimers());
describe("generation worker ownership", () => {
  it("rejects foreign revisions, settles once and terminates on cancel or success", async () => {
    const doc = createVectorDocument(),
      worker = new FakeWorker(),
      job = startVectorGeneration(
        doc,
        { kind: "skeleton", settings: DEFAULT_VECTOR_GENERATION },
        () => worker as unknown as Worker
      ),
      reply = { document: doc, stages: [] };
    worker.onmessage!({
      data: { id: worker.request.id, inputRevision: doc.revision + 1, result: reply }
    } as MessageEvent<VectorGenerationReply>);
    expect(worker.terminate).not.toHaveBeenCalled();
    const late = worker.onmessage!;
    job.cancel();
    expect(await job.result).toBeNull();
    late({ data: { ...worker.request, result: reply } } as MessageEvent<VectorGenerationReply>);
    expect(worker.terminate).toHaveBeenCalledOnce();
    const other = new FakeWorker(),
      completed = startVectorGeneration(
        doc,
        { kind: "skeleton", settings: DEFAULT_VECTOR_GENERATION },
        () => other as unknown as Worker
      );
    other.onmessage!({
      data: { id: other.request.id, inputRevision: doc.revision, result: reply }
    } as MessageEvent<VectorGenerationReply>);
    expect(await completed.result).toEqual(reply);
    expect(other.terminate).toHaveBeenCalledOnce();
  });
  it("cleans up timeouts, message decode errors and postMessage failures without a partial candidate", async () => {
    vi.useFakeTimers();
    const doc = createVectorDocument(),
      worker = new FakeWorker(),
      job = startVectorGeneration(
        doc,
        { kind: "skeleton", settings: DEFAULT_VECTOR_GENERATION },
        () => worker as unknown as Worker
      );
    const rejected = expect(job.result).rejects.toThrow("generation-timeout");
    await vi.advanceTimersByTimeAsync(60000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const bad = new FakeWorker(),
      broken = startVectorGeneration(
        doc,
        { kind: "skeleton", settings: DEFAULT_VECTOR_GENERATION },
        () => bad as unknown as Worker
      );
    bad.onmessageerror!();
    await expect(broken.result).rejects.toThrow("generation-worker");
    expect(bad.terminate).toHaveBeenCalledOnce();
    const clone = new FakeWorker();
    clone.postMessage = () => {
      throw Error("clone");
    };
    const failure = startVectorGeneration(
      doc,
      { kind: "skeleton", settings: DEFAULT_VECTOR_GENERATION },
      () => clone as unknown as Worker
    );
    await expect(failure.result).rejects.toThrow("clone");
    expect(clone.terminate).toHaveBeenCalledOnce();
  });
});
