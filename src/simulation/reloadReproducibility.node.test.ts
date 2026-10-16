// @vitest-environment node
/**
 * Loading the same .fmg twice in one process advances identically (simulation-core-separation.md
 * §20.4, §22): no cadence phase or other module state may carry over from the previous world.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { advanceWorld, createNodeSimulationHost, loadWorld } from "./adapters/node";
import { diffWorldHashes, hashArchiveBytes } from "./goldenHash";

it("advances a reloaded fixture exactly like the first load", async () => {
  const bytes = readFileSync(resolve(__dirname, "../../tests/fixtures/sim-golden.fmg"));
  const fixture = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const run = async () => {
    const host = createNodeSimulationHost();
    await loadWorld(host, fixture);
    // 37 days: past one monthly settlement and mid-way through the weekly / board cadences.
    await advanceWorld(host, { days: 37 });
    const saved = await host.saveArchive();
    host.dispose();
    return hashArchiveBytes(saved);
  };
  const first = await run();
  const second = await run();
  expect(diffWorldHashes(first, second)).toEqual([]);
}, 300_000);

it("saves Economy's cadence phases with the world", async () => {
  const bytes = readFileSync(resolve(__dirname, "../../tests/fixtures/sim-golden.fmg"));
  const host = createNodeSimulationHost();
  await loadWorld(host, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  await advanceWorld(host, { days: 17 });
  const phases = () =>
    (host.simulation.extensions?.economy as { cadencePhases?: Record<string, number> } | undefined)?.cadencePhases;
  const before = { ...phases() };
  expect(before.productionDays).toBe(17);
  await host.loadArchive(await host.saveArchive());
  expect(phases()).toEqual(before);
  host.dispose();
}, 300_000);
