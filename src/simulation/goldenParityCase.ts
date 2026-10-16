import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import { diffWorldHashes, hashArchiveBytes, type WorldHashReport } from "./goldenHash";
import type { SimulationHost } from "./host";

/**
 * Shared body of the golden parity tests (docs/plan/simulation-core-separation.md §8, §20): load
 * the golden fixture into `host` as a browser load would, advance 30 and 365 days and require
 * every checkpoint to match `__golden__/node.json` (written by `npm run test:sim-golden -- --env
 * node --update`). Each vitest file runs in a fresh module graph, like each golden run.
 */
export async function expectNodeGoldenParity(host: SimulationHost): Promise<void> {
  const root = resolve(__dirname, "../..");
  const golden = JSON.parse(readFileSync(resolve(root, "src/simulation/__golden__/node.json"), "utf8")) as {
    checkpoints: Record<string, WorldHashReport>;
  };
  const fixture = readFileSync(resolve(root, "tests/fixtures/sim-golden.fmg"));
  const actual: Record<string, string[]> = {};
  const check = async (name: string) => {
    const bytes = await host.saveArchive();
    if (process.env.SIM_PARITY_DUMP)
      (await import("node:fs")).writeFileSync(`${process.env.SIM_PARITY_DUMP}-${name}.fmg`, bytes);
    const report = await hashArchiveBytes(bytes);
    actual[name] = diffWorldHashes(golden.checkpoints[name], report);
  };
  await host.loadArchive(new Uint8Array(fixture.buffer, fixture.byteOffset, fixture.byteLength));
  await host.prepare();
  await check("day-0");
  let elapsed = 0;
  for (const day of [30, 365]) {
    host.advance({ days: day - elapsed });
    // Economy's monthly settlement runs right after the advance returns.
    await new Promise(done => setTimeout(done, 0));
    elapsed = day;
    await check(`day-${day}`);
  }
  host.dispose();
  expect(actual).toEqual({ "day-0": [], "day-30": [], "day-365": [] });
}
