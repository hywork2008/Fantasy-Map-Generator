import { describe, expect, it, vi } from "vitest";
import { createGridDocument } from "./document";
import { defaultGenerationSettings } from "./generate";
import { startCityGeneration } from "./generationWorkerClient";

function fixture() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null
  } as unknown as Worker;
  const document = createGridDocument({ size: "small", grid: "evolution", seed: "worker" });
  const progress = vi.fn();
  const job = startCityGeneration(
    { document, settings: defaultGenerationSettings(), seed: "worker" },
    progress,
    () => worker
  );
  return { worker, document, progress, job };
}
describe("generation worker lifecycle", () => {
  it("reports progress and commits only the completed result, then terminates", async () => {
    const { worker, document, progress, job } = fixture();
    const sample = { phase: "urban", elapsedMs: 5, attempt: 1 };
    worker.onmessage!({ data: { type: "progress", sample } } as MessageEvent);
    expect(progress).toHaveBeenCalledWith(sample);
    worker.onmessage!({ data: { type: "complete", document } } as MessageEvent);
    expect(await job.result).toBe(document);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });
  it("cancels immediately and ignores a queued completion", async () => {
    const { worker, document, progress, job } = fixture();
    const receive = worker.onmessage!;
    const rejected = expect(job.result).rejects.toMatchObject({ name: "AbortError" });
    job.cancel();
    receive.call(worker, { data: { type: "complete", document } } as MessageEvent);
    await rejected;
    expect(progress).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("propagates errors and releases the worker", async () => {
    const { worker, job } = fixture();
    const rejected = expect(job.result).rejects.toThrow("invalid mesh");
    worker.onmessage!({ data: { type: "error", message: "invalid mesh" } } as MessageEvent);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
