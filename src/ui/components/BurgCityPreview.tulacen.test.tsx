import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "../../city-editor/core/generationWorkerClient";
import { cityEditorDocument } from "../../city-editor/core/housingReport";
import { parseDescriptor, shareFromDescriptor } from "../../city-editor/io/incomingCity";
import { worldContext } from "../../context/worldContext";
import { bindSimulationBurgState } from "../../runtime/simulationBurgState";
import { decodeAndValidateWorldArchive } from "../../runtime/worldArchive";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import type { BurgData } from "../../store/burgEditorState";
import { BurgCityPreview } from "./BurgCityPreview";

const mocks = vi.hoisted(() => ({ requests: [] as GenerationRequest[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../controllers/burg-editor", () => ({ burgEditorActions: { openCityEditor: vi.fn() } }));
vi.mock("./CityPreviewViewport", () => ({
  CityPreviewViewport: ({ url }: { url: string }) => <img src={url} alt="preview" />
}));
vi.mock("../../city-editor/core/generationWorkerClient", () => ({
  startCityGeneration: (request: GenerationRequest) => {
    mocks.requests.push(request);
    return {
      result: import("../../city-editor/core/generate").then(({ generateCityOnDocument }) =>
        generateCityOnDocument(request.document, request.settings, request.seed)
      ),
      cancel: vi.fn()
    };
  }
}));

const archive = resolve(import.meta.dirname, "../../../temp/000.savdata/Borteia 2026-10-10-19-11.fmg");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.skipIf(!existsSync(archive))("Tulacen Burg Editor preview", () => {
  it.each([false, true])(
    "matches CE and renders the SVG (FMG placement repaired: %s)",
    async repaired => {
      const buffer = readFileSync(archive);
      const decoded = await decodeAndValidateWorldArchive({
        blob: new Blob([buffer]),
        header: new Uint8Array(buffer.buffer, buffer.byteOffset, 4)
      });
      Object.assign(worldContext, decoded.document.world);
      bindSimulationBurgState(worldContext, decoded.document.simulation);
      if (repaired) {
        const { repairDualPortPlacements } = await import("../../runtime/dualPortPlacementTask");
        await repairDualPortPlacements({ isCurrent: () => true, reportProgress: () => {} });
      }
      const expected = cityEditorDocument(
        shareFromDescriptor(parseDescriptor(JSON.stringify(getBurgSiteDescriptor(2)))!)
      );
      mocks.requests.length = 0;
      const createUrl = vi.fn((_blob: Blob) => "blob:tulacen-preview");
      vi.stubGlobal(
        "URL",
        Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: vi.fn() })
      );
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      vi.spyOn(console, "debug").mockImplementation(() => {});
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      await act(async () => root!.render(<BurgCityPreview burgData={{ id: 2 } as BurgData} />));
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      expect(mocks.requests).toHaveLength(1);
      expect(mocks.requests[0].document.frame).toEqual(expected.frame);
      expect(mocks.requests[0].document.mesh).toEqual(expected.mesh);
      expect(mocks.requests[0].document.biome).toEqual(expected.biome);
      expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:tulacen-preview");
      expect(createUrl).toHaveBeenCalledOnce();
      const svg = new DOMParser().parseFromString(await createUrl.mock.calls[0][0].text(), "image/svg+xml");
      expect(svg.querySelector(".ce-face--sea")).not.toBeNull();
    },
    180000
  );
});
