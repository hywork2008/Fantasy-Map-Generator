import { afterEach, expect, it, vi } from "vitest";
import type { DistrictFabric } from "../generators/blockInfill.types";
import type { CityDocument } from "../types/document";
import { startRuralFields } from "./ruralFieldWorkerClient";

class FakeWorker {
  static latest: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.latest = this;
  }
}
const document = {} as CityDocument;
const fabric = { buildings: [], farms: [], lanes: [], entrances: new Map() } as DistrictFabric;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("terminates optional work at its deadline and ignores a late result", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const run = startRuralFields(document, fabric);
  const worker = FakeWorker.latest;
  await vi.advanceTimersByTimeAsync(2000);
  expect(await run.result).toBeNull();
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.onmessage?.({ data: { overlay: fabric } });
  expect(await run.result).toBeNull();
});

it("cancels pending work and releases its worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const run = startRuralFields(document, fabric);
  run.cancel();
  expect(await run.result).toBeNull();
  expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});

it("returns completed geometry and releases its worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const run = startRuralFields(document, fabric);
  const overlay = { farms: [], lanes: [] };
  FakeWorker.latest.onmessage?.({ data: { overlay } });
  expect(await run.result).toEqual(overlay);
  expect(FakeWorker.latest.postMessage).toHaveBeenCalledWith({ document, fabric });
  expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
});

it("skips optional scenery when workers are unavailable", async () => {
  vi.stubGlobal("Worker", undefined);
  expect(await startRuralFields(document, fabric).result).toBeNull();
});
