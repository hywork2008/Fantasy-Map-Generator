import { describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/index";
import { createGridDocument } from "../generators/document";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { captureGenerationDebugPreview } from "../generators/generationDebug";
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
  it("forwards opt-in processing timings without storing them in the city", async () => {
    const { worker, document, job } = fixture();
    job.cancel();
    await job.result.catch(() => {});
    const onTimings = vi.fn();
    const breakdown = [{ path: "population-prepare", parent: null, depth: 0, calls: 1, elapsedMs: 5, selfMs: 5 }];
    const profiled = startCityGeneration(
      { document, settings: defaultGenerationSettings(), seed: "worker", profile: true },
      () => {},
      () => worker,
      undefined,
      onTimings
    );
    expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ profile: true }));
    worker.onmessage!({
      data: {
        type: "complete",
        document,
        timing: { structureMs: 10, postedAt: performance.timeOrigin + performance.now(), breakdown }
      }
    } as MessageEvent);
    expect(await profiled.result).toBe(document);
    expect(onTimings).toHaveBeenCalledWith(expect.objectContaining({ structureMs: 10, breakdown }));
    expect(document).not.toHaveProperty("breakdown");
  });
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
  it("delivers a failure checkpoint only when debugging is enabled", async () => {
    for (const enabled of [false, true]) {
      const { worker, document, job } = fixture();
      job.cancel();
      await job.result.catch(() => {});
      const onPreview = vi.fn();
      const preview = captureGenerationDebugPreview(
        document,
        {
          phase: "urban",
          elapsedMs: 0,
          attempt: 8,
          failure: { reason: "urban-area-too-small", message: "too small" }
        },
        "worker:junction-retry:7"
      );
      const debugJob = startCityGeneration(
        { document, settings: defaultGenerationSettings(), seed: "worker", debugFailure: enabled },
        () => {},
        () => worker,
        onPreview
      );
      worker.onmessage!({ data: { type: "complete", document: null, failurePreview: preview } } as MessageEvent);
      expect(await debugJob.result).toBeNull();
      expect(onPreview).toHaveBeenCalledTimes(Number(enabled));
    }
  });
});

describe("generation worker language", () => {
  it("passes the selected UI language to the worker", async () => {
    const originalLanguage = i18n.language;
    try {
      for (const language of ["en", "ja"] as const) {
        await i18n.changeLanguage(language);
        const { worker, job } = fixture();
        expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ language }));
        job.cancel();
        await job.result.catch(() => {});
      }
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });
});
