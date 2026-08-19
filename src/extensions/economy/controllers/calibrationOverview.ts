import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import {
  getAdministrationEmployment,
  getConstructionOperations,
  getCraftDomainEmploymentRecords,
  getGuildKnowledgeStocks,
  getMineOperations,
  getMineralDeposits,
  getSmelterOperations,
  getWorldContext
} from "../economyContext";
import { getAdministrationEmploymentPeople } from "../generators/administrationEmployment";
import { getTradeWorkersByBurg } from "../generators/basicEmployment";
import { getHousingRecipeForBurg } from "../generators/constructionEmployment";
import { getCalibratedMonthlyLots, goodsForDomain, laborPointsForLots } from "../generators/craftDemandCalibration";
import {
  displayPeople,
  guildSaturationPoints,
  laborPeople,
  peopleToPoints,
  pointsToPeople
} from "../generators/craftScale";
import { collectGuildPractitioners, GUILD_SATURATION_WORKERS } from "../generators/guildKnowledge";
import { getMineEmploymentPeople } from "../generators/mineOperations";
import {
  expectedWorkerPeople,
  expectedWorkerPoints,
  OCCUPATIONAL_CALIBRATION,
  type OccupationalCalibrationRow
} from "../generators/occupationalCalibration";
import { getSmelterEmploymentPeople } from "../generators/smelterOperationsTypes";
import { type CalibrationOverviewRow, setCalibrationOverviewState } from "../store/calibrationOverviewState";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";

export function open(): void {
  openDialog("calibrationOverview");
  refreshCalibrationOverview();
}

export function refreshCalibrationOverview(): void {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate || 1000);
  const urbanization = Math.max(0, world.urbanization ?? 1);
  const burgs = world.pack.burgs ?? [];
  const states = world.pack.states ?? [];
  const practitioners = collectGuildPractitioners();
  const stockByKey = new Map(getGuildKnowledgeStocks().map(entry => [`${entry.burgId}:${entry.domain}`, entry.stock]));
  const craftByKey = new Map(
    getCraftDomainEmploymentRecords().map(record => [`${record.burgId}:${record.domain}`, record.workers])
  );
  const constructionByBurg = new Map(getConstructionOperations().map(op => [op.burgId, op] as const));
  // Site pools (mining/smelting/administration) show the authored, real-people Employment figure
  // (docs/plan/craft-demand-calibration.md §2.0 P3-P5) converted back to points so the shared
  // actualPeople = pointsToPeople(actualWorkerPoints, rate) derivation below roundtrips correctly —
  // not a raw pointsToPeople() of the population-point reconcile figure, which is how mine's actual
  // headcount used to inflate into the tens of thousands.
  const adminByBurg = new Map<number, number>();
  for (const record of getAdministrationEmployment()) {
    const state = states[record.stateId];
    if (!state?.i || state.removed) continue;
    adminByBurg.set(
      record.burgId,
      (adminByBurg.get(record.burgId) ?? 0) + peopleToPoints(getAdministrationEmploymentPeople(state, rate), rate)
    );
  }
  const mineByBurg = new Map<number, number>();
  for (const mine of getMineOperations()) {
    if (!mine.active || !mine.burgId) continue;
    const deposit = getMineralDeposits().find(candidate => candidate.i === mine.depositId);
    if (!deposit) continue;
    mineByBurg.set(
      mine.burgId,
      (mineByBurg.get(mine.burgId) ?? 0) + peopleToPoints(getMineEmploymentPeople(deposit), rate)
    );
  }
  const smeltByBurg = new Map<number, number>();
  for (const smelter of getSmelterOperations()) {
    if (!smelter.active || !smelter.burgId) continue;
    smeltByBurg.set(
      smelter.burgId,
      (smeltByBurg.get(smelter.burgId) ?? 0) + peopleToPoints(getSmelterEmploymentPeople(smelter), rate)
    );
  }
  const tradeByBurg = getTradeWorkersByBurg();

  const rows: CalibrationOverviewRow[] = [];
  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    if (burg.group === "fort") continue;
    const points = burg.population ?? 0;
    const labor = laborPeople(points, rate);
    const display = displayPeople(points, rate, urbanization);
    const port = Boolean(burg.port);
    const capital = Boolean(burg.capital);
    const recipe = getHousingRecipeForBurg(burg, false);

    const burgId = burg.i;
    for (const occ of OCCUPATIONAL_CALIBRATION) {
      rows.push(
        buildRow({
          burg: { i: burgId, name: burg.name, state: burg.state, port: burg.port, capital: burg.capital },
          stateName: (burg.state ? states[burg.state]?.name : undefined) ?? "—",
          occ,
          labor,
          display,
          rate,
          port,
          capital,
          recipe,
          practitioners,
          stockByKey,
          craftByKey,
          constructionByBurg,
          adminByBurg,
          mineByBurg,
          smeltByBurg,
          tradeByBurg
        })
      );
    }
  }

  rows.sort((a, b) => a.burgName.localeCompare(b.burgName) || a.pool.localeCompare(b.pool));
  setCalibrationOverviewState({ rows });
}

