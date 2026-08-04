import { describe, expect, it } from "vitest";
import {
  applySphereVariation,
  extractNameStem,
  normalizePersonNameKey,
  shouldKeepExactCatalogForm,
  uniquifyMythicPersonName
} from "./personNameVariation";

describe("personNameVariation", () => {
  it("extracts stem from titled forms", () => {
    expect(extractNameStem("King Arthur")).toBe("Arthur");
    expect(extractNameStem("Inanna")).toBe("Inanna");
  });

  it("keeps Mesopotamian variants looking local (affix / mutation)", () => {
    const samples = new Set<string>();
    let seq = 0;
    const rnd = () => {
      seq += 1;
      return (seq * 0.17) % 1;
    };
    for (let i = 0; i < 20; i++) {
      samples.add(applySphereVariation("Inanna", 23, rnd, i));
    }
    // Not all identical to bare catalog form
    expect([...samples].some(s => s !== "Inanna")).toBe(true);
    for (const s of samples) {
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(18);
      // Latin letters only
      expect(s).toMatch(/^[\p{L}'-]+$/u);
    }
  });

  it("uniquifies so a tiny pool does not repeat the same string", () => {
    const used = new Set<string>();
    const names: string[] = [];
    let seq = 0;
    const rnd = () => {
      seq = (seq * 1.7 + 0.13) % 1;
      return seq;
    };
    for (let i = 0; i < 20; i++) {
      const n = uniquifyMythicPersonName({
        baseName: "Inanna",
        sphereId: 23,
        used,
        poolSize: 6,
        peerNames: ["Inanna", "Ishtar", "Enki", "Enlil", "Marduk", "Gilgamesh"],
        random: rnd
      });
      names.push(n);
      used.add(normalizePersonNameKey(n));
    }
    const unique = new Set(names.map(normalizePersonNameKey));
    // 20 draws from 6 stems with variation → expect high uniqueness
    expect(unique.size).toBeGreaterThanOrEqual(16);
    // Bare "Inanna" should appear at most once
    expect(names.filter(n => n === "Inanna").length).toBeLessThanOrEqual(1);
  });

  it("rarely keeps exact form on tiny pools", () => {
    let exact = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      if (shouldKeepExactCatalogForm(6, true, () => i / n)) exact++;
    }
    // threshold 0.12 → roughly 12% of sequential rng values
    expect(exact).toBeLessThan(n * 0.2);
  });
});
