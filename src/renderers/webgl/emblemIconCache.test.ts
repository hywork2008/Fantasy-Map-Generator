import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../context/appServices";
import type { Emblem } from "../../types/emblem";
import { clearEmblemIconCache, getCachedEmblemIconUrl, getEmblemIconCacheVersion } from "./emblemIconCache";

function createAppServices(renderIconDataUrl: (id: string, coa: unknown) => Promise<string | null>): AppServices {
  return {
    rng: {} as AppServices["rng"],
    storage: {} as AppServices["storage"],
    COArenderer: {
      trigger: vi.fn(),
      shieldPaths: {},
      renderIconDataUrl
    }
  };
}

describe("emblemIconCache", () => {
  const coa: Emblem = { t1: "azure" };

  beforeEach(() => {
    clearEmblemIconCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null on first call, then resolves asynchronously and dispatches a ready event", async () => {
    const appServices = createAppServices(async () => "data:image/svg+xml,fake");
    const listener = vi.fn();
    document.addEventListener("fmg:webgl-emblem-icon-ready", listener);

    expect(getCachedEmblemIconUrl("state-1", coa, appServices)).toBeNull();

    await vi.waitFor(() => {
      expect(getCachedEmblemIconUrl("state-1", coa, appServices)).toBe("data:image/svg+xml,fake");
    });
    expect(listener).toHaveBeenCalledTimes(1);

    document.removeEventListener("fmg:webgl-emblem-icon-ready", listener);
  });

  it("does not kick off a second render while one is already pending for the same id/coa", () => {
    const render = vi.fn(async () => "data:image/svg+xml,fake");
    const appServices = createAppServices(render);

    getCachedEmblemIconUrl("state-1", coa, appServices);
    getCachedEmblemIconUrl("state-1", coa, appServices);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("treats a changed coa under the same id as a cache miss instead of serving a stale icon", async () => {
    const appServices = createAppServices(async (_id, passedCoa) =>
      (passedCoa as Emblem).t1 === "azure" ? "url-azure" : "url-gules"
    );

    getCachedEmblemIconUrl("state-1", coa, appServices);
    await vi.waitFor(() => {
      expect(getCachedEmblemIconUrl("state-1", coa, appServices)).toBe("url-azure");
    });

    const newCoa: Emblem = { t1: "gules" };
    expect(getCachedEmblemIconUrl("state-1", newCoa, appServices)).toBeNull();
    await vi.waitFor(() => {
      expect(getCachedEmblemIconUrl("state-1", newCoa, appServices)).toBe("url-gules");
    });
  });

  it("returns null without crashing when COArenderer or coa is unavailable", () => {
    const appServices = { rng: {} as AppServices["rng"], storage: {} as AppServices["storage"], COArenderer: null };
    expect(getCachedEmblemIconUrl("state-1", coa, appServices)).toBeNull();
    expect(getCachedEmblemIconUrl("state-1", null, createAppServices(vi.fn()))).toBeNull();
  });

  it("returns null for a custom coa without invoking the renderer", () => {
    const render = vi.fn();
    const appServices = createAppServices(render);
    expect(getCachedEmblemIconUrl("state-1", { t1: "azure", custom: true }, appServices)).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it("increments the cache version only once an icon resolves", async () => {
    const before = getEmblemIconCacheVersion();
    const appServices = createAppServices(async () => "data:image/svg+xml,fake");

    getCachedEmblemIconUrl("state-2", coa, appServices);
    expect(getEmblemIconCacheVersion()).toBe(before);

    await vi.waitFor(() => {
      expect(getEmblemIconCacheVersion()).toBe(before + 1);
    });
  });
});
