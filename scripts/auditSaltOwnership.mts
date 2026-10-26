/** Fixed-input S4 rights assignment, cash conservation and archive persistence audit. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createNodeSimulationHost, advanceWorld } from "../src/simulation/adapters/node";
import { createObserveViews, createMoneyFlowRecorder } from "./lib/observeViews.mts";
import {
  setSaltworksOwner,
  getSaltworksOwnerOptions,
  getSaltOwnerAccount
} from "../src/extensions/economy/generators/saltOwnership";
import { setTickStepObserver } from "../src/generators/tickProfiler";
const host = createNodeSimulationHost();
const input = process.argv[2] ?? "docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg";
const output = process.argv[3] ?? "docs/analytics/salt-s4-ownership-20261023.json";
const bytes = readFileSync(input);
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const views = createObserveViews(() => host.world);
  const initial = views.salt()!;
  const start = {
    year: host.simulation.currentYear,
    month: host.simulation.currentMonth,
    day: host.simulation.currentDay
  };
  const initialProfile = {
    options: structuredClone(host.world.options),
    populationRate: host.world.populationRate,
    urbanization: host.world.urbanization
  };
  assert(initial.works.every(w => w.owner?.kind === "state" && w.owner.id === w.stateId));
  const selected = [];
  const kinds = ["state", "burg", "church", "private"] as const;
  for (let index = 0; index < kinds.length; index++) {
    const work = initial.works[index];
    assert(work);
    const choice = getSaltworksOwnerOptions(work).find(o => o.owner.kind === kinds[index]);
    assert(choice, `Missing real ${kinds[index]} account`);
    assert(setSaltworksOwner(work.i, choice.owner));
    selected.push({ workId: work.i, owner: choice.owner, name: choice.name });
  }
  const assigned = structuredClone(views.salt());
  const ownerCash = () =>
    Object.fromEntries(
      views.salt()!.works.map(w => [`${w.owner!.kind}:${w.owner!.id}`, getSaltOwnerAccount(w)?.balance])
    );
  const assignedCash = ownerCash();
  await host.loadArchive(await host.saveArchive());
  await host.prepare();
  assert.deepEqual(views.salt(), assigned);
  assert.deepEqual(ownerCash(), assignedCash);
  const recorder = createMoneyFlowRecorder(() => host.world);
  setTickStepObserver(recorder.observer);
  await advanceWorld(host, { months: 1 });
  const settled = structuredClone(views.salt());
  const settledCash = ownerCash();
  const money = recorder.flush().filter(row => row.step === "production:saltLogistics");
  await host.loadArchive(await host.saveArchive());
  await host.prepare();
  assert.deepEqual(views.salt(), settled);
  assert.deepEqual(ownerCash(), settledCash);
  assert(
    money.every(row => row.net === 0),
    "Salt settlement must conserve existing cash"
  );
  const sources = [
    "scripts/auditSaltOwnership.mts",
    "scripts/lib/observeViews.mts",
    "src/extensions/economy/generators/saltLogisticsTypes.ts",
    "src/extensions/economy/simulation.ts",
    "src/extensions/economy/controllers/market-overview.ts",
    "src/extensions/economy/ui/dialogs/MarketOverviewDialog.tsx",
    "src/extensions/economy/generators/saltOwnership.ts",
    "src/extensions/economy/generators/saltFinance.ts",
    "src/extensions/economy/generators/saltLogistics.ts",
    "src/extensions/economy/generators/saltProduction.ts"
  ];
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        input,
        initialProfile,
        start,
        end: {
          year: host.simulation.currentYear,
          month: host.simulation.currentMonth,
          day: host.simulation.currentDay
        },
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        sourceHashes: Object.fromEntries(
          sources.map(p => [p, createHash("sha256").update(readFileSync(p)).digest("hex")])
        ),
        selected,
        legacyMigration: "all missing owners defaulted to their territorial state",
        assignmentRoundtrip: true,
        settlementRoundtrip: true,
        saltMoney: money,
        assignedCash,
        settledCash,
        works: settled!.works,
        shipments: settled!.shipments
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    "S4 ownership audit: four existing owner types assigned; both archive roundtrips passed; money:",
    JSON.stringify(money)
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}
