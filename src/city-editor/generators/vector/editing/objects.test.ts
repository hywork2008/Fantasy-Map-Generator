import { expect, it } from "vitest";
import { placeableObjectsFor } from "../../../../buildings/placeablePeriod";
import { createVectorExample } from "../document";
import { addVectorObject, removeVectorObject } from "./objects";

it("offers period models by default and every model when the period is ignored", () => {
  const medieval = placeableObjectsFor("highMedieval").map(o => o.id);
  expect(medieval).toContain("trebuchet");
  expect(medieval).not.toContain("b2");
  expect(medieval).not.toContain("tigerI");
  expect(placeableObjectsFor("highMedieval", true).map(o => o.id)).toEqual(
    expect.arrayContaining(["trebuchet", "tigerI", "b2"])
  );
});

it("places a B-2 on free ground regardless of the city's period, refuses obstacles, and removes it", () => {
  const source = createVectorExample();
  const half = source.frame.extentMeters / 2;
  const { document, placementId } = addVectorObject(source, "b2", [-168, -168], 0);
  const p = document.placements[placementId];
  expect(p.modelId).toBe("b2");
  expect(p.display?.kind).toBe("object");
  expect(p.display?.heightMeters).toBeCloseTo(5.18, 2);
  expect(document.revision).toBe(source.revision + 1);
  // The same spot is now taken, and a model may not reach past the frame.
  expect(() => addVectorObject(document, "tigerI", [-168, -168], 0)).toThrow("object-obstacle");
  expect(() => addVectorObject(document, "b2", [half - 1, 0], 0)).toThrow("object-outside-frame");
  const removed = removeVectorObject(document, placementId);
  expect(removed.placements[placementId]).toBeUndefined();
  expect(() => removeVectorObject(removed, Object.keys(removed.placements)[0] ?? "missing")).toThrow();
});
