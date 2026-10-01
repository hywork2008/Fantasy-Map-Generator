import { describe, expect, it, vi } from "vitest";
import { createDocument } from "../core/document";
import { captureGenerationDebugPreview } from "../core/generationDebug";
import { exportCityMap, exportCitySvg, exportGenerationDebugSvg } from "./cityEditorFile";

describe("cityEditorFile export", () => {
  it("exportCityMap creates a JSON blob and triggers download", () => {
    const document = createDocument("export-test", 400);

    const mockCreateObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const mockRevokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    let clickedDownload: string | null = null;
    let clickedHref: string | null = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clickedDownload = this.download;
      clickedHref = this.href;
    };

    try {
      exportCityMap(document);
      expect(mockCreateObjectURL).toHaveBeenCalledOnce();
      expect(clickedDownload).toMatch(/^ce-\d{8}-\d{6}\.json$/);
      expect(clickedHref).toBe("blob:mock-url");
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      mockCreateObjectURL.mockRestore();
      mockRevokeObjectURL.mockRestore();
    }
  });

  it("exportCitySvg creates an SVG blob and triggers download", () => {
    const document = createDocument("export-svg-test", 400);

    const mockCreateObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-svg-url");
    const mockRevokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    let clickedDownload: string | null = null;
    let clickedHref: string | null = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clickedDownload = this.download;
      clickedHref = this.href;
    };

    try {
      exportCitySvg(document);
      expect(mockCreateObjectURL).toHaveBeenCalledOnce();
      expect(clickedDownload).toMatch(/^ce-\d{8}-\d{6}\.svg$/);
      expect(clickedHref).toBe("blob:mock-svg-url");
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      mockCreateObjectURL.mockRestore();
      mockRevokeObjectURL.mockRestore();
    }
  });
  it("downloads the failed checkpoint as a distinctly named SVG", () => {
    const preview = captureGenerationDebugPreview(
      createDocument("failed-export", 400),
      {
        phase: "prepare",
        elapsedMs: 0,
        attempt: 1,
        failure: { reason: "too-few-faces", message: "too few faces" }
      },
      "failed-seed"
    );
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-svg");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let filename = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      filename = this.download;
    });
    try {
      exportGenerationDebugSvg(preview);
      expect(filename).toMatch(/^ce-generation-failure-\d{8}-\d{6}\.svg$/);
      expect(createUrl.mock.calls[0][0].type).toBe("image/svg+xml;charset=utf-8");
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      click.mockRestore();
    }
  });
});
