import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import {
  clearEconomyContext,
  initEconomyContext,
  setGoods,
  setTradeCorridors
} from "../extensions/economy/economyContext";
import type { Good } from "../extensions/economy/generators/goodsGeneratorTypes";
import type { TradeCorridor } from "../extensions/economy/generators/tradeCorridorLedgerTypes";
import type { ExtensionAPI } from "../types/extension-api";
import { buildChart } from "./charts-overview";

const grain = {
  i: 7,
  name: "Grain",
  tags: ["food", "stapleCrop"],
  value: 5,
  unit: "wain",
  icon: "",
  color: "#ccc",
  trade: { weight: 2, bulk: 2, rarity: 1, distancePremium: 0, timeValueTrend: 0, durability: 3, lossRisk: 1 },
  cargo: { cargoSlotsPerUnit: 2, handlingClass: "loose" }
} as Good;

const corridor = {
  burgA: 1,
  burgB: 2,
  departures: 1,
  cargoSlots: 8,
  value: 40,
  byMode: { land: 8, river: 0, sea: 0 },
  meanTravelDays: 1,
  idealTravelDays: 1,
  threat: 0,
  routeIds: [],
  ferryCrossings: 0,
  routeHits: {},
  goodsSlots: { "7": 8 }
} as TradeCorridor;

function valuesOf(chart: NonNullable<ReturnType<typeof buildChart>>): Record<string, number> {
  return Object.fromEntries(chart.sortedData.map(point => [`${point.name}|${point.group}`, point.value]));
}

describe("trade charts", () => {
  afterEach(() => {
    clearEconomyContext();
    worldContext.pack = {} as typeof worldContext.pack;
  });

  it("returns nothing before economy is initialised", () => {
    expect(
      buildChart({ entity: "burgs", plotBy: "trade_price", groupBy: "cultures", sorting: "value", type: "stackedBar" })
    ).toBeNull();
  });

  it("draws burg trade by price, weight, and trade heading", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [
        0,
        { i: 1, name: "West", state: 1, culture: 1, cell: 0 },
        { i: 2, name: "East", state: 1, culture: 2, cell: 1 }
      ],
      states: [
        { name: "no", color: "#ccc" },
        { name: "Realm", color: "#333" }
      ],
      cultures: [
        { name: "no", color: "#ccc" },
        { name: "Norse", color: "#48a" },
        { name: "Latin", color: "#a62" }
      ],
      cells: { religion: [1, 1], biomeCode: [0, 0], province: [0, 0] }
    } as unknown as typeof worldContext.pack;
    setGoods([grain]);
    setTradeCorridors([corridor]);

    const price = buildChart({
      entity: "burgs",
      plotBy: "trade_price",
      groupBy: "cultures",
      sorting: "name",
      type: "stackedBar"
    });
    expect(price?.title).toBe("Burgs by Trade volume (price) grouped by Culture");
    expect(price?.svgElement.tagName.toLowerCase()).toBe("svg");
    expect(valuesOf(price!)).toEqual({ "West|Norse": 40, "East|Latin": 40 });
    const tips = [...price!.svgElement.querySelectorAll("title")].map(node => node.textContent ?? "");
    expect(tips.some(tip => tip.includes("Infinity"))).toBe(false);
    expect(tips.filter(tip => tip.includes("(100%)"))).toHaveLength(2);

    const weight = buildChart({
      entity: "states",
      plotBy: "trade_weight",
      groupBy: "states",
      sorting: "value",
      type: "stackedBar"
    });
    expect(weight?.title).toBe("States by Trade volume (weight)");
    expect(valuesOf(weight!)).toEqual({ "Realm|Realm": 16 });

    const tags = buildChart({
      entity: "burgs",
      plotBy: "trade_tags",
      groupBy: "cultures",
      sorting: "name",
      type: "stackedBar"
    });
    expect(tags?.title).toBe("Burgs by Trade volume (trade heading) grouped by trade heading");
    expect(valuesOf(tags!)).toEqual({
      "West|Food": 8,
      "East|Food": 8
    });
  });

  it("draws only the requested rows in a tall burg window", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const burgs = [0];
    const corridors: TradeCorridor[] = [];
    for (let id = 1; id <= 30; id++) {
      burgs.push({ i: id, name: `N${String(id).padStart(2, "0")}`, state: 1, culture: 1, cell: 0 });
      if (id < 30) {
        corridors.push({
          ...corridor,
          burgA: id,
          burgB: id + 1,
          value: id,
          cargoSlots: 2,
          goodsSlots: { "7": 2 }
        });
      }
    }
    worldContext.pack = {
      burgs,
      states: [{ name: "no" }, { name: "Realm", color: "#333" }],
      cultures: [{ name: "no" }, { name: "Norse", color: "#48a" }],
      cells: { religion: [1], biomeCode: [0], province: [0] }
    } as unknown as typeof worldContext.pack;
    setGoods([grain]);
    setTradeCorridors(corridors);

    const chart = buildChart({
      entity: "burgs",
      plotBy: "trade_price",
      groupBy: "cultures",
      sorting: "value",
      type: "stackedBar"
    });
    expect(chart?.entityNames).toHaveLength(30);
    const bottom = chart!.renderPlot(0, 1);
    const top = chart!.renderPlot(29, 30);
    const bottomText = [...bottom.querySelectorAll("title")].map(node => node.textContent ?? "").join("\n");
    const topText = [...top.querySelectorAll("title")].map(node => node.textContent ?? "").join("\n");
    expect(bottomText).toContain(`Burg: ${chart!.entityNames[0]}`);
    expect(bottomText).not.toContain(`Burg: ${chart!.entityNames[29]}`);
    expect(topText).toContain(`Burg: ${chart!.entityNames[29]}`);
    expect(topText).not.toContain(`Burg: ${chart!.entityNames[0]}`);
    expect(chart!.svgElement.querySelectorAll("title").length).toBeGreaterThan(bottom.querySelectorAll("title").length);
    expect(chart!.axisElement.querySelectorAll("text").length).toBeGreaterThan(0);
    expect(chart!.legendElement.querySelectorAll("text").length).toBeGreaterThan(0);
  });
});
