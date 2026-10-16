import { describe, expect, it } from "vitest";
import { canonicalJson, diffWorldHashes, hashWorldDocument } from "./goldenHash";

describe("canonicalJson", () => {
  it("is independent of key order and expands typed arrays", () => {
    expect(canonicalJson({ b: 1, a: [new Uint8Array([2, 3])] })).toBe(canonicalJson({ a: [[2, 3]], b: 1 }));
  });

  it("distinguishes -0, NaN and dropped undefined fields", () => {
    expect(canonicalJson({ x: -0 })).not.toBe(canonicalJson({ x: 0 }));
    expect(canonicalJson({ x: Number.NaN })).toBe('{"x":"NaN"}');
    expect(canonicalJson({ x: undefined, y: 1 })).toBe('{"y":1}');
  });
});

describe("hashWorldDocument", () => {
  const document = {
    createdAt: "2026-01-01",
    presentation: { styles: { a: 1 } },
    world: { seed: "1", pack: { burgs: [{ i: 1 }], states: [{ i: 1 }] } },
    simulation: { tickCount: 3, extensions: { economy: { a: 1 }, characters: { b: 2 } } },
    opaqueExtensionChunks: [{ extensionId: "x", bytes: new Uint8Array([1]) }]
  };

  it("names the diverged section and ignores presentation and timestamps", async () => {
    const base = await hashWorldDocument(document);
    const cosmetic = await hashWorldDocument({ ...document, createdAt: "later", presentation: { styles: { a: 2 } } });
    expect(cosmetic.digest).toBe(base.digest);

    const changed = await hashWorldDocument({
      ...document,
      simulation: { ...document.simulation, extensions: { ...document.simulation.extensions, economy: { a: 2 } } }
    });
    expect(changed.digest).not.toBe(base.digest);
    expect(diffWorldHashes(base, changed)).toEqual(["simulation.extensions.economy"]);
    expect(Object.keys(base.sections)).toContain("world.pack.burgs");
    expect(Object.keys(base.sections)).toContain("opaqueExtensionChunks.x");
  });
});