function buildRow(args: {
  burg: { i: number; name?: string; state?: number; port?: number; capital?: number };
  stateName: string;
  occ: OccupationalCalibrationRow;
  labor: number;
  display: number;
  rate: number;
  port: boolean;
  capital: boolean;
  recipe: { wood: number; stone: number; brick: number };
  practitioners: Map<string, { burgId: number; domain: string; workers: number }>;
  stockByKey: Map<string, number>;
  craftByKey: Map<string, number>;
  constructionByBurg: Map<number, { masonWorkers: number; carpenterWorkers: number }>;
  adminByBurg: Map<number, number>;
  mineByBurg: Map<number, number>;
  smeltByBurg: Map<number, number>;
  tradeByBurg: Map<number, number>;
}): CalibrationOverviewRow {
  const burgId = args.burg.i;
  const expectedPeople = expectedWorkerPeople({
    row: args.occ,
    laborPeople: args.labor,
    port: args.port,
    capital: args.capital,
    hasQuarry: false,
    housingRecipe: args.recipe
  });
  const expectedPoints = expectedWorkerPoints({
    row: args.occ,
    laborPeople: args.labor,
    populationRate: args.rate,
    port: args.port,
    capital: args.capital,
    hasQuarry: false,
    housingRecipe: args.recipe
  });

  let actualWorkerPoints = 0;
  if (args.occ.guildDomain) {
    const key = `${burgId}:${args.occ.guildDomain}`;
    actualWorkerPoints = args.practitioners.get(key)?.workers ?? args.craftByKey.get(key) ?? 0;
  } else if (args.occ.pool === "constructionCarpenter") {
    actualWorkerPoints = args.constructionByBurg.get(burgId)?.carpenterWorkers ?? 0;
  } else if (args.occ.pool === "constructionMason") {
    actualWorkerPoints = args.constructionByBurg.get(burgId)?.masonWorkers ?? 0;
  } else if (args.occ.pool === "administration") {
    actualWorkerPoints = args.adminByBurg.get(burgId) ?? 0;
  } else if (args.occ.pool === "mining") {
    actualWorkerPoints = args.mineByBurg.get(burgId) ?? 0;
  } else if (args.occ.pool === "smelting") {
    actualWorkerPoints = args.smeltByBurg.get(burgId) ?? 0;
  } else if (args.occ.pool === "trade") {
    actualWorkerPoints = args.tradeByBurg.get(burgId) ?? 0;
  }

  const actualPeople = pointsToPeople(actualWorkerPoints, args.rate);
  const goods = args.occ.guildDomain
    ? goodsForDomain(args.occ.guildDomain).map(good => {
        const lots = getCalibratedMonthlyLots({
          goodName: good.goodName,
          laborPeopleBurg: args.labor,
          port: args.port,
          capital: args.capital
        });
        return {
          goodName: good.goodName,
          provenanceLots: rn(lots, 4),
          laborPointsPerLot: good.laborPointsPerLotAtDefaultRate,
          authoredLaborPoints: rn(laborPointsForLots(good.goodName, lots, args.rate), 5),
          inlandShare: args.port ? good.portShare : good.inlandShare
        };
      })
    : [];
  const demandLots = goods.reduce((sum, good) => sum + good.provenanceLots, 0);
  const laborFromAuthoredLots = goods.reduce((sum, good) => sum + good.authoredLaborPoints, 0);
  const stock = args.occ.guildDomain ? (stockByKeyOrNull(args.stockByKey, burgId, args.occ.guildDomain) ?? null) : null;
  const guildSaturation = getEconomyCalibrationState().applyCalibration
    ? guildSaturationPoints(args.rate)
    : GUILD_SATURATION_WORKERS;
  const guildCoverage = args.occ.guildDomain != null ? Math.min(1, actualWorkerPoints / guildSaturation) : null;
  const domain =
    args.occ.guildDomain ??
    (args.occ.pool === "constructionCarpenter" || args.occ.pool === "constructionMason"
      ? "construction"
      : args.occ.pool);

  return {
    id: `${burgId}:${args.occ.pool}`,
    burgId,
    burgName: args.burg.name || `Burg ${burgId}`,
    stateId: args.burg.state ?? 0,
    stateName: args.stateName,
    pool: args.occ.pool,
    domain,
    displayPeople: rn(args.display, 1),
    laborPeople: rn(args.labor, 1),
    expectedPeople: rn(expectedPeople, 2),
    expectedPoints: rn(expectedPoints, 5),
    actualWorkerPoints: rn(actualWorkerPoints, 4),
    actualPeople: rn(actualPeople, 1),
    ratio: expectedPeople > 1e-9 ? rn(actualPeople / expectedPeople, 3) : null,
    demandLots: rn(demandLots, 4),
    laborFromAuthoredLots: rn(laborFromAuthoredLots, 5),
    guildCoverage: guildCoverage == null ? null : rn(guildCoverage, 3),
    stock: stock == null ? null : rn(stock, 3),
    goods
  };
}

function stockByKeyOrNull(stockByKey: Map<string, number>, burgId: number, domain: string): number | undefined {
  return stockByKey.get(`${burgId}:${domain}`);
}
