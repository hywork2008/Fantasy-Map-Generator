import { describe, expect, it } from "vitest";
import { normalizeMapExportCloneStyles } from "./export";

describe("normalizeMapExportCloneStyles", () => {
  it("strips withOffscreenSvgExport parking styles so the SVG can rasterize in-frame", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "map";
    svg.setAttribute("data-fmg-offscreen-export", "true");
    svg.style.position = "fixed";
    svg.style.left = "-100000px";
    svg.style.top = "0";
    svg.style.visibility = "hidden";
    svg.style.pointerEvents = "none";

    normalizeMapExportCloneStyles(svg);

    expect(svg.hasAttribute("data-fmg-offscreen-export")).toBe(false);
    expect(svg.style.position).toBe("static");
    expect(svg.style.left).toBe("auto");
    expect(svg.style.top).toBe("auto");
    expect(svg.style.visibility).toBe("visible");
    expect(svg.style.pointerEvents).toBe("auto");
  });
});
