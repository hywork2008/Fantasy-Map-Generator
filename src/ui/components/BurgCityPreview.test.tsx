import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CityDocument } from "../../city-editor/core/types";
import type { BurgData } from "../../store/burgEditorState";
import { BurgCityPreview } from "./BurgCityPreview";

const mocks = vi.hoisted(() => ({
  jobs: [] as Array<{ resolve: (city: CityDocument | null) => void; cancel: ReturnType<typeof vi.fn> }>,
  serialize: vi.fn(() => "<svg/>"),
  revision: "one"
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../controllers/burg-editor", () => ({ burgEditorActions: { openCityEditor: vi.fn() } }));
vi.mock("../../services/burgSiteDescriptor", () => ({
  getBurgSiteDescriptor: (id: number) => ({ burg: { id, seed: "same" }, revision: mocks.revision })
}));
vi.mock("../../city-editor/io/incomingCity", () => ({
  parseDescriptor: JSON.parse,
  shareFromDescriptor: (descriptor: unknown) => ({ seed: "same", size: "small", grid: "evolution", descriptor })
}));
vi.mock("../../city-editor/core/document", () => ({
  createGridDocument: () => ({}),
  descriptorFrameGridOptions: () => ({})
}));
vi.mock("../../city-editor/core/generate", () => ({ defaultGenerationSettings: () => ({}) }));
vi.mock("../../city-editor/core/generationWorkerClient", () => ({
  startCityGeneration: () => {
    let resolve!: (city: CityDocument | null) => void;
    const result = new Promise<CityDocument | null>(r => {
      resolve = r;
    });
    const cancel = vi.fn();
    mocks.jobs.push({ resolve, cancel });
    return { result, cancel };
  }
}));
vi.mock("../../city-editor/render/previewSvg", () => ({ serializeCityPreviewSvg: mocks.serialize }));
vi.mock("./CityPreviewViewport", () => ({
  CityPreviewViewport: ({ url }: { url: string }) => <img src={url} alt="preview" />
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let createUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;
const city = { mesh: { faces: {} } } as CityDocument;
async function render(id: number) {
  await act(async () => {
    root.render(<BurgCityPreview burgData={{ id } as BurgData} />);
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
beforeEach(() => {
  mocks.jobs.length = 0;
  mocks.revision = "one";
  mocks.serialize.mockClear();
  createUrl = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  revokeUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("cancels old requests, ignores their completion, and releases displayed URLs", async () => {
  await render(1);
  await render(2);
  expect(mocks.jobs).toHaveLength(2);
  expect(mocks.jobs[0].cancel).toHaveBeenCalledOnce();
  await act(async () => mocks.jobs[0].resolve(city));
  expect(createUrl).not.toHaveBeenCalled();
  await act(async () => mocks.jobs[1].resolve(city));
  expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:first");
  await render(3);
  expect(revokeUrl).toHaveBeenCalledWith("blob:first");
  await act(async () => mocks.jobs[2].resolve(city));
  await act(async () => root.unmount());
  expect(revokeUrl).toHaveBeenCalledWith("blob:second");
});
it("uses the full snapshot key, ignores object identity changes and regenerates changed inputs", async () => {
  await render(1);
  await render(1);
  expect(mocks.jobs).toHaveLength(1);
  mocks.revision = "two";
  await render(1);
  expect(mocks.jobs).toHaveLength(2);
  expect(mocks.jobs[0].cancel).toHaveBeenCalledOnce();
});
it("retries the same failed input", async () => {
  await render(1);
  await act(async () => mocks.jobs[0].resolve(null));
  const retry = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("previewRetry"))!;
  expect(retry).toBeTruthy();
  await act(async () => retry.click());
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(mocks.jobs).toHaveLength(2);
  await act(async () => mocks.jobs[1].resolve(city));
  expect(host.querySelector("img")).not.toBeNull();
});
