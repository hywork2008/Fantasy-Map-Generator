import { describe, expect, it } from "vitest";
import { BUILDING_PALETTES } from "./palette";
import {
  type BuildingAppearanceInput,
  normalizeBuildingAppearanceContext,
  regionalRoofMaterial,
  resolveBuildingAppearance
} from "./resolver";

const input: BuildingAppearanceInput = {
  version: 1,
  context: normalizeBuildingAppearanceContext({ tradition: "norse", period: "highMedieval", biome: { key: "taiga" } }),
  seed: "appearance-test",
  stableLotId: "house",
  blockId: "block",
  rural: true,
  rich: false,
  wall: "timber-frame",
  roof: "thatch"
};

describe("building appearance resolver", () => {
  it("keeps Mediterranean limewash distinct from exposed northern timber framing", () => {
    const south = resolveBuildingAppearance({ ...input, profile: "mediterranean" })!;
    expect(south.wallFinish).toBe("limewash");
    expect(south.framePaletteId).toBeUndefined();
    const north = resolveBuildingAppearance({ ...input, profile: "northern-urban", rural: false })!;
    expect(north.wallFinish).toBe("plaster-infill");
    expect(north.framePaletteId).toBeDefined();
  });
  it("keeps low-pitch and out-of-period roofs and fits plant coverings to the existing pitch", () => {
    expect(regionalRoofMaterial({ ...input, profile: "mediterranean", roof: "lead" }, 2)).toBe("lead");
    expect(
      regionalRoofMaterial({ ...input, context: { ...input.context, period: "steamEra" }, roof: "slate" }, 40)
    ).toBe("slate");
    for (let i = 0; i < 20; i++) {
      const roof = regionalRoofMaterial({ ...input, stableLotId: `roof-${i}` }, 32);
      expect(roof).not.toBe("thatch");
      expect(regionalRoofMaterial({ ...input, profile: "mediterranean" }, 48)).toBe("tile");
    }
  });
  it("separates boarded timber from infill and retains a separate frame palette", () => {
    const rural = resolveBuildingAppearance(input)!;
    expect(rural.profileId).toBe("northern-wooded");
    expect(rural.wallFinish).toBe("timber-boarding");
    expect(rural.framePaletteId).toBeUndefined();
    const urban = resolveBuildingAppearance({ ...input, rural: false })!;
    expect(urban.profileId).toBe("northern-urban");
    expect(urban.wallFinish).toBe("plaster-infill");
    expect(urban.framePaletteId).toBe("northern-frame");
    expect(urban.wallPaletteId).not.toBe(urban.framePaletteId);
  });

  it("does not infer a forest from cold weather, or geography from a localized display name", () => {
    const context = normalizeBuildingAppearanceContext({
      tradition: "norse",
      temperatureC: -4,
      biome: { key: "tundra" }
    });
    expect(context.forest).toBe(false);
    expect(resolveBuildingAppearance({ ...input, context })?.wallFinish).toBe("plaster-infill");
    expect(normalizeBuildingAppearanceContext({ temperatureC: Number.NaN }).temperatureC).toBeUndefined();
  });

  it("distinguishes northern orthodox traditions from Mediterranean traditions", () => {
    const northern = resolveBuildingAppearance({
      ...input,
      context: normalizeBuildingAppearanceContext({ tradition: "ruthenian" })
    });
    const southern = resolveBuildingAppearance({
      ...input,
      context: normalizeBuildingAppearanceContext({ tradition: "hellenic" }),
      roof: "tile"
    });
    expect(northern?.profileId).toBe("northern-wooded");
    expect(southern?.profileId).toBe("mediterranean");
    expect(southern?.roofPaletteId).toBe("terracotta");
  });

  it.each([undefined, "japanese", "sylvanElven", "toString"])(
    "keeps unsupported tradition %s on legacy colors",
    tradition => {
      const result = resolveBuildingAppearance({
        ...input,
        context: normalizeBuildingAppearanceContext({ tradition })
      });
      expect(result?.profileId).toBe("legacy");
      expect(result?.roofPaletteId).toBe("legacy-thatch");
      expect(result?.wallFinish).toBe("legacy");
    }
  );

  it("honors an explicit profile even for an unsupported culture or an urban lot", () => {
    const result = resolveBuildingAppearance({
      ...input,
      rural: false,
      profile: "stone-upland",
      roof: "slate",
      wall: "stone",
      context: normalizeBuildingAppearanceContext({ tradition: "japanese" })
    });
    expect(result?.profileId).toBe("stone-upland");
    expect(result?.roofPaletteId).toBe("local-stone-roof");
    expect(result?.wallPaletteId).toBe("upland-stone");
  });

  it("is opt-in, deterministic and supplies valid sRGB swatches for every material", () => {
    expect(resolveBuildingAppearance({ ...input, version: undefined })).toBeUndefined();
    expect(resolveBuildingAppearance({ ...input, version: 2 })).toBeUndefined();
    for (const roof of ["tile", "thatch", "slate", "shingle", "lead", "turf"] as const) {
      const a = resolveBuildingAppearance({ ...input, roof })!;
      expect(a).toEqual(resolveBuildingAppearance({ ...input, roof }));
      expect(BUILDING_PALETTES[a.roofPaletteId][a.shadeBin]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
