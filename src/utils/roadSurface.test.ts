import { describe, expect, it } from "vitest";
import {
  classifyRoadSurface,
  classifyRouteSurface,
  type RoadPlace,
  type RoadSurfaceQuery,
  roadMeans,
  roadSphere
} from "./roadSurface";

function query(partial: Partial<RoadSurfaceQuery> & Pick<RoadSurfaceQuery, "period" | "sphere" | "means" | "place">) {
  return classifyRoadSurface({
    group: "local",
    wetland: false,
    upland: false,
    dry: false,
    stoneRoads: "unknown",
    ...partial
  });
}

function places(partial: Omit<Parameters<typeof query>[0], "place">): Record<RoadPlace, ReturnType<typeof query>> {
  return {
    trail: query({ ...partial, place: "trail" }),
    highway: query({ ...partial, place: "highway" }),
    arterial: query({ ...partial, place: "arterial" }),
    street: query({ ...partial, place: "street" }),
    civic: query({ ...partial, place: "civic" })
  };
}

describe("roadSphere and roadMeans", () => {
  it("keeps classical paving inside antiquity and drops a later roman town to latin", () => {
    expect(roadSphere("roman", "european", "latinCatholic", "classicalAntiquity")).toBe("classical");
    expect(roadSphere("hellenic", null, null, "lateAntiquity")).toBe("classical");
    expect(roadSphere("roman", "classical", "latinCatholic", "earlyMedieval")).toBe("latin");
    expect(roadSphere("gallic", null, null, "classicalAntiquity")).toBe("latin");
    expect(roadSphere("turkic", null, "sunni", "highMedieval")).toBe("islamic");
    expect(roadSphere("turkic", null, "tengri", "highMedieval")).toBe("steppe");
    expect(roadSphere("elven", "classical", null, "classicalAntiquity")).toBe("classical");
    expect(roadSphere("elven", "fantastic", null, "highMedieval")).toBe("earthwork");
    expect(roadSphere("dwarven", "european", null, "lateMedieval")).toBe("latin");
    expect(roadSphere(null, null, null, "ageOfExploration")).toBe("earthwork");
    expect(roadSphere("not-a-tradition", "european", null, "highMedieval")).toBe("earthwork");
  });

  it("ranks capital, population, and commerce into three means", () => {
    expect(roadMeans({ population: 800, commerceRank: 0.1, capital: false, marketCenter: false })).toBe("poor");
    expect(roadMeans({ population: 2000, commerceRank: 0.2, capital: false, marketCenter: false })).toBe("middling");
    expect(roadMeans({ population: 100, commerceRank: 0.35, capital: false, marketCenter: false })).toBe("middling");
    expect(roadMeans({ population: 100, commerceRank: null, capital: false, marketCenter: true })).toBe("middling");
    expect(roadMeans({ population: 100, commerceRank: 0.66, capital: false, marketCenter: false })).toBe("rich");
    expect(roadMeans({ population: 8000, commerceRank: 0, capital: false, marketCenter: false })).toBe("rich");
    expect(roadMeans({ population: 10, commerceRank: 0, capital: true, marketCenter: false })).toBe("rich");
  });
});

