import { describe, expect, it } from "vitest";
import { featureGroupVertices } from "./features";
import hekus from "./fixtures/hekus-ui-request-20261007.json";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import { generateCityOnDocument } from "./generate";
import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument, Point } from "./types";

describe("castle placement on whole-city retries", () => {
  // Hekus: the top-ranked edge castle sits on the shore corner and its
  // clearance seals the only land approach to a gate. Every retry used to
  // pick the same site, so all eight attempts failed with unconnected gates.
  it("tries another castle site after a rejected attempt", () => {
    const samples: GenerationSample[] = [];
    const city = generateCityOnDocument(
      structuredClone(hekus.document) as unknown as CityDocument,
      hekus.settings as never,
      hekus.seed,
      sample => samples.push(sample)
    );
    expect(city).not.toBeNull();
    expect(city!.castles).toHaveLength(1);
    expect(samples.filter(s => s.failure).map(s => s.failure!.reason)).toEqual(["unconnected-gates"]);
  });
});
