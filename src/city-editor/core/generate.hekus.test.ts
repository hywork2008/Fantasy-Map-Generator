import { describe, expect, it } from "vitest";
import { featureGroupVertices } from "./features";
import hekus from "./fixtures/hekus-ui-request-20261007.json";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import { generateCityOnDocument } from "./generate";
import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument, Point } from "./types";

describe("castle placement beside the road corridors", () => {
  // Hekus: the shore-corner castle used to seal the only land approach to a
  // gate, so attempts failed with unconnected gates. With corridors and gate
  // sectors planned first (castle-road-siting-order.md), attempt 1 succeeds.
  it("places the castle on the first attempt without blocking a road", () => {
    const samples: GenerationSample[] = [];
    const city = generateCityOnDocument(
      structuredClone(hekus.document) as unknown as CityDocument,
      hekus.settings as never,
      hekus.seed,
      sample => samples.push(sample)
    );
    expect(city).not.toBeNull();
    expect(city!.castles).toHaveLength(1);
    expect(samples.filter(s => s.failure).map(s => s.failure!.reason)).toEqual([]);
  });
});
