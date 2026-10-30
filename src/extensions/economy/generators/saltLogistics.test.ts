import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMoneyFlowRecorder, createObserveViews } from "../../../../scripts/lib/observeViews.mts";
import { simEvents } from "../../../simulation/events";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import {
  clearEconomyContext,
  getApi,
  getMarkets,
  getOrCreateCumulativeMarketIntake,
  getOrCreateFaunaStockTable,
  getSaltShipments,
  getSaltworks,
  getStateSaltLedgers,
  initEconomyContext,
  setBurgMarketLedgers,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineralDeposits,
  setSaltShipments
} from "../economyContext";
import { getDiscontentLaborMultiplier } from "./burgDiscontent";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { getCouncilSupport } from "./councilAssembly";
import { Goods } from "./goods-generator";
import { recordGoodFlow, setGoodFlowObserver } from "./goodsBalanceLedger";
import { getRuralHouseholdWealth } from "./householdWealth";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import { createPersonalCashState } from "./personalCashLedger";
import { buyHouseholdSalt, priceSalt, saltPayable } from "./saltFinance";
import {
  auditSaltPopulationCoverage,
  SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR,
  SALT_KILOGRAMS_PER_BAG,
  SALT_LIVESTOCK_CASH_SHARE,
  SALT_LIVESTOCK_PURCHASED_SHARE,
  SaltLogistics
} from "./saltLogistics";
import type { SaltworksOwner } from "./saltLogisticsTypes";
import {
  getSaltOwnerAccount,
  getSaltworksOperator,
  getSaltworksOwnerOptions,
  migrateSaltworksOwnership,
  setSaltworksOwner
} from "./saltOwnership";
import { configureSaltPolicy, shouldAdoptSaltMonopoly, updateSaltPolicies } from "./saltPolicy";
import { createSaltProductionBudget, SALT_PRODUCTION_POLICY, saltSolarWeights } from "./saltProduction";
import { setCargoDepartureObserver, setLotDispatchObserver, setTradeStageObserver } from "./tradeStageObserver";
import { WOOD_KG_PER_LOT } from "./woodRecipeContracts";

function setUpWorld(): void {
  worldContext.pack = {
    burgs: [
      { i: 0, removed: true },
      { i: 1, cell: 0, x: 0, y: 0, market: 1, state: 1, population: 10 },
      { i: 2, cell: 1, x: 80, y: 0, market: 2, state: 2, population: 20 }
    ],
    states: [
      { i: 0, name: "Neutral", removed: true },
      { i: 1, name: "North", capital: 1, treasury: 1e8 },
      { i: 2, name: "South", capital: 2, treasury: 1e8 }
    ],
    cells: {
      i: [0, 1, 2],
      p: [
        [0, 0],
        [80, 0],
        [40, 20]
      ],
      h: Uint8Array.from([35, 55, 10]),
      c: [[2], [2], [0, 1]],
      r: Uint16Array.from([0, 0, 0]),
      f: Uint16Array.from([0, 0, 1]),
      state: Uint16Array.from([1, 2, 0]),
      pop: Uint16Array.from([10, 20, 0]),
      routes: {}
    },
    features: [null, { i: 1, type: "ocean" }]
  } as unknown as PackedGraph;
  worldContext.populationRate = 1000;
  worldContext.urbanization = 1;
  setGoods([
    { i: 1, name: "Salt", tags: ["preservative", "mineral"], value: 3, unit: "bag", icon: "salt", color: "#fff" }
  ]);
  setMarkets([
    {
      i: 1,
      centerBurgId: 1,
      color: "#111",
      goods: {},
      marketTreasury: { balance: 1e8, ruralGrainPayable: 0 },
      foodLedger: { ruralHouseholdWealth: 1e8 }
    },
    {
      i: 2,
      centerBurgId: 2,
      color: "#222",
      goods: {},
      marketTreasury: { balance: 1e8, ruralGrainPayable: 0 },
      foodLedger: { ruralHouseholdWealth: 1e8 }
    }
  ] as unknown as Market[]);
  setBurgMarketLedgers([1, 2].map(burgId => ({ burgId, marketId: burgId, merchants: [], householdWealth: 1e8 })));
  setMarketCellColumn(Uint16Array.from([1, 2, 0]));
  Goods.sync();
  Markets.sync();
}

