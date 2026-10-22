// @vitest-environment node
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { describe, expect, it, vi } from "vitest";
import { readReference, referencePeople } from "../extensions/characters/reference/model";
import { ChunkedWorldCodecAdapter } from "../runtime/worldArchive";
import type { MasterReferenceMessage } from "./masterReferenceProtocol";

async function evaluateOpening(fantasy = false, extensions?: string[]) {
  const meta = JSON.parse(
    readFileSync(new URL("../../tests/fixtures/master-character-opening.json", import.meta.url), "utf8")
  );
  if (fantasy) meta.options.culturesSet = "highFantasy";
  const bytes = readFileSync(new URL("../../tests/fixtures/master-character-opening.fmg", import.meta.url));
  const decoded = await new ChunkedWorldCodecAdapter().decode({
    blob: new Blob([bytes]),
    header: bytes.subarray(0, 4)
  });
  const result = await new Promise<import("../runtime/worldArchive").WorldDocument>((resolve, reject) => {
    const worker = new Worker(new URL("./adapters/masterReferenceNodeWorker.mjs", import.meta.url), {
      workerData: {
        document: decoded.document,
        extensions: extensions ?? meta.extensions,
        settings: meta.settings,
        options: meta.options,
        preferences: meta.preferences
      }
    });
    worker.on("error", reject);
    worker.on("message", (value: MasterReferenceMessage) => {
      if (value.kind === "error") {
        void worker.terminate();
        reject(Error(value.message));
      }
      if (value.kind === "complete") {
        void worker.terminate();
        resolve(value.document);
      }
    });
  });
  return { result, meta };
}

describe("pinned master opening parity", () => {
  it.each([false, true])(
    "matches independently recorded master actors, wallets and households (fantasy=%s)",
    async fantasy => {
      const { result, meta } = await evaluateOpening(fantasy);
      const expected = fantasy ? meta.expectedFantasy : meta.expected;
      const reference = readReference(result.simulation)!;
      expect(reference.commit).toBe(meta.masterCommit);
      expect(result.simulation.extensions.characters!.characters).toEqual([]);
      const summary = referencePeople(reference).map(c => ({
        i: c.i,
        name: c.name,
        age: c.age,
        gender: c.gender,
        race: c.race,
        wealth: c.wealth,
        family: c.family,
        titles: c.titles,
        roles: c.roles
      }));
      expect(JSON.parse(JSON.stringify(summary))).toEqual(expected);
      expect(summary.reduce((n, c) => n + Math.round(c.wealth * 100), 0)).toBe(
        expected.reduce((n: number, c: { wealth: number }) => n + Math.round(c.wealth * 100), 0)
      );
    },
    60000
  );
});

it("initializes markets when Economy is enabled after a Characters-only opening", async () => {
  const { result, meta } = await evaluateOpening(false, ["characters"]);
  const { createSimulationHost } = await import("./host");
  const { BUILTIN_SIMULATION_EXTENSIONS } = await import("../extensions/simulation");
  const { worldRuntime } = await import("../runtime/worldRuntime");
  const { optionsStore } = await import("../state/optionsStore");
  const { uiPreferencesStore } = await import("../state/uiPreferencesStore");
  const { installSimulationSettings, createMemorySettings } = await import("./ports");
  installSimulationSettings(createMemorySettings(meta.settings));
  const host = createSimulationHost({ extensions: BUILTIN_SIMULATION_EXTENSIONS });
  try {
    worldRuntime.restoreRollbackDocument(result);
    optionsStore.setState(meta.options);
    uiPreferencesStore.setState(meta.preferences);
    const reference = readReference(host.simulation)!;
    expect(reference.tasks.includes("economy.initialization")).toBe(false);
    expect(host.simulation.extensions.economy?.markets ?? []).toHaveLength(0);
    await host.prepare({ all: true });
    expect(((host.simulation.extensions.economy?.markets ?? []) as unknown[]).length).toBeGreaterThan(0);
    expect(readReference(host.simulation)).toBe(reference);
  } finally {
    host.dispose();
  }
});

it("resolves dormant living people for monthly market payouts and capital returns", async () => {
  const { result, meta } = await evaluateOpening();
  const { createSimulationHost } = await import("./host");
  const { BUILTIN_SIMULATION_EXTENSIONS } = await import("../extensions/simulation");
  const { worldRuntime } = await import("../runtime/worldRuntime");
  const { optionsStore } = await import("../state/optionsStore");
  const { uiPreferencesStore } = await import("../state/uiPreferencesStore");
  const { installSimulationSettings, createMemorySettings } = await import("./ports");
  const household = await import("../extensions/economy/generators/householdWealth");
  const { MerchantTradeCapital } = await import("../extensions/economy/generators/merchantTradeCapital");
  const { getCharacters, getSimulationCharacters } = await import("../extensions/characters/charactersContext");
  installSimulationSettings(createMemorySettings(meta.settings));
  const host = createSimulationHost({ extensions: BUILTIN_SIMULATION_EXTENSIONS });
  try {
    worldRuntime.restoreRollbackDocument(result);
    optionsStore.setState(meta.options);
    uiPreferencesStore.setState(meta.preferences);
    const merchant = getSimulationCharacters().find(c => c.roles?.some(r => r.kind === "marketManager"))!;
    const dead = getSimulationCharacters().find(c => c.i !== merchant.i)!;
    dead.dead = true;
    expect(getCharacters()).toHaveLength(0);
    const outcomes: boolean[] = [];
    let balanceBefore = 0;
    let balanceAfter = 0;
    vi.spyOn(MerchantTradeCapital, "settleCapitalAccounts").mockImplementation(credit => {
      balanceBefore = merchant.wealth;
      outcomes.push(credit(merchant.i, 12.34), credit(dead.i, 12.34), credit(9999999, 12.34));
    });
    vi.spyOn(household, "payOutMarketSurplus").mockImplementation(credit => {
      outcomes.push(credit(merchant.i, 5.67));
      balanceAfter = merchant.wealth;
    });
    await host.dispatch({ extensionId: "economy", name: "production.settle", payload: { skipFoodConsumption: true } });
    expect(outcomes).toEqual([true, false, false, true]);
    expect(balanceAfter - balanceBefore).toBeCloseTo(18.01, 2);
    expect(getCharacters()).toHaveLength(0);
  } finally {
    vi.restoreAllMocks();
    host.dispose();
  }
});
