import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../svgRasterize", () => ({
  rasterizeSvgToPngDataUrl: vi.fn(async (svg: string) => `data:image/png;base64,FAKE(${svg.length})`)
}));

import { rasterizeSvgToPngDataUrl } from "../svgRasterize";
import {
  clearBurgIconRasterCache,
  getBurgIconRasterCacheVersion,
  getCachedBurgIconRaster
} from "./burgIconRasterCache";

function defineSymbol(id: string, innerHTML: string): void {
  const ns = "http://www.w3.org/2000/svg";
  const symbol = document.createElementNS(ns, "symbol");
  symbol.setAttribute("id", id);
  symbol.setAttribute("viewBox", "0 0 10 10");
  symbol.innerHTML = innerHTML;
  document.body.appendChild(symbol);
}

describe("burgIconRasterCache", () => {
  beforeEach(() => {
    clearBurgIconRasterCache();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: -5, y: -5, width: 10, height: 10 }) as DOMRect;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null on first call, then resolves and dispatches a ready event for a monochrome glyph", async () => {
    defineSymbol("icon-test-circle", '<circle cx="0" cy="0" r="5" />');
    const listener = vi.fn();
    document.addEventListener("fmg:webgl-burg-icon-ready", listener);

    expect(getCachedBurgIconRaster("#icon-test-circle")).toBeNull();

    await vi.waitFor(() => {
      expect(getCachedBurgIconRaster("#icon-test-circle")).not.toBeNull();
    });

    expect(getCachedBurgIconRaster("#icon-test-circle")?.mask).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener("fmg:webgl-burg-icon-ready", listener);
  });

  it("treats a symbol with its own fill attributes as full-color (mask: false)", async () => {
    defineSymbol("icon-test-picture", '<path fill="#EBE8DF" d="M0 0h10v10h-10z" />');

    getCachedBurgIconRaster("#icon-test-picture");
    await vi.waitFor(() => {
      expect(getCachedBurgIconRaster("#icon-test-picture")).not.toBeNull();
    });

    expect(getCachedBurgIconRaster("#icon-test-picture")?.mask).toBe(false);
  });

  it("does not kick off a second rasterization while one is pending for the same href", () => {
    defineSymbol("icon-test-dup", '<circle cx="0" cy="0" r="5" />');

    getCachedBurgIconRaster("#icon-test-dup");
    getCachedBurgIconRaster("#icon-test-dup");

    expect(vi.mocked(rasterizeSvgToPngDataUrl)).toHaveBeenCalledTimes(1);
  });

  it("returns null and does not throw when the symbol does not exist", () => {
    expect(getCachedBurgIconRaster("#icon-does-not-exist")).toBeNull();
    expect(vi.mocked(rasterizeSvgToPngDataUrl)).not.toHaveBeenCalled();
  });

  it("returns null and does not throw when the symbol's geometry cannot be measured", () => {
    defineSymbol("icon-test-unmeasurable", '<circle cx="0" cy="0" r="5" />');
    (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => {
      throw new Error("not implemented");
    };

    expect(getCachedBurgIconRaster("#icon-test-unmeasurable")).toBeNull();
  });

  it("increments the cache version only once an icon resolves", async () => {
    defineSymbol("icon-test-version", '<circle cx="0" cy="0" r="5" />');
    const before = getBurgIconRasterCacheVersion();

    getCachedBurgIconRaster("#icon-test-version");
    expect(getBurgIconRasterCacheVersion()).toBe(before);

    await vi.waitFor(() => {
      expect(getBurgIconRasterCacheVersion()).toBe(before + 1);
    });
  });
});