describe("SaltLogisticsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { extensions: {} } } as unknown as ExtensionAPI);
    setUpWorld();
  });
  afterEach(() => {
    clearCharactersContext();
    clearNobilityContext();
    setGoodFlowObserver(null);
    setCargoDepartureObserver(null);
    setLotDispatchObserver(null);
    setTradeStageObserver(null);
    clearEconomyContext();
  });

  function cash(): number {
    return (
      worldContext.pack.states.reduce(
        (sum, s) =>
          sum +
          (s?.treasury ?? 0) +
          Object.values(s?.departmentBalances ?? {}).reduce((total, value) => total + value, 0),
        0
      ) +
      getMarkets().reduce((sum, m) => sum + (m.marketTreasury?.balance ?? 0) + getRuralHouseholdWealth(m), 0) +
      worldContext.pack.burgs.reduce((sum, b) => sum + (b?.i ? getHouseholdWealth(b.i) + (b.treasury ?? 0) : 0), 0) +
      (worldContext.pack.characters ?? []).reduce((sum, person) => sum + (person.wealth ?? 0), 0)
    );
  }

  it("requires fiscal distress and an exploitative ruler, and reviews automatic policy once per month", () => {
    expect(shouldAdoptSaltMonopoly(0, 10, { greed: 90, honor: 10, compassion: 10 })).toBe(true);
    expect(shouldAdoptSaltMonopoly(100, 10, { greed: 90, honor: 10, compassion: 10 })).toBe(false);
    expect(shouldAdoptSaltMonopoly(0, 10, { greed: 90, honor: 90, compassion: 90 })).toBe(false);
    seedOwners();
    worldContext.pack.characters![0].personality = {
      greed: 90,
      honor: 10,
      compassion: 10,
      rationality: 50
    } as (typeof NonNullable<typeof worldContext.pack.characters>)[0]["personality"];
    worldContext.pack.characters![0].titles = [];
    const api = getApi();
    api.simulationContext.extensions.characters = { characters: worldContext.pack.characters! };
    initCharactersContext(api as unknown as ExtensionAPI);
    initNobilityContext(api as unknown as ExtensionAPI);
    setRulerId(worldContext.pack.states[1], 100);
    const state = worldContext.pack.states[1];
    state.treasury = 0;
    updateSaltPolicies();
    expect(state.saltPolicy?.mode).toBe("monopoly");
    expect(state.saltPolicy?.compulsoryPurchase).toBe(false);
    const logCount = state.councilSessionLog!.length;
    state.treasury = 1e8;
    updateSaltPolicies();
    expect(state.saltPolicy?.mode).toBe("monopoly");
    expect(state.councilSessionLog).toHaveLength(logCount);
    api.simulationContext.currentMonth = 2;
    updateSaltPolicies();
    expect(state.saltPolicy?.mode).toBe("open");
    expect(state.saltPolicy?.taxRate).toBe(0);
  });

  it("does not introduce a salt policy when the Good is disabled", () => {
    setGoods([]);
    SaltLogistics.settleMonth();
    expect(worldContext.pack.states[1].saltPolicy).toBeUndefined();
  });

  it("lets the assembly veto an extraction policy without changing rights or cash", () => {
    SaltLogistics.generate();
    const state = worldContext.pack.states[1];
    state.debtCoupSupportPenalty = 60;
    const before = cash();
    expect(configureSaltPolicy(1, "monopoly", 1, true)).toBe(false);
    expect(state.saltPolicy?.mode).toBe("open");
    expect(state.saltPolicy?.taxRate).toBe(0);
    expect(state.councilSessionLog?.at(-1)?.kind).toBe("veto");
    expect(cash()).toBe(before);
  });

  it("reserves state operating rights temporarily without seizing the private title or past receipts", () => {
    seedOwners();
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    expect(setSaltworksOwner(operation.i, { kind: "private", id: 100 })).toBe(true);
    expect(configureSaltPolicy(1, "monopoly", 0.5, false)).toBe(true);
    expect(getSaltworksOperator(operation)).toEqual({ kind: "state", id: 1 });
    SaltLogistics.settleMonth();
    expect(operation.owner).toEqual({ kind: "private", id: 100 });
    expect(operation.settlementOwner).toEqual({ kind: "state", id: 1 });
    expect(worldContext.pack.characters![0].wealth).toBe(1e8);
    expect(getSaltShipments().find(sh => sh.saltworksId === operation.i)?.monopolyStateId).toBe(1);
    const receipts = structuredClone(getSaltShipments());
    expect(configureSaltPolicy(1, "open", 0, false)).toBe(true);
    expect(getSaltworksOperator(operation)).toEqual({ kind: "private", id: 100 });
    expect(getSaltShipments()).toEqual(receipts);
  });

  it("splits actual household tax through existing tax farmers and conserves money", () => {
    worldContext.pack.states[1].form = "Monarchy";
    worldContext.pack.burgs[1].security = 100;
    getMarkets()[0].marketTreasury!.balance += 0.004;
    worldContext.pack.states[1].treasury! += 0.003;
    expect(configureSaltPolicy(1, "open", 1, false)).toBe(true);
    const before = cash();
    const stateBefore = worldContext.pack.states[1].treasury!;
    const purchase = buyHouseholdSalt(getMarkets()[0], 1, 100, 100, 1);
    expect(purchase.bags).toBeCloseTo(100);
    expect(purchase.tax).toBeGreaterThan(0);
    expect(purchase.farm).toBeGreaterThan(0);
    expect(purchase.legal + purchase.smuggled).toBeCloseTo(purchase.bags);
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(stateBefore + purchase.tax - purchase.farm, 4);
    expect(cash()).toBeCloseTo(before, 4);
  });

  it("reduces purchasable quantity through the same wallets while keeping physical need unchanged", () => {
    const market = getMarkets()[0];
    const resetWallets = () => {
      setBurgMarketLedgers([1, 2].map(burgId => ({ burgId, marketId: burgId, merchants: [], householdWealth: 10 })));
      market.foodLedger!.ruralHouseholdWealth = 10;
    };
    resetWallets();
    const untaxed = buyHouseholdSalt(market, 1, 20, 20, 1);
    resetWallets();
    expect(configureSaltPolicy(1, "open", 1, false)).toBe(true);
    const taxed = buyHouseholdSalt(market, 1, 20, 20, 1);
    expect(taxed.bags).toBeLessThan(untaxed.bags);
    expect(taxed.affordabilityGap).toBeGreaterThan(0);
    expect(taxed.tax).toBeGreaterThan(0);
    expect(taxed.paid).toBeCloseTo(untaxed.paid);
  });

  it("treats compulsory legal purchase separately from consumption and counts smuggled stock only once", () => {
    SaltLogistics.generate();
    getSaltworks().forEach(w => {
      w.active = false;
    });
    for (const market of getMarkets()) market.goods[1] = { stock: 1000, price: 1 };
    expect(configureSaltPolicy(1, "monopoly", 1, true)).toBe(true);
    let consumed = 0;
    setGoodFlowObserver(flow => {
      if (flow.goodId === 1 && flow.category === "householdFood") consumed += flow.units;
    });
    const before = cash();
    SaltLogistics.settleMonth();
    const row = getStateSaltLedgers().find(l => l.stateId === 1)!;
    expect(row.monthlyHouseholdDemandBags).toBe(100);
    expect(row.monthlyUnmetHouseholdBags).toBe(0);
    expect(row.monthlySmuggledBags).toBeGreaterThan(0);
    expect(row.monthlyUnmetQuotaBags).toBeCloseTo(row.monthlySmuggledBags!);
    expect(consumed).toBeCloseTo(
      getStateSaltLedgers().reduce((sum, l) => sum + l.monthlyHouseholdSalesBags, 0),
      3
    );
    expect(getMarkets()[0].goods[1].stock).toBeCloseTo(900);
    expect(cash()).toBeCloseTo(before, 4);
  });

  it("records revolt once on crossing and connects tax resistance to civic production and assembly support", () => {
    SaltLogistics.generate();
    expect(configureSaltPolicy(1, "monopoly", 2, true)).toBe(true);
    const p = worldContext.pack.states[1].saltPolicy!;
    p.unrest = 79;
    getSaltworks().forEach(w => {
      w.active = false;
    });
    setBurgMarketLedgers([1, 2].map(burgId => ({ burgId, marketId: burgId, merchants: [], householdWealth: 0 })));
    getMarkets().forEach(m => {
      m.foodLedger!.ruralHouseholdWealth = 0;
      m.goods[1] = { stock: 1000, price: 1 };
    });
    worldContext.pack.burgs[1].discontent = 70;
    let revoltEvents = 0;
    const handler = () => {
      revoltEvents += 1;
    };
    simEvents.addEventListener("fmg:salt-revolt", handler);
    try {
      SaltLogistics.settleMonth();
      SaltLogistics.settleMonth();
      const row = getStateSaltLedgers().find(l => l.stateId === 1)!;
      expect(row.saltRevolt).toBe(true);
      expect(row.monthlyUnmetQuotaBags).toBeGreaterThan(0);
      expect(row.monthlySaltTaxPaid).toBe(0);
      expect(revoltEvents).toBe(1);
      expect(getDiscontentLaborMultiplier(worldContext.pack.burgs[1].discontent)).toBeLessThan(1);
      expect(getCouncilSupport(worldContext.pack.states[1]).support).toBeLessThan(62);
    } finally {
      simEvents.removeEventListener("fmg:salt-revolt", handler);
    }
  });

  it("keeps taxes assigned to the buyer's state in a shared market", () => {
    worldContext.pack.burgs[2].market = 1;
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    setMarkets([getMarkets()[0]]);
    Markets.sync();
    SaltLogistics.generate();
    getSaltworks().forEach(w => {
      w.active = false;
    });
    getMarkets()[0].goods[1] = { stock: 1000, price: 1 };
    expect(configureSaltPolicy(1, "open", 0.5, false)).toBe(true);
    const otherStateCash = worldContext.pack.states[2].treasury;
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(l => l.stateId === 1)?.monthlySaltTaxPaid).toBeGreaterThan(0);
    expect(getStateSaltLedgers().find(l => l.stateId === 2)?.monthlySaltTaxPaid).toBe(0);
    expect(worldContext.pack.states[2].treasury).toBe(otherStateCash);
  });

  function seedOwners(): void {
    worldContext.pack.burgs[1].treasury = 1e8;
    worldContext.pack.states[1].departmentBalances = {
      marshalcy: 0,
      chancery: 0,
      stewardship: 0,
      spymastery: 0,
      ecclesiastica: 1e8,
      publicWorks: 0
    };
    worldContext.pack.characters = [
      { i: 100, name: "Salt Merchant", state: 1, dead: false, wealth: 1e8 }
    ] as typeof worldContext.pack.characters;
  }

  it.each<SaltworksOwner>([
    { kind: "state", id: 1 },
    { kind: "burg", id: 1 },
    { kind: "church", id: 1 },
    { kind: "private", id: 100 }
  ])("routes costs and receipts to $kind ownership without creating cash", owner => {
    seedOwners();
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    expect(setSaltworksOwner(operation.i, owner)).toBe(true);
    const before = cash();
    operation.kind = "brineWell";
    setGoods([Goods.get(1)!, { i: 2, name: "Wood", tags: [], value: 1, unit: "pile", icon: "", color: "" }]);
    getMarkets()[0].goods[2] = { stock: 100, price: 3 };
    const ownerBefore = getSaltOwnerAccount(operation)!.balance;
    const stateBefore = worldContext.pack.states[1].treasury;
    SaltLogistics.settleMonth();
    expect(operation.monthlyOutputBags).toBeGreaterThan(0);
    expect(operation.monthlyFuelPaid).toBeGreaterThan(0);
    expect(getSaltOwnerAccount(operation)!.balance).toBeCloseTo(
      ownerBefore + operation.monthlyWholesaleReceived! - operation.monthlyWagesPaid! - operation.monthlyFuelPaid!,
      4
    );
    if (owner.kind !== "state") expect(worldContext.pack.states[1].treasury).toBeCloseTo(stateBefore!, 4);
    expect(operation.settlementOwner).toEqual(owner);
    expect(getSaltShipments().find(sh => sh.saltworksId === operation.i)?.sellerOwner).toEqual(owner);
    expect(cash()).toBeCloseTo(before, 4);
  });

  it("boils with the cheaper heat of Wood and Peat, and with Peat where there is no Wood", () => {
    const burned = (woodStock: number, woodPrice: number) => {
      setUpWorld();
      seedOwners();
      SaltLogistics.generate();
      const operation = getSaltworks()[0];
      operation.kind = "brineWell";
      setGoods([
        Goods.get(1)!,
        { i: 2, name: "Wood", tags: [], value: 1, unit: "pile", icon: "", color: "" },
        { i: 3, name: "Peat", tags: ["fuel"], value: 0.03, unit: "bale", icon: "", color: "" }
      ]);
      const market = getMarkets()[0];
      market.goods[2] = { stock: woodStock, price: woodPrice };
      market.goods[3] = { stock: 1e4, price: 0.05 };
      SaltLogistics.settleMonth();
      return {
        output: operation.monthlyOutputBags,
        wood: woodStock - market.goods[2].stock,
        peat: 1e4 - market.goods[3].stock
      };
    };
    // A bale is 200/6,500 of a pile's heat: at 0.05 a bale Peat costs 1.63 a pile of heat.
    const noWood = burned(0, 1);
    expect(noWood.output).toBeGreaterThan(0);
    expect(noWood.peat).toBeGreaterThan(0);
    const cheapWood = burned(100, 1);
    expect(cheapWood.wood).toBeGreaterThan(0);
    expect(cheapWood.peat).toBe(0);
    const dearWood = burned(100, 3);
    expect(dearWood.wood).toBe(0);
    expect(dearWood.peat).toBeGreaterThan(0);
  });

  it("uses authoritative Characters cash rather than the compatibility pack copy", () => {
    seedOwners();
    const actualPerson = { ...worldContext.pack.characters![0], name: "Actual Merchant", wealth: 2e8 };
    initCharactersContext({
      worldContext,
      simulationContext: { extensions: { characters: { characters: [actualPerson] } } }
    } as unknown as ExtensionAPI);
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    expect(setSaltworksOwner(operation.i, { kind: "private", id: 100 })).toBe(true);
    expect(getSaltworksOwnerOptions(operation).find(o => o.owner.kind === "private")?.name).toBe("Actual Merchant");
    SaltLogistics.settleMonth();
    expect(actualPerson.wealth).toBeCloseTo(
      2e8 + operation.monthlyWholesaleReceived! - operation.monthlyWagesPaid! - operation.monthlyFuelPaid!,
      4
    );
    expect(worldContext.pack.characters![0].wealth).toBe(1e8);
    expect(setSaltworksOwner(operation.i, undefined as unknown as SaltworksOwner)).toBe(false);
    expect(operation.owner).toEqual({ kind: "private", id: 100 });
  });

  it("counts reference-backed private money once in the cash-flow observer", () => {
    seedOwners();
    const ledger = createPersonalCashState();
    ledger.accounts.dormant = {
      id: "dormant",
      stateId: 1,
      balance: 1000,
      status: "active",
      managed: true,
      initialized: true
    };
    const extensions = getApi().simulationContext.extensions;
    extensions.economy ??= {};
    extensions.economy.personalCash = ledger;
    const money = createMoneyFlowRecorder(() => worldContext);
    expect(money.totals().characters).toBe(10);
    money.observer.enter("salt");
    worldContext.pack.states[1].treasury! -= 3;
    ledger.accounts.dormant.balance += 300;
    money.observer.exit("salt");
    expect(money.flush()).toEqual([{ step: "salt", net: 0, stateTreasury: -3, characters: 3 }]);
  });

  it("migrates absent legacy rights once without resetting money, capacity, or explicit owners", () => {
    seedOwners();
    SaltLogistics.generate();
    delete getSaltworks()[0].owner;
    expect(setSaltworksOwner(getSaltworks()[1].i, { kind: "burg", id: 2 })).toBe(true);
    const before = cash();
    const capacity = getSaltworks().map(o => o.annualCapacityBags);
    migrateSaltworksOwnership();
    migrateSaltworksOwnership();
    expect(getSaltworks().map(o => o.owner)).toEqual([
      { kind: "state", id: 1 },
      { kind: "burg", id: 2 }
    ]);
    expect(getSaltworks().map(o => o.annualCapacityBags)).toEqual(capacity);
    expect(cash()).toBe(before);
  });

  it("rejects foreign or missing rights and never uses the state purse for an invalid private owner", () => {
    seedOwners();
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    expect(setSaltworksOwner(operation.i, { kind: "burg", id: 2 })).toBe(false);
    expect(setSaltworksOwner(operation.i, { kind: "private", id: 999 })).toBe(false);
    expect(setSaltworksOwner(operation.i, { kind: "private", id: 100 })).toBe(true);
    worldContext.pack.characters![0].dead = true;
    expect(getSaltworksOwnerOptions(operation).some(o => o.owner.kind === "private")).toBe(false);
    const before = cash();
    const stateBefore = worldContext.pack.states[1].treasury;
    SaltLogistics.settleMonth();
    expect(operation.monthlyOutputBags).toBe(0);
    expect(operation.owner).toEqual({ kind: "private", id: 100 });
    expect(worldContext.pack.states[1].treasury).toBe(stateBefore);
    expect(cash()).toBeCloseTo(before, 4);
  });

  it("changes rights without moving old cash, market stock, prepaid receipts or settlement attribution", () => {
    seedOwners();
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    const operation = getSaltworks()[0];
    const receipts = structuredClone(getSaltShipments());
    const stock = getMarkets().map(m => m.goods[1]?.stock);
    const before = cash();
    const oldOwnerCash = worldContext.pack.states[1].treasury;
    expect(setSaltworksOwner(operation.i, { kind: "private", id: 100 })).toBe(true);
    expect(operation.settlementOwner).toEqual({ kind: "state", id: 1 });
    expect(getSaltShipments()).toEqual(receipts);
    expect(getMarkets().map(m => m.goods[1]?.stock)).toEqual(stock);
    expect(worldContext.pack.states[1].treasury).toBe(oldOwnerCash);
    expect(cash()).toBe(before);
  });

  it("conserves cash across state production, wholesale, fuel, wages and retail", () => {
    SaltLogistics.generate();
    getSaltworks()[0].kind = "brineWell";
    setGoods([Goods.get(1)!, { i: 2, name: "Wood", tags: [], value: 1, unit: "pile", icon: "", color: "" }]);
    getMarkets()[0].goods[2] = { stock: 100, price: 3 };
    worldContext.pack.states[1].treasury! += 0.003;
    getMarkets()[0].marketTreasury!.balance += 0.004;
    const before = cash();
    SaltLogistics.settleMonth();
    expect(cash()).toBeCloseTo(before, 5);
    const works = getSaltworks()[0];
    expect(works.monthlyWagesPaid).toBeGreaterThan(0);
    expect(works.monthlyFuelPaid).toBeGreaterThan(0);
    expect(works.monthlyWholesaleReceived).toBeGreaterThan(0);
    expect(getStateSaltLedgers()[0].monthlyHouseholdPaid).toBeGreaterThan(0);
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(
      1e8 + 0.003 + works.monthlyWholesaleReceived! - works.monthlyWagesPaid! - works.monthlyFuelPaid!,
      2
    );
  });

  it("does not manufacture or charge inputs without operating cash", () => {
    SaltLogistics.generate();
    worldContext.pack.states[1].treasury = 0;
    worldContext.pack.states[2].treasury = 0;
    const before = cash();
    SaltLogistics.settleMonth();
    expect(getSaltworks().every(w => w.monthlyOutputBags === 0 && w.monthlyWagesPaid === 0)).toBe(true);
    expect(cash()).toBeCloseTo(before, 5);
  });

  it("sells fresh salt on credit to a market without cash and is repaid from later cash", () => {
    SaltLogistics.generate();
    const market = getMarkets()[1];
    market.marketTreasury!.balance = 0;
    const before = cash();
    SaltLogistics.settleMonth();
    const owed = saltPayable(market);
    expect(getSaltworks().some(w => w.marketId === market.i && w.monthlyOutputBags > 0)).toBe(true);
    expect(owed).toBeGreaterThan(0);
    expect(market.marketTreasury!.balance).toBeGreaterThanOrEqual(0);
    // Credit moves no money that does not exist: the debt is the only new entry.
    expect(cash()).toBeCloseTo(before, 2);

    // Cash just covering the debt repays all of it; the debt is not deducted from itself.
    market.marketTreasury!.balance = owed + 1;
    for (const works of getSaltworks()) works.active = false;
    // No sales this month, so only the cash already held can repay.
    setBurgMarketLedgers([1, 2].map(burgId => ({ burgId, marketId: burgId, merchants: [], householdWealth: 0 })));
    for (const m of getMarkets()) m.foodLedger!.ruralHouseholdWealth = 0;
    SaltLogistics.settleMonth();
    expect(saltPayable(market)).toBe(0);
  });

  it("leaves unpaid households unmet even with stock, without charging the state", () => {
    SaltLogistics.generate();
    getSaltworks().forEach(w => {
      w.active = false;
    });
    setBurgMarketLedgers([1, 2].map(burgId => ({ burgId, marketId: burgId, merchants: [], householdWealth: 0 })));
    for (const market of getMarkets()) {
      market.foodLedger!.ruralHouseholdWealth = 0;
      market.goods[1] = { stock: 1000, price: 1 };
    }
    const before = cash();
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().every(s => s.monthlyHouseholdSalesBags === 0 && s.monthlyUnmetHouseholdBags > 0)).toBe(
      true
    );
    expect(getMarkets().every(m => m.goods[1].stock === 1000)).toBe(true);
    expect(cash()).toBe(before);
  });

  it("prepays international cargo and freight once, never again when cargo arrives", () => {
    worldContext.pack.cells.c[1] = [0];
    SaltLogistics.generate();
    seedOwners();
    expect(setSaltworksOwner(getSaltworks()[0].i, { kind: "private", id: 100 })).toBe(true);
    const before = cash();
    SaltLogistics.settleMonth();
    SaltLogistics.settleMonth();
    const shipment = getSaltShipments().find(sh => sh.importerStateId === 2)!;
    expect(shipment.wholesalePaid).toBeGreaterThan(0);
    expect(shipment.freightPaid).toBeGreaterThan(0);
    expect(shipment.sellerOwner).toEqual({ kind: "private", id: 100 });
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(1e8, 4);
    expect(getStateSaltLedgers().find(s => s.stateId === 2)?.monthlyImportsPaid).toBe(shipment.wholesalePaid);
    expect(cash()).toBeCloseTo(before, 5);
    getSaltworks().forEach(w => {
      w.active = false;
    });
    const ownerCash = worldContext.pack.states[1].treasury;
    for (let i = 0; i < 10; i++) SaltLogistics.settleMonth();
    expect(worldContext.pack.states[1].treasury).toBe(ownerCash);
    expect(cash()).toBeCloseTo(before, 5);
  });

  it("keeps physical need inelastic and reduces the same wallet's other spending room", () => {
    const market = getMarkets()[0];
    const before = getHouseholdWealth(1);
    const low = buyHouseholdSalt(market, 1, 10, 100, 1);
    const afterLow = getHouseholdWealth(1);
    const high = buyHouseholdSalt(market, 1, 10, 100, 2);
    expect(high.bags).toBe(low.bags);
    expect(afterLow - getHouseholdWealth(1)).toBeCloseTo(2 * (before - afterLow), 2);
    market.goods[1] = { stock: 0, price: 3 };
    priceSalt(market, Goods.get(1)!, 100);
    const scarce = market.goods[1].price;
    market.goods[1].stock = 10000;
    priceSalt(market, Goods.get(1)!, 100);
    expect(market.goods[1].price).toBeLessThan(scarce);
    const saltPrice = market.goods[1].price;
    Markets.initializeMarketPrices();
    expect(market.goods[1].price).toBe(saltPrice);
  });

  it("partitions all residents without hiding neutral or unmarketed demand", () => {
    worldContext.pack.cells.state[0] = 0;
    setMarketCellColumn(Uint16Array.from([1, 0, 0]));
    expect(auditSaltPopulationCoverage()).toEqual({
      coveredPeople: 30_000,
      neutralPeople: 10_000,
      inactiveStatePeople: 0,
      unmarketedPeople: 20_000
    });
  });

  it("requires geological evidence for inland mines and brine wells, including legacy discovery", () => {
    worldContext.pack.cells.c[1] = [0];
    SaltLogistics.generate();
    expect(getSaltworks().some(w => w.stateId === 2)).toBe(false);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "evaporite",
        primaryCommodity: "sulfur",
        commodities: ["sulfur"],
        yields: [],
        richness: 1,
        depth: "shallow",
        groundwaterPressure: 0.8
      }
    ]);
    const existingCapacity = getSaltworks()[0].annualCapacityBags;
    SaltLogistics.settleMonth();
    expect(getSaltworks().find(w => w.stateId === 2)?.kind).toBe("brineWell");
    // State 1 no longer supplies state 2, which now has its own works; together they keep the same need.
    expect(getSaltworks().reduce((sum, w) => sum + w.annualCapacityBags, 0)).toBeCloseTo(existingCapacity, 1);
    SaltLogistics.settleMonth();
    expect(getSaltworks().filter(w => w.stateId === 2)).toHaveLength(1);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "evaporite",
        primaryCommodity: "sulfur",
        commodities: ["sulfur"],
        yields: [],
        richness: 1,
        depth: "shallow",
        groundwaterPressure: 0
      }
    ]);
    SaltLogistics.generate();
    expect(getSaltworks().find(w => w.stateId === 2)?.kind).toBe("rockSaltMine");
  });

  it("shares real crews across sites and returns their exact debit to the craft cycle", () => {
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    operation.kind = "rockSaltMine";
    const budget = createSaltProductionBudget();
    budget.capacity(operation);
    const maximumBags =
      (10 * 1000 * SALT_PRODUCTION_POLICY.hoursPerWorkerMonth) / (60 * SALT_PRODUCTION_POLICY.miningHoursPerKg);
    expect(budget.produce(operation, maximumBags / 2)).toBeCloseTo(maximumBags / 2);
    expect(budget.produce({ ...operation, i: 99 }, maximumBags)).toBeCloseTo(maximumBags / 2);
    expect(budget.produce(operation, 1)).toBe(0);
    expect(budget.charged.get(1)).toBeCloseTo(10);
    expect(budget.charged.has(2)).toBe(false);
    worldContext.pack.burgs[1].population = 0;
    const noCrew = createSaltProductionBudget();
    noCrew.capacity(operation);
    expect(noCrew.produce(operation, 1)).toBe(0);
  });

  it("caps boiling by physical Wood and charges only actual output once", () => {
    SaltLogistics.generate();
    const operation = getSaltworks()[0];
    operation.kind = "brineWell";
    const budget = createSaltProductionBudget();
    budget.capacity(operation);
    expect(budget.produce(operation, 10)).toBe(0);
    const salt = Goods.get(1)!;
    setGoods([salt, { i: 2, name: "Wood", tags: [], value: 1, unit: "pile", icon: "", color: "" }]);
    const fuelForTwoBags = (120 * SALT_PRODUCTION_POLICY.boilingWoodKgPerKg) / WOOD_KG_PER_LOT;
    getMarkets()[0].goods[2] = { stock: fuelForTwoBags, price: 1 };
    const flows: { goodId: number; units: number }[] = [];
    setGoodFlowObserver(flow => {
      if (flow.direction === "sink") flows.push(flow);
    });
    expect(budget.produce(operation, 10)).toBeCloseTo(2);
    expect(getMarkets()[0].goods[2].stock).toBe(0);
    expect(budget.produce(operation, 1)).toBe(0);
    expect(operation.monthlyLaborHours).toBeCloseTo(120 * SALT_PRODUCTION_POLICY.boilingHoursPerKg);
    expect(operation.monthlyFuelWoodUnits).toBeCloseTo(fuelForTwoBags);
    expect(flows).toMatchObject([{ goodId: 2, units: fuelForTwoBags }]);
  });

  it("allocates solar capacity to the dry warm season without winter or rainy output", () => {
    const temperatures = [0, 0, 5, 10, 20, 25, 30, 25, 20, 10, 5, 0];
    const weights = saltSolarWeights(temperatures, [0, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0]);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(weights[0]).toBe(0);
    expect(weights[4]).toBe(0);
    expect(weights[6]).toBeGreaterThan(weights[5]);
    expect(saltSolarWeights(new Array(12).fill(0), new Array(12).fill(0))).toEqual(new Array(12).fill(0));
  });

  it("observes monthly salt records without consuming or exposing mutable ledger state", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    const views = createObserveViews(
      () => worldContext,
      () => ({ year: 590, month: 1, day: 1, tick: 0 })
    );
    const before = JSON.stringify({
      works: getSaltworks(),
      shipments: getSaltShipments(),
      states: getStateSaltLedgers()
    });
    const first = views.salt()!;
    expect(views.salt()).toEqual(first);
    expect(first.kilogramsPerBag).toBe(60);
    expect(first.states.reduce((sum, row) => sum + row.population, 0)).toBe(60_000);
    first.states[0].saltworksIds.push(-1);
    first.states[0].population = 0;
    first.works[0].monthlyOutputBags = -1;
    first.works[0].owner!.id = -1;
    first.works[0].settlementOwner!.id = -1;
    first.shipments[0].sellerOwner!.id = -1;
    first.shipments[0].bags = -1;
    expect(
      JSON.stringify({ works: getSaltworks(), shipments: getSaltShipments(), states: getStateSaltLedgers() })
    ).toBe(before);
  });

  it("creates at least one population-scaled saltworks for every populated state", () => {
    SaltLogistics.generate();

    const works = getSaltworks();
    expect(works.map(operation => operation.stateId).sort()).toEqual([1, 2]);
    expect(works.every(operation => operation.annualCapacityBags > 0)).toBe(true);
  });

  it("wholesales domestic Salt to each city market and sells the household share", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const ledgers = getStateSaltLedgers();
    expect(ledgers).toHaveLength(2);
    expect(ledgers.every(ledger => ledger.monthlyDeliveredBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyHouseholdSalesBags > 0)).toBe(true);
    expect(ledgers.every(ledger => ledger.monthlyUnmetHouseholdBags === 0)).toBe(true);
    expect(getMarkets().every(market => (market.goods[1]?.stock ?? 0) > 0)).toBe(true);
    expect(getSaltShipments()).toHaveLength(2);
    expect(getOrCreateCumulativeMarketIntake()?.[1] ?? 0).toBeGreaterThan(0);
  });

  it("does not make one state pay another state's household requirement", () => {
    SaltLogistics.generate();
    SaltLogistics.settleMonth();

    const stateByMarket = new Map(
      getMarkets().map(market => [market.i, worldContext.pack.burgs[market.centerBurgId].state])
    );
    for (const shipment of getSaltShipments()) {
      expect(stateByMarket.get(shipment.fromMarketId)).toBe(shipment.exporterStateId);
      expect(stateByMarket.get(shipment.toMarketId)).toBe(shipment.importerStateId);
    }
    const expectedHouseholdBags =
      ((10_000 + 10_000) * SALT_HOUSEHOLD_KILOGRAMS_PER_PERSON_YEAR) / SALT_KILOGRAMS_PER_BAG / 12;
    expect(getStateSaltLedgers()[0].monthlyHouseholdSalesBags).toBeCloseTo(expectedHouseholdBags, 3);
  });

  it("stops landlocked production and supplies the country through a foreign market shipment", () => {
    // State 2 now touches State 1 but no sea or salt-lake water cell.
    worldContext.pack.cells.c[1] = [0];
    worldContext.pack.cells.c[2] = [0];

    SaltLogistics.generate();
    expect(getSaltworks().map(operation => operation.stateId)).toEqual([1]);

    SaltLogistics.settleMonth();
    SaltLogistics.settleMonth();

    const importShipment = getSaltShipments().find(
      shipment => shipment.exporterStateId === 1 && shipment.importerStateId === 2
    );
    expect(importShipment).toMatchObject({ fromMarketId: 1, toMarketId: 2, status: "inTransit" });
    const importerLedger = getStateSaltLedgers().find(ledger => ledger.stateId === 2);
    expect(importerLedger).toMatchObject({ monthlyOutputBags: 0 });
    expect(importerLedger?.monthlyImportedBags ?? 0).toBeGreaterThan(0);
  });

  it("keeps cargo in transit until its travel time elapses", () => {
    SaltLogistics.generate();
    setSaltShipments([
      {
        i: 99,
        exporterStateId: 1,
        importerStateId: 1,
        saltworksId: 1,
        fromMarketId: 1,
        toMarketId: 1,
        bags: 2,
        travelDays: 35,
        remainingDays: 35,
        status: "inTransit",
        unitPrice: 3
      }
    ]);

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "inTransit",
      remainingDays: 5
    });

    SaltLogistics.settleMonth();
    expect(getSaltShipments().find(shipment => shipment.i === 99)).toMatchObject({
      status: "delivered",
      remainingDays: 0
    });
  });

  it("records unmarketed neutral households as unmet instead of silently omitting them", () => {
    worldContext.pack.cells.state[0] = 0;
    setMarketCellColumn(Uint16Array.from([0, 2, 0]));
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 0)).toMatchObject({
      population: 10_000,
      unmarketedPeople: 10_000,
      monthlyHouseholdDemandBags: 50,
      monthlyHouseholdSalesBags: 0,
      monthlyUnmetHouseholdBags: 50
    });
    expect(getStateSaltLedgers().reduce((sum, row) => sum + row.population, 0)).toBe(60_000);
  });

  it("forecasts actual processing once without withdrawing its ingredients again", () => {
    SaltLogistics.generate();
    const market = getMarkets()[0];
    market.goods[1] = { stock: 10_000, price: 3 };
    market.goods[1].stock -= 2;
    recordGoodFlow({ direction: "sink", category: "recipeInput", goodId: 1, units: 2, marketId: market.i });
    SaltLogistics.settleMonth();
    expect(market.saltProcessingInputBags).toBe(0);
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyProcessingForecastBags).toBe(2);
    expect(market.goods[1].stock).toBeCloseTo(9898, 4);
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyProcessingForecastBags).toBe(0);
  });

  it("uses real herd heads without fabricating an unmeasured natural salt credit", () => {
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.generate();
    const market = getMarkets()[0];
    market.goods[1] = { stock: 10_000, price: 3 };
    SaltLogistics.settleMonth();
    const row = getStateSaltLedgers().find(row => row.stateId === 1)!;
    expect(row.monthlyLivestockTotalRequirementBags).toBeCloseTo(33.3333, 4);
    expect(row.monthlyLivestockNaturalBags).toBe(0);
    expect(row.monthlyLivestockSuppliedBags).toBeCloseTo(33.3333 * SALT_LIVESTOCK_PURCHASED_SHARE, 4);
    expect(row.monthlyUnmetLivestockBags).toBe(0);
    expect(market.goods[1].stock).toBeCloseTo(10_000 - 100 - 33.3333 * SALT_LIVESTOCK_PURCHASED_SHARE, 4);
  });

  it("shares one processing forecast across states using the same market", () => {
    worldContext.pack.burgs[2].market = 1;
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    SaltLogistics.generate();
    getMarkets()[0].saltProcessingInputBags = 3;
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().reduce((sum, row) => sum + (row.monthlyProcessingForecastBags ?? 0), 0)).toBeCloseTo(
      3,
      4
    );
  });

  it("lets neutral households use local stock without commissioning state cargo", () => {
    worldContext.pack.cells.state[0] = 0;
    SaltLogistics.generate();
    getMarkets()[0].goods[1] = { stock: 60, price: 3 };
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 0)?.monthlyHouseholdSalesBags).toBe(10);
    expect(getSaltShipments().some(shipment => shipment.importerStateId === 0)).toBe(false);
    expect(getSaltworks().some(works => works.stateId === 0)).toBe(false);
  });

  it("reserves shared stock for all households before livestock", () => {
    worldContext.pack.burgs[2].market = 1;
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.generate();
    for (const works of getSaltworks()) works.active = false;
    getMarkets()[0].goods[1] = { stock: 300, price: 3 };
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().reduce((sum, row) => sum + row.monthlyHouseholdSalesBags, 0)).toBe(300);
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyLivestockSuppliedBags).toBe(0);
  });

  it("resizes installed saltworks to the current provision of people and herds", () => {
    SaltLogistics.generate();
    const before = getSaltworks().reduce((sum, w) => sum + w.annualCapacityBags, 0);
    // Herds placed after generation (as on the fixed World) were missing from the capacity.
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.settleMonth();
    const provision = getStateSaltLedgers().reduce((sum, row) => sum + row.monthlyProvisionBags, 0);
    const after = getSaltworks().reduce((sum, w) => sum + w.annualCapacityBags, 0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(provision * 12 * 1.15, 0);
  });

  it("orders and reserves the full livestock need even when the rural purse is empty", () => {
    const stockWith = (ruralPurse: number) => {
      setUpWorld();
      getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
      SaltLogistics.generate();
      for (let month = 0; month < 6; month++) {
        for (const market of getMarkets()) market.foodLedger!.ruralHouseholdWealth = ruralPurse;
        SaltLogistics.settleMonth();
      }
      return getMarkets().find(m => m.i === 1)!.goods[1].stock;
    };
    // Market 1 needs 100 household and 13.3 bought livestock bags a month; the works stock the herds'
    // three months too, so supply follows physical need rather than the purse.
    const householdBags = 100;
    const livestockBags = 1200 * (20 / 60 / 12) * SALT_LIVESTOCK_PURCHASED_SHARE;
    expect(stockWith(0)).toBeGreaterThanOrEqual((householdBags + livestockBags) * 3);
  });

  it("sells livestock salt on account beyond a share of the rural purse, across states", () => {
    // Both states' herds buy at Market 1, so its one allowance must cover them together.
    setMarketCellColumn(Uint16Array.from([1, 1, 0]));
    getOrCreateFaunaStockTable()!["0:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    getOrCreateFaunaStockTable()!["1:Cattle"] = { young: 0, breeding: 1200, old: 0 };
    SaltLogistics.generate();
    for (const works of getSaltworks()) works.active = false;
    const market = getMarkets().find(m => m.i === 1)!;
    market.goods[1] = { stock: 1e6, price: 3 };
    market.foodLedger!.ruralHouseholdWealth = 1000;
    SaltLogistics.settleMonth();
    const ledgers = getStateSaltLedgers().filter(row => row.stateId === 1 || row.stateId === 2);
    const paid = ledgers.reduce((sum, row) => sum + row.monthlyLivestockPaid, 0);
    // The herds take their full need, but pay at most 5% of the 1000 purse; the rest is on account.
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThanOrEqual(1000 * SALT_LIVESTOCK_CASH_SHARE + 0.01);
    expect(ledgers.every(row => row.monthlyUnmetLivestockBags < 1e-6)).toBe(true);
    const owed = market.marketTreasury!.ruralSaltReceivable!;
    const supplied = ledgers.reduce((sum, row) => sum + row.monthlyLivestockSuppliedBags, 0);
    expect(owed).toBeCloseTo(supplied * market.goods[1].price - paid, 1);
    // Next month the allowance repays the debt before buying more.
    market.foodLedger!.ruralHouseholdWealth = 1000;
    SaltLogistics.settleMonth();
    expect(market.marketTreasury!.ruralSaltReceivable!).toBeLessThan(owed + supplied * market.goods[1].price);
  });

  it("uses horse fauna heads without applying the market lot conversion", () => {
    getOrCreateFaunaStockTable()!["0:Horses"] = { young: 0, breeding: 120, old: 0 };
    SaltLogistics.generate();
    SaltLogistics.settleMonth();
    expect(getStateSaltLedgers().find(row => row.stateId === 1)?.monthlyLivestockDemandBags).toBeCloseTo(
      3.8889 * SALT_LIVESTOCK_PURCHASED_SHARE,
      4
    );
  });

  it("caps stock at the market reserve while output continues to replace household sales", () => {
    SaltLogistics.generate();
    // A 15% capacity margin fills the three-month reserve over twenty settlements.
    for (let month = 0; month < 24; month++) SaltLogistics.settleMonth();
    const initialStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const initialOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;

    for (let month = 0; month < 24; month++) SaltLogistics.settleMonth();

    const finalStock = getMarkets().reduce((sum, market) => sum + (market.goods[1]?.stock ?? 0), 0);
    const finalOutput = getOrCreateCumulativeMarketIntake()?.[1] ?? 0;
    expect(finalStock).toBeCloseTo(initialStock, 2);
    expect(finalOutput).toBeGreaterThan(initialOutput);
  });
});
