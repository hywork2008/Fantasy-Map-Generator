import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractAlleys } from "./extract-alleys";

// Two perimeter blocks separated by a 0.6-unit alley, 60 units long.
// Z deliberately closes the buildings without a repeated first vertex.
const fixture = `<svg xmlns="http://www.w3.org/2000/svg">
<g transform="translate(20 30) scale(2 2)">
<path d="M -5,-5 L 25,-5 L 25,65 L -5,65 Z" stroke-width="1.9"/>
<path d="M 0,0 L 10,0 L 10,60 L 0,60 Z" fill="#A5A095"/>
<path d="M 10.6,0 L 20,0 L 20,60 L 10.6,60 Z" fill="#A5A095"/>
</g></svg>`;

for (const sampleStep of [0.5, 0.2]) {
  test(`preserves a continuous narrow alley with sample step ${sampleStep}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "extract-alleys-"));
    try {
      const inputSvgPath = join(dir, "input.svg");
      const outputSvgPath = join(dir, "output.svg");
      writeFileSync(inputSvgPath, fixture);
      const result = extractAlleys({ inputSvgPath, outputSvgPath, sampleStep });
      assert.equal(result.blocksCount, 2);
      assert.equal(result.insideBuildingsCount, 2);
      const svg = readFileSync(outputSvgPath, "utf8");
      assert.ok(svg.startsWith(fixture.slice(0, -6)), "original drawing is preserved");
      const group = svg.match(/<g id="alleys"[\s\S]*?<\/g>/)?.[0];
      assert.ok(group);
      assert.match(group, /fill="none" stroke="lime" stroke-width="5"/);
      const elements = [...group.matchAll(/<path id="([^"]+)"[^>]* d="([^"]+)"/g)];
      assert.ok(elements.length > 0);
      assert.equal(new Set(elements.map(m => m[1])).size, elements.length);
      const paths = elements.map(([, , d]) => {
        assert.match(d, /^ M [-\d.]+,[-\d.]+ L [-\d.]+,[-\d.]+$/);
        return [...d.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
      });
      assert.ok(paths.some(points => {
        const center = points.filter(([x]) => Math.abs(x - 40.6) < 0.1);
        return center.length >= 2 && Math.max(...center.map(p => p[1])) - Math.min(...center.map(p => p[1])) >= 118;
      }), "one continuous path must cover the full alley in transformed screen coordinates");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