describe("classifyRoadSurface", () => {
  it("keeps a poor early medieval European town on earth, and wetlands only on trails", () => {
    const sphere = roadSphere("anglo", null, null, "earlyMedieval");
    const means = roadMeans({ population: 800, commerceRank: 0.1, capital: false, marketCenter: false });
    expect(sphere).toBe("latin");
    expect(means).toBe("poor");
    const town = places({ period: "earlyMedieval", sphere, means, group: "roads" });
    expect(town.highway).toEqual({ id: "earth", maintainer: "none" });
    expect(town.arterial).toEqual({ id: "earth", maintainer: "none" });
    expect(town.street).toEqual({ id: "earth", maintainer: "none" });
    expect(town.civic).toEqual({ id: "earth", maintainer: "none" });
    expect(query({ period: "earlyMedieval", sphere, means, place: "trail", group: "trails" })).toEqual({
      id: "track",
      maintainer: "none"
    });
    expect(query({ period: "earlyMedieval", sphere, means, place: "trail", group: "trails", wetland: true })).toEqual({
      id: "corduroy",
      maintainer: "none"
    });
    expect(query({ period: "earlyMedieval", sphere, means, place: "highway", group: "roads", wetland: true }).id).toBe(
      "corduroy"
    );
  });

  it("paves a rich late medieval street with setts and leaves the highway as gravel", () => {
    const sphere = roadSphere("gallic", null, null, "lateMedieval");
    const means = roadMeans({ population: 12_000, commerceRank: 0.8, capital: true, marketCenter: false });
    expect(means).toBe("rich");
    const late = places({ period: "lateMedieval", sphere, means, group: "roads" });
    expect(late.highway).toEqual({ id: "gravel", maintainer: "none" });
    expect(late.arterial).toEqual({ id: "setts", maintainer: "frontager" });
    expect(late.street).toEqual({ id: "earth", maintainer: "none" });
    expect(late.civic).toEqual({ id: "setts", maintainer: "frontager" });
    expect(query({ period: "lateMedieval", sphere, means, place: "trail", group: "trails" }).id).toBe("track");
    const explore = places({ period: "ageOfExploration", sphere, means, group: "roads" });
    expect(explore.highway.id).toBe("gravel");
    expect(explore.arterial.id).toBe("setts");
    expect(query({ period: "maritimeEra", sphere, means, place: "highway", group: "roads" })).toEqual({
      id: "gravel",
      maintainer: "none"
    });
    expect(query({ period: "lateMedieval", sphere, means, place: "highway", group: "roads", wetland: true }).id).toBe(
      "gravel"
    );
  });

  it("gives a Roman capital gravel outside, setts inside, and flags on the civic axis", () => {
    const sphere = roadSphere("roman", "classical", "latinCatholic", "classicalAntiquity");
    const means = roadMeans({ population: 50_000, commerceRank: null, capital: true, marketCenter: false });
    expect(sphere).toBe("classical");
    expect(means).toBe("rich");
    expect(query({ period: "classicalAntiquity", sphere, means, place: "highway", group: "roads" })).toEqual({
      id: "gravel",
      maintainer: "state"
    });
    expect(query({ period: "classicalAntiquity", sphere, means, place: "arterial", group: "local" })).toEqual({
      id: "setts",
      maintainer: "frontager"
    });
    expect(query({ period: "classicalAntiquity", sphere, means, place: "street", group: "local" }).id).toBe("setts");
    expect(query({ period: "classicalAntiquity", sphere, means, place: "civic", group: "local" })).toEqual({
      id: "flags",
      maintainer: "state"
    });
  });

  it("drops a middling late-antique town off the rich row and clamps the civic ladder", () => {
    const sphere = roadSphere("hellenic", null, null, "lateAntiquity");
    const means = roadMeans({ population: 3000, commerceRank: 0.2, capital: false, marketCenter: false });
    expect(sphere).toBe("classical");
    expect(means).toBe("middling");
    expect(query({ period: "lateAntiquity", sphere, means, place: "highway" }).id).toBe("earth");
    expect(query({ period: "lateAntiquity", sphere, means, place: "arterial" }).id).toBe("gravel");
    expect(query({ period: "lateAntiquity", sphere, means, place: "street" }).id).toBe("earth");
    expect(query({ period: "lateAntiquity", sphere, means, place: "civic" }).id).toBe("setts");
    expect(query({ period: "classicalAntiquity", sphere: "classical", means: "middling", place: "civic" }).id).toBe(
      "setts"
    );
    expect(
      query({
        period: "earlyMedieval",
        sphere: roadSphere("roman", null, null, "earlyMedieval"),
        means: "rich",
        place: "highway"
      }).id
    ).toBe("earth");
  });

  it("keeps a Gallic town in classical antiquity on earth", () => {
    const town = places({
      period: "classicalAntiquity",
      sphere: roadSphere("gallic", null, null, "classicalAntiquity"),
      means: "rich"
    });
    expect(town.highway.id).toBe("earth");
    expect(town.arterial.id).toBe("earth");
    expect(town.street.id).toBe("earth");
    expect(town.civic.id).toBe("earth");
    expect(query({ period: "highMedieval", sphere: "latin", means: "poor", place: "civic" }).id).toBe("earth");
  });

  it("keeps an East Asian highway as rammed earth and gravels only a rich civic space", () => {
    const sphere = roadSphere("sinitic", null, null, "highMedieval");
    const means = roadMeans({ population: 30_000, commerceRank: null, capital: true, marketCenter: false });
    expect(query({ period: "highMedieval", sphere, means, place: "highway", group: "roads" })).toEqual({
      id: "earth",
      maintainer: "corvee"
    });
    expect(query({ period: "highMedieval", sphere, means, place: "arterial" }).id).toBe("earth");
    expect(query({ period: "highMedieval", sphere, means, place: "street" }).id).toBe("earth");
    expect(query({ period: "highMedieval", sphere, means, place: "civic" }).id).toBe("gravel");
  });

  it("uses setts on a Japanese upland highway and earth on a lowland one, including industry", () => {
    const sphere = roadSphere("japanese", null, null, "ageOfExploration");
    expect(query({ period: "ageOfExploration", sphere, means: "rich", place: "highway", upland: true })).toEqual({
      id: "setts",
      maintainer: "corvee"
    });
    expect(query({ period: "ageOfExploration", sphere, means: "rich", place: "highway", upland: false }).id).toBe(
      "earth"
    );
    expect(query({ period: "ageOfExploration", sphere, means: "rich", place: "arterial", upland: true }).id).toBe(
      "earth"
    );
    expect(
      query({ period: "ageOfExploration", sphere, means: "rich", place: "trail", group: "trails", upland: true }).id
    ).toBe("track");
    expect(
      query({ period: "preIndustrialEra", sphere: "japanese", means: "rich", place: "highway", upland: true }).id
    ).toBe("setts");
    expect(
      query({ period: "preIndustrialEra", sphere: "japanese", means: "rich", place: "highway", upland: false })
    ).toEqual({
      id: "macadam",
      maintainer: "toll"
    });
    expect(query({ period: "steamEra", sphere: "japanese", means: "rich", place: "highway" }).maintainer).toBe("state");
  });

  it("does not pave a trail because the town is large", () => {
    expect(
      query({
        period: "lateMedieval",
        sphere: "latin",
        means: "rich",
        place: "trail",
        group: "trails"
      }).id
    ).toBe("track");
    expect(
      query({
        period: "classicalAntiquity",
        sphere: "classical",
        means: "rich",
        place: "trail",
        group: "trails"
      }).id
    ).toBe("track");
  });

  it("holds west African, Andean, and Islamic surfaces to the written rows", () => {
    expect(query({ period: "lateMedieval", sphere: "westAfrican", means: "rich", place: "civic" }).id).toBe("gravel");
    expect(query({ period: "lateMedieval", sphere: "westAfrican", means: "rich", place: "arterial" }).id).toBe("earth");
    expect(query({ period: "preIndustrialEra", sphere: "westAfrican", means: "rich", place: "highway" }).id).toBe(
      "earth"
    );
    expect(query({ period: "highMedieval", sphere: "andean", means: "rich", place: "highway", dry: true }).id).toBe(
      "earth"
    );
    expect(
      query({ period: "highMedieval", sphere: "andean", means: "rich", place: "highway", dry: true, upland: true }).id
    ).toBe("earth");
    expect(query({ period: "highMedieval", sphere: "andean", means: "rich", place: "highway", upland: true })).toEqual({
      id: "setts",
      maintainer: "corvee"
    });
    expect(query({ period: "highMedieval", sphere: "andean", means: "rich", place: "arterial", upland: true }).id).toBe(
      "setts"
    );
    expect(query({ period: "highMedieval", sphere: "andean", means: "rich", place: "civic", upland: true }).id).toBe(
      "setts"
    );
    expect(
      query({ period: "preIndustrialEra", sphere: "andean", means: "rich", place: "highway", upland: true }).id
    ).toBe("setts");
    expect(query({ period: "preIndustrialEra", sphere: "andean", means: "rich", place: "highway", dry: true }).id).toBe(
      "macadam"
    );
    const islamic = places({ period: "lateMedieval", sphere: "islamic", means: "rich" });
    expect(islamic.arterial.id).toBe("gravel");
    expect(islamic.civic.id).toBe("setts");
    expect(islamic.highway.id).toBe("gravel");
  });

  it("macadamises a rich Latin highway in the pre-industrial era and strips stone when knowledge is absent", () => {
    expect(query({ period: "preIndustrialEra", sphere: "latin", means: "rich", place: "highway" })).toEqual({
      id: "macadam",
      maintainer: "toll"
    });
    expect(query({ period: "preIndustrialEra", sphere: "latin", means: "rich", place: "arterial" }).id).toBe("setts");
    expect(
      query({ period: "preIndustrialEra", sphere: "latin", means: "rich", place: "highway", stoneRoads: "absent" }).id
    ).toBe("earth");
    expect(
      query({ period: "preIndustrialEra", sphere: "latin", means: "rich", place: "arterial", stoneRoads: "absent" }).id
    ).toBe("earth");
    expect(
      query({ period: "preIndustrialEra", sphere: "latin", means: "rich", place: "highway", stoneRoads: "unknown" }).id
    ).toBe("macadam");
    expect(
      query({
        period: "earlyMedieval",
        sphere: "latin",
        means: "poor",
        place: "trail",
        group: "trails",
        wetland: true,
        stoneRoads: "absent"
      }).id
    ).toBe("corduroy");
    expect(query({ period: "preIndustrialEra", sphere: "earthwork", means: "rich", place: "highway" }).id).toBe(
      "macadam"
    );
    expect(query({ period: "preIndustrialEra", sphere: "mesoamerican", means: "poor", place: "highway" }).id).toBe(
      "earth"
    );
  });
});

describe("classifyRouteSurface", () => {
  const base = {
    period: "lateMedieval" as const,
    tradition: "gallic",
    fortification: null,
    faith: null,
    population: 50_000,
    commerceRank: 1,
    capital: true,
    marketCenter: true,
    wetland: false,
    upland: false,
    dry: false,
    stoneRoads: "ready" as const
  };

  it("returns null for railways and sea routes", () => {
    expect(classifyRouteSurface({ ...base, group: "railways", override: "setts" })).toBeNull();
    expect(classifyRouteSurface({ ...base, group: "searoutes" })).toBeNull();
    expect(classifyRouteSurface({ ...base, group: "unknown" })).toBeNull();
  });

  it("honours a known override and ignores an unknown one", () => {
    expect(classifyRouteSurface({ ...base, group: "trails", override: "setts" })).toEqual({
      id: "setts",
      maintainer: "state"
    });
    expect(classifyRouteSurface({ ...base, group: "trails", override: "cobbles" })?.id).toBe("track");
    expect(classifyRouteSurface({ ...base, group: "roads" })?.id).toBe("gravel");
  });
});
