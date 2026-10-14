import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import descriptor from "../city-editor/data/fixtures/atheiate-20261003.json";
import { CITY_SITE_KEY, readIncomingCity } from "../city-editor/services/io/incomingCity";
import { openCityEditorForBurg } from "./city-editor-handshake";

const mocks = vi.hoisted(() => ({ descriptor: null as unknown, describe: vi.fn(), open: vi.fn(), tip: vi.fn() }));
vi.mock("../services/burgSiteDescriptor", () => ({
  getBurgSiteDescriptor: (id: number) => {
    mocks.describe(id);
    return mocks.descriptor;
  }
}));
vi.mock("../services/tooltipService", () => ({ tip: mocks.tip }));
vi.mock("../utils", () => ({ openURL: mocks.open }));
beforeEach(() => {
  mocks.descriptor = descriptor;
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("FMG → CE independent-page handoff", () => {
  it("opens the CE entry after stashing a descriptor that CE can read", () => {
    expect(openCityEditorForBurg(42)).toBe(true);
    expect(mocks.describe).toHaveBeenCalledWith(42);
    expect(mocks.open).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}city-editor/`);
    expect(JSON.parse(sessionStorage.getItem(CITY_SITE_KEY)!)).toEqual(descriptor);
    const incoming = readIncomingCity();
    expect(incoming?.origin).toBe("world");
    expect(incoming?.share.seed).toBe(descriptor.burg.seed);
    expect(incoming?.share.descriptor?.burg.id).toBe(descriptor.burg.id);
  });
  it("does not open a tab if the source burg has no descriptor", () => {
    mocks.descriptor = null;
    expect(openCityEditorForBurg(42)).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CITY_SITE_KEY)).toBeNull();
    expect(mocks.tip).toHaveBeenCalledOnce();
  });
  it("does not open a tab when session storage rejects the handoff", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(openCityEditorForBurg(42)).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.tip).toHaveBeenCalledOnce();
  });
});
