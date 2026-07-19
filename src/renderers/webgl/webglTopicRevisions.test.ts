import { describe, expect, it } from "vitest";
import { getWebglTopicRevisionSignature } from "./webglTopicRevisions";

describe("getWebglTopicRevisionSignature", () => {
  it("keeps a layer cache key stable across an unrelated world commit", () => {
    const first = getWebglTopicRevisionSignature(
      { revision: 4, topicRevisions: { "map.topology": 2, "map.politics": 7, "map.annotations": 3 } },
      "map-12|focus:all",
      ["map.topology", "map.politics"],
      () => "legacy"
    );
    const afterMarkerMove = getWebglTopicRevisionSignature(
      { revision: 5, topicRevisions: { "map.topology": 2, "map.politics": 7, "map.annotations": 4 } },
      "map-12|focus:all",
      ["map.topology", "map.politics"],
      () => "legacy"
    );

    expect(afterMarkerMove).toBe(first);
  });

  it("changes a layer cache key when one of its declared topics changes", () => {
    const first = getWebglTopicRevisionSignature(
      { revision: 4, topicRevisions: { "map.topology": 2, "map.politics": 7 } },
      "map-12|focus:all",
      ["map.topology", "map.politics"],
      () => "legacy"
    );
    const afterPoliticalEdit = getWebglTopicRevisionSignature(
      { revision: 5, topicRevisions: { "map.topology": 2, "map.politics": 8 } },
      "map-12|focus:all",
      ["map.topology", "map.politics"],
      () => "legacy"
    );

    expect(afterPoliticalEdit).not.toBe(first);
  });
});
