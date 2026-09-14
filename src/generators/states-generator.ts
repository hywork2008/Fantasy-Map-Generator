import { mean, median, sum } from "d3";
import FlatQueue from "flatqueue";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { isForestBiome } from "../data/biomeCatalog";
import { HeightThreshold } from "../data/constants";
import { findWarRouteCells } from "../services/warRouteFinder";
import { useOptionsState } from "../store/optionsState";
import type {
  Campaign,
  State,
  WarDetails,
  WarForces,
  WarNonBelligerent,
  WarParticipant,
  WarPledge
} from "../types/models";
import type { WorldState } from "../types/WorldState";
import {
  each,
  findCell,
  gauss,
  getAdjective,
  getMixedColor,
  getPolesOfInaccessibility,
  getRandomColor,
  minmax,
  P,
  rand,
  rn,
  rw,
  trimVowels
} from "../utils";
import { TIME } from "../utils/debug";
import { generateWorldLanguages } from "../utils/worldLanguages";
import { getStateExpandDangerCost } from "./dangerExpandPolicy";
import { COA } from "./emblem/generator";
import { enforceGiantWaterSourceSovereignty } from "./giantWaterSourceSovereignty";
import { populateAllIndependentBurgs } from "./independentBurgGovernance";
import { assignInitialPolities, clearUnclaimedOikoumenePopulation } from "./initialPolities";
import { Names } from "./names-generator";
import { generateWarCasusBelli } from "./warCasusBelli";
import {
  areStatesSeaConnected,
  findBorderBurgs,
  findFrontlineTargetBurg,
  findStagingBurg,
  resolveAlliedAttackerTarget,
  resolveLeaderWarEndpoints
} from "./warFrontierBurgs";

class StatesModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  private createStates() {
    const { pack } = this.worldContext;
    const states: State[] = [{ i: 0, name: "Neutrals" } as State];
    if (!pack.burgs?.length) return states;
    const each5th = each(5);
    const sizeVariety = useOptionsState.getState().sizeVariety;

    pack.burgs.forEach(burg => {
      if (!burg.i || !burg.capital) return;

      const expansionism = rn(Math.random() * sizeVariety + 1, 1);
      const basename =
        burg.name!.length < 9 && each5th(burg.cell)
          ? burg.name!
          : Names.getCultureShort(this.worldContext, this.viewContext, this.appServices, burg.culture!);
      const name = Names.getState(basename, burg.culture!);
      const type = pack.cultures[burg.culture!].type;
      const coa = COA.generate(null, null, null, type);
      coa.shield = COA.getShield(burg.culture!);
      states.push({
        i: burg.i,
        name,
        expansionism,
        capital: burg.i,
        type: type!,
        center: burg.cell,
        culture: burg.culture!,
        coa,
        security: 50,
        sanitation: 50,
        medicalCare: 50
      });
    });

    return states;
  }

  private getBiomeCost(b: number, biome: number, type: string) {
    const { biomesData } = this.worldContext;
    if (b === biome) return 10; // tiny penalty for native biome
    if (type === "Hunting") return biomesData.cost[biome] * 2; // non-native biome penalty for hunters
    if (type === "Nomadic" && isForestBiome(biomesData, biome)) return biomesData.cost[biome] * 3; // forest tag penalty for nomads
    return biomesData.cost[biome]; // general non-native biome penalty
  }

  private getHeightCost(f: { type: string }, h: number, type: string) {
    if (type === "Lake" && f.type === "lake") return 10; // low lake crossing penalty for Lake cultures
    if (type === "Naval" && h < HeightThreshold.WATER_MAX_HEIGHT) return 300; // low sea crossing penalty for Navals
    if (type === "Nomadic" && h < HeightThreshold.WATER_MAX_HEIGHT) return 10000; // giant sea crossing penalty for Nomads
    if (h < HeightThreshold.WATER_MAX_HEIGHT) return 1000; // general sea crossing penalty
    if (type === "Highland" && h < HeightThreshold.HIGHLAND_MIN) return 1100; // penalty for highlanders on lowlands
    if (type === "Highland") return 0; // no penalty for highlanders on highlands
    if (h >= HeightThreshold.MOUNTAIN_MIN) return 2200; // general mountains crossing penalty
    if (h >= HeightThreshold.HILL_MIN) return 300; // general hills crossing penalty
    return 0;
  }

  private getRiverCost(r: number, i: number, type: string) {
    const { pack } = this.worldContext;
    if (type === "River") return r ? 0 : 100; // penalty for river cultures
    if (!r) return 0; // no penalty for others if there is no river
    return minmax(pack.cells.fl[i] / 10, 20, 100); // river penalty from 20 to 100 based on flux
  }

  private getTypeCost(t: number, type: string) {
    if (t === 1) return type === "Naval" || type === "Lake" ? 0 : type === "Nomadic" ? 60 : 20; // penalty for coastline
    if (t === 2) return type === "Naval" || type === "Nomadic" ? 30 : 0; // low penalty for land level 2 for Navals and nomads
    if (t !== -1) return type === "Naval" || type === "Lake" ? 100 : 0; // penalty for mainland for navals
    return 0;
  }

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack } = state;
    TIME && console.time("generateStates");
    if (!pack.burgs?.length) {
      pack.states = [{ i: 0, name: "Neutrals" } as State];
      pack.cells.state = pack.cells.state || new Uint16Array(pack.cells.i.length);
      return;
    }
    pack.states = this.createStates();
    this.expandStates(this.worldContext, this.viewContext, this.appServices);
    this.normalize();
    enforceGiantWaterSourceSovereignty({
      burgs: pack.burgs,
      cells: pack.cells,
      cultures: pack.cultures,
      culturesSet: useOptionsState.getState().culturesSet,
      races: pack.races,
      rivers: pack.rivers,
      states: pack.states
    });
    this.getPoles(state);
    this.findNeighbors();
    this.assignColors(this.worldContext, this.viewContext, this.appServices);
    if (!pack.languageWorld) pack.languageWorld = generateWorldLanguages(pack.cultures, pack.states);
    else {
      // State regeneration preserves language identities and policies already chosen by the editor.
      for (const state of pack.states) {
        if (!state.i || state.removed || pack.languageWorld.states.some(policy => policy.stateId === state.i)) continue;
        const ids =
          pack.languageWorld.cultures
            .find(profile => profile.cultureId === state.culture)
            ?.languages.map(entry => entry.languageId) ?? [];
        pack.languageWorld.states.push({
          stateId: state.i,
          administrativeLanguageIds: [...ids],
          courtLanguageIds: [...ids],
          diplomaticLanguageIds: [...ids],
          recognizedLanguageIds: [...ids]
        });
      }
    }
    this.generateCampaigns();
    this.generateDiplomacy();
    populateAllIndependentBurgs(this.worldContext);

    TIME && console.timeEnd("generateStates");
  }

  expandStates(worldContext: WorldContext, viewContext: Readonly<ViewContext>, appServices: AppServices) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack } = this.worldContext;
    TIME && console.time("expandStates");
    const { cells, states, cultures, burgs } = pack;
    // `standard` preserves the historical complete flood-fill. The other
    // settlement patterns deliberately keep political control limited to
    // inhabited nuclei; traversal may cross wilderness, but it must not turn
    // that wilderness into state territory.
    const useSettlementNuclei = this.worldContext.options.initialSettlementPattern !== "standard";

    cells.state = cells.state || new Uint16Array(cells.i.length);

    if (useSettlementNuclei) {
      const plan = pack.settlementFoundation;
      if (plan)
        assignInitialPolities({
          plan,
          cells,
          burgs,
          states,
          realmSize: this.worldContext.options.initialPolityRealmSize
        });
      else {
        cells.state.fill(0);
        for (const state of states) {
          if (!state.i || state.removed) continue;
          const capitalCell = burgs[state.capital]?.cell;
          if (capitalCell !== undefined) cells.state[capitalCell] = state.i;
        }
        burgs
          .filter(b => b.i && !b.removed)
          .forEach(b => {
            b.state = cells.state[b.cell];
            b.stateHistory = [b.state];
          });
        clearUnclaimedOikoumenePopulation(cells);
      }
      TIME && console.timeEnd("expandStates");
      return;
    }

    const queue = new FlatQueue<{ e: number; p: number; s: number; b: number }>();
    const cost: number[] = [];

    const { growthRate: globalGrowthRate, statesGrowthRate } = useOptionsState.getState();
    const growthRate = (cells.i.length / 2) * globalGrowthRate * statesGrowthRate; // limit cost for state growth

    // remove state from all cells except of locked
    for (const cellId of cells.i) {
      const state = states[cells.state[cellId]];
      if (state.lock) continue;
      cells.state[cellId] = 0;
    }

    for (const state of states) {
      if (!state.i || state.removed) continue;

      const capitalCell = burgs[state.capital].cell;
      cells.state[capitalCell] = state.i;
      const cultureCenter = cultures[state.culture].center!;
      const b = cells.biomeCode[cultureCenter]; // state native biome
      queue.push({ e: state.center, p: 0, s: state.i, b }, 0);
      cost[state.center] = 1;
    }

    while (queue.length) {
      const next = queue.pop()!;

      const { e, p, s, b } = next;
      const { type, culture } = states[s];

      cells.c[e].forEach(e => {
        const state = states[cells.state[e]];
        if (state.lock) return; // do not overwrite cell of locked states
        if (cells.state[e] && e === state.center) return; // do not overwrite capital cells

        // Phase 2 wild oikoumene: do not annex high-danger wilderness (monster/beast cores).
        const danger = cells.danger?.[e] ?? 0;
        const dangerCost = getStateExpandDangerCost(danger);
        if (dangerCost === null) return;

        const cultureCost = culture === cells.culture[e] ? -9 : 100;
        const populationCost = cells.h[e] < 20 ? 0 : cells.s[e] ? Math.max(20 - cells.s[e], 0) : 5000;
        const biomeCost = this.getBiomeCost(b, cells.biomeCode[e], type);
        const heightCost = this.getHeightCost(pack.features[cells.f[e]], cells.h[e], type);
        const riverCost = this.getRiverCost(cells.r[e], e, type);
        const typeCost = this.getTypeCost(cells.t[e], type);
        const cellCost = Math.max(
          cultureCost + populationCost + biomeCost + heightCost + riverCost + typeCost + dangerCost,
          0
        );
        const totalCost = p + 10 + cellCost / states[s].expansionism;

        if (totalCost > growthRate) return;

        if (!cost[e] || totalCost < cost[e]) {
          if (cells.h[e] >= 20 && (!useSettlementNuclei || cells.pop[e] > 0 || cells.burg[e])) {
            cells.state[e] = s; // assign only settled land when preserving a frontier
          }
          cost[e] = totalCost;
          queue.push({ e, p: totalCost, s, b }, totalCost);
        }
      });
    }

    burgs
      .filter(b => b.i && !b.removed)
      .forEach(b => {
        b.state = cells.state[b.cell]; // assign state to burgs
        b.stateHistory = [b.state]; // baseline ownership record — see Burg.stateHistory
      });
    TIME && console.timeEnd("expandStates");
  }

  normalize() {
    const { pack } = this.worldContext;
    TIME && console.time("normalizeStates");
    const { cells, burgs } = pack;

    // Shape normalization assumes every land cell belongs to a state. In
    // frontier modes it would silently absorb unclaimed land into a neighbor.
    if (this.worldContext.options.initialSettlementPattern !== "standard") return;

    for (const i of cells.i) {
      if (cells.h[i] < 20 || cells.burg[i]) continue; // do not overwrite burgs
      if (pack.states[cells.state[i]]?.lock) continue; // do not overwrite cells of locks states
      if (cells.c[i].some(c => burgs[cells.burg[c]].capital)) continue; // do not overwrite near capital
      const neibs = cells.c[i].filter(c => cells.h[c] >= 20);
      const adversaries = neibs.filter(c => !pack.states[cells.state[c]]?.lock && cells.state[c] !== cells.state[i]);
      if (adversaries.length < 2) continue;
      const buddies = neibs.filter(c => !pack.states[cells.state[c]]?.lock && cells.state[c] === cells.state[i]);
      if (buddies.length > 2) continue;
      if (adversaries.length <= buddies.length) continue;
      cells.state[i] = cells.state[adversaries[0]];
    }
    TIME && console.timeEnd("normalizeStates");
  }

  // calculate pole of inaccessibility for each state
  getPoles(state: WorldState) {
    const { pack } = state;
    const getType = (cellId: number) => pack.cells.state[cellId];
    const poles = getPolesOfInaccessibility(pack, getType);

    pack.states.forEach(s => {
      if (!s.i || s.removed) return;
      s.pole = poles[s.i] || [0, 0];
    });
  }

  findNeighbors(context: WorldContext = this.worldContext) {
    const { pack } = context;
    const { cells, states } = pack;

    const stateNeighbors: Set<number>[] = [];

    states.forEach(s => {
      if (!s.i || s.removed) return;
      stateNeighbors[s.i] = new Set();
      // s.neighbors = stateNeighbors[s.i];
    });

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const s = cells.state[i];
      if (!s) continue;

      cells.c[i]
        .filter(c => cells.h[c] >= 20 && cells.state[c] && cells.state[c] !== s)
        .forEach(c => {
          stateNeighbors[s].add(cells.state[c]);
        });
    }

    // convert neighbors Set object into array
    states.forEach(s => {
      if (!stateNeighbors[s.i] || s.removed) return;
      s.neighbors = Array.from(stateNeighbors[s.i]);
    });
  }

  assignColors(worldContext: WorldContext, viewContext: Readonly<ViewContext>, appServices: AppServices) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack } = this.worldContext;
    TIME && console.time("assignColors");
    const colors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f"]; // d3.schemeSet2;
    const states = pack.states;

    // assign basic color using greedy coloring algorithm
    states.forEach(state => {
      if (!state.i || state.removed || state.lock) return;
      state.color = colors.find(color => state.neighbors!.every(neibStateId => states[neibStateId].color !== color));
      if (!state.color) state.color = getRandomColor();
      colors.push(colors.shift() as string);
    });

    // randomize each already used color a bit
    colors.forEach(c => {
      const sameColored = states.filter(state => state.color === c && state.i && !state.lock);
      sameColored.forEach((state, index) => {
        if (!index) return;
        state.color = getMixedColor(state.color!);
      });
    });

    TIME && console.timeEnd("assignColors");
  }

  // calculate states data like area, population etc.
  collectStatistics(state: WorldState) {
    const { pack } = state;
    TIME && console.time("collectStatistics");
    const { cells, states } = pack;

    states.forEach(s => {
      if (s.removed) return;
      s.cells = s.area = s.burgs = s.rural = s.urban = 0;
    });

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const s = cells.state[i];
      if (!s) continue; // state 0 is unclaimed land, not a national aggregate

      // collect stats
      states[s].cells! += 1;
      states[s].area! += cells.area[i];
      states[s].rural! += cells.pop[i];
      if (cells.burg[i]) {
        states[s].urban! += pack.burgs[cells.burg[i]].population!;
        states[s].burgs!++;
      }
    }

    TIME && console.timeEnd("collectStatistics");
  }

  generateCampaign(state: State) {
    const { pack, options } = this.worldContext;
    const wars = {
      War: 6,
      Conflict: 2,
      Campaign: 4,
      Invasion: 2,
      Rebellion: 2,
      Conquest: 2,
      Intervention: 1,
      Expedition: 1,
      Crusade: 1
    };
    const neighbors = state.neighbors?.length ? state.neighbors : [];
    return neighbors
      .map((i: number) => {
        const name =
          i && P(0.8)
            ? pack.states[i].name
            : Names.getCultureShort(this.worldContext, this.viewContext, this.appServices, state.culture);
        const currentYear = options.year!;
        const start = gauss(currentYear - 100, 150, 1, currentYear - 6);
        const end = start + gauss(4, 5, 1, currentYear - start - 1);
        return { name: `${getAdjective(name)} ${rw(wars)}`, start, end, attacker: state.i!, defender: i };
      })
      .sort((a, b) => a.start - b.start);
  }

  generateCampaigns() {
    const { pack } = this.worldContext;
    pack.states.forEach(s => {
      if (!s.i || s.removed) return;
      s.campaigns = this.generateCampaign(s);
    });
  }

  // generate Diplomatic Relationships
  generateDiplomacy() {
    const { pack, options } = this.worldContext;
    TIME && console.time("generateDiplomacy");
    const { cells, states } = pack;
    states[0].diplomacy = [];
    // FIRST STATE IS ALWAYS NEUTRAL and contains the history of diplomacy
    const chronicle = states[0].diplomacy;
    const valid = states.filter(s => s.i && !s.removed); // will filter out neutral as i is 0 => false

    // Pre-Calculate state area since collectStatistics() hasn't run yet.
    const stateAreas = new Float32Array(states.length);
    for (const i of cells.i) {
      if (cells.h[i] >= 20 && cells.state[i]) {
        stateAreas[cells.state[i]] += cells.area[i];
      }
    }

    const neibs = { Ally: 1, Friendly: 2, Neutral: 1, Suspicion: 10, Rival: 9 }; // relations to neighbors
    const neibsOfNeibs = { Ally: 10, Friendly: 8, Neutral: 5, Suspicion: 1 }; // relations to neighbors of neighbors
    const far = { Friendly: 1, Neutral: 12, Suspicion: 2, Unknown: 6 }; // relations to other
    const navals = { Neutral: 1, Suspicion: 2, Unknown: 1 }; // relations of naval powers

    valid.forEach(s => {
      s.diplomacy = new Array(states.length).fill("x"); // clear all relationships
    });
    if (valid.length < 2) return; // no states to generate relations with
    const areaMean: number = mean(valid.map(s => stateAreas[s.i])) as number; // average state area

    // generic relations
    for (let f = 1; f < states.length; f++) {
      if (states[f].removed) continue;
      if (states[f].diplomacy!.includes("Vassal")) {
        // Vassals copy relations from their Suzerains
        const suzerain = states[f].diplomacy!.indexOf("Vassal");

        for (let i = 1; i < states.length; i++) {
          if (i === f || i === suzerain) continue;
          let inherited = states[suzerain].diplomacy![i];
          if (inherited === "Suzerain") inherited = "Ally";
          else if ((inherited === "Rival" || inherited === "Enemy") && !states[f].neighbors!.includes(i))
            inherited = "Suspicion";
          if (inherited === "Ally" && !states[f].neighbors!.includes(i) && !areStatesSeaConnected(pack, f, i)) {
            inherited = "Friendly";
          }
          states[f].diplomacy![i] = inherited;

          for (let e = 1; e < states.length; e++) {
            if (e === f || e === suzerain) continue;
            if (states[e].diplomacy![suzerain] === "Suzerain" || states[e].diplomacy![suzerain] === "Vassal") continue;
            let relEToF = states[e].diplomacy![suzerain];
            if ((relEToF === "Rival" || relEToF === "Enemy") && !states[e].neighbors!.includes(f))
              relEToF = "Suspicion";
            if (relEToF === "Ally" && !states[e].neighbors!.includes(f) && !areStatesSeaConnected(pack, e, f)) {
              relEToF = "Friendly";
            }
            states[e].diplomacy![f] = relEToF;
          }
        }
        continue;
      }

      for (let t = f + 1; t < states.length; t++) {
        if (states[t].removed) continue;

        if (states[t].diplomacy!.includes("Vassal")) {
          const suzerain = states[t].diplomacy!.indexOf("Vassal");
          let inherited = states[f].diplomacy![suzerain];
          if ((inherited === "Rival" || inherited === "Enemy") && !states[f].neighbors!.includes(t))
            inherited = "Suspicion";
          if (inherited === "Ally" && !states[f].neighbors!.includes(t) && !areStatesSeaConnected(pack, f, t)) {
            inherited = "Friendly";
          }
          states[f].diplomacy![t] = inherited;
          continue;
        }

        const naval =
          states[f].type === "Naval" &&
          states[t].type === "Naval" &&
          cells.f[states[f].center] !== cells.f[states[t].center];
        const neib = naval ? false : states[f].neighbors!.includes(t);
        const neibOfNeib =
          naval || neib ? false : states[f].neighbors!.some(n => n !== 0 && states[n].neighbors!.includes(t));

        let status = naval ? rw(navals) : neib ? rw(neibs) : neibOfNeib ? rw(neibsOfNeibs) : rw(far);

        // add Vassal
        if (neib && P(0.8) && stateAreas[f] > areaMean && stateAreas[t] < areaMean && stateAreas[f] / stateAreas[t] > 2)
          status = "Vassal";

        // Prohibit defense pact (Ally) if neither direct land neighbors nor sea-connected
        if (status === "Ally") {
          const isDirect = states[f].neighbors!.includes(t);
          const isSea = areStatesSeaConnected(pack, f, t);
          if (!isDirect && !isSea) {
            status = "Friendly";
          }
        }

        states[f].diplomacy![t] = status === "Vassal" ? "Suzerain" : status;
        states[t].diplomacy![f] = status;
      }
    }

    // declare wars
    let eventIdCounter = 0;
    const warCounts = new Map<string, number>();

    const getEventEndpoints = (from: number, to: number) => {
      const endpoints = resolveLeaderWarEndpoints(pack, from, to);
      return {
        fromBurg: endpoints.fromBurg?.i,
        toBurg: endpoints.toBurg?.i
      };
    };

    const isPathBlocked = (from: number, to: number) => {
      const { fromBurg, toBurg } = getEventEndpoints(from, to);
      const p1 = fromBurg ? pack.burgs[fromBurg] : pack.cells.p[states[from].center];
      const p2 = toBurg ? pack.burgs[toBurg] : pack.cells.p[states[to].center];
      if (!p1 || !p2) return false;
      const x1 = "x" in p1 ? p1.x : p1[0];
      const y1 = "y" in p1 ? p1.y : p1[1];
      const x2 = "x" in p2 ? p2.x : p2[0];
      const y2 = "y" in p2 ? p2.y : p2[1];

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(20, Math.ceil(dist / 2));
      for (let i = 1; i < steps; i++) {
        const x = x1 + (x2 - x1) * (i / steps);
        const y = y1 + (y2 - y1) * (i / steps);
        const cellId = findCell(x, y);
        if (cellId !== undefined) {
          const stateId = pack.cells.state[cellId];
          if (stateId !== 0 && stateId !== from && stateId !== to) {
            return true;
          }
        }
      }
      return false;
    };

    const getStatePorts = (stateId: number) => {
      return (pack.burgs || []).filter(b => b.state === stateId && b.port);
    };

    const estimateForces = (
      stateId: number,
      role: "leader" | "ally" | "vassal",
      transitType: "naval_expedition" | "military_transit" | "direct_border",
      vesselsUsed?: number
    ): WarForces => {
      let rawPop = 0;
      for (const i of cells.i) {
        if (cells.h[i] >= 20 && cells.state[i] === stateId) {
          rawPop += cells.pop?.[i] || 0;
          if (cells.burg?.[i] && pack.burgs) {
            rawPop += pack.burgs[cells.burg[i]]?.population || 0;
          }
        }
      }
      const populationRate = this.worldContext.populationRate ?? 1000;
      const totalPop = rawPop > 0 ? rawPop * populationRate : (stateAreas[stateId] || 50) * 800;

      // Historical total military pool is ~1.2% - 1.5% of population (e.g. 2M pop -> ~27k army)
      const totalMilitaryPool = Math.max(300, Math.round(totalPop * 0.0135));

      // Belligerent deployment share of total military pool
      const mobilizationRate = role === "leader" ? 0.6 : role === "ally" ? 0.22 : 0.38;
      const mobilizedTotal = Math.max(
        150,
        Math.round(totalMilitaryPool * mobilizationRate * (0.85 + Math.random() * 0.3))
      );

      const cavRatio = 0.18;
      const cavalry = Math.round(mobilizedTotal * cavRatio);
      const navalForces = transitType === "naval_expedition" ? (vesselsUsed ? vesselsUsed * 30 : 600) : undefined;
      const infantry = Math.max(100, mobilizedTotal - cavalry);
      const total = infantry + cavalry + (navalForces || 0);
      return { infantry, cavalry, naval: navalForces, total };
    };

    const diplomacyHistoryAttempts = useOptionsState.getState().diplomacyHistoryAttempts ?? 1;
    const maxWarDisparityRatio = useOptionsState.getState().maxWarDisparityRatio ?? 8;
    for (let attempt = 0; attempt < diplomacyHistoryAttempts; attempt++) {
      for (let attacker = 1; attacker < states.length; attacker++) {
        const ad = states[attacker].diplomacy as string[]; // attacker relations;
        if (states[attacker].removed) continue;
        if (!ad.includes("Rival") && !ad.includes("Suspicion") && !ad.includes("Enemy")) continue; // no enemies to attack
        if (ad.includes("Vassal")) continue; // not independent
        if (P(0.1)) continue; // randomize war frequency

        const validDefenders = ad
          .map((r, d) =>
            (r === "Rival" || r === "Suspicion" || r === "Enemy") &&
            !states[d].diplomacy!.includes("Vassal") &&
            states[attacker].neighbors!.includes(d)
              ? d
              : 0
          )
          .filter(d => d);
        if (!validDefenders.length) continue;

        let defender = 0;
        const shuffledDefenders = [...validDefenders].sort((a, b) => {
          const keyA = [attacker, a].sort((x, y) => x - y).join("-");
          const keyB = [attacker, b].sort((x, y) => x - y).join("-");
          const countA = warCounts.get(keyA) || 0;
          const countB = warCounts.get(keyB) || 0;
          // Prefer enemies we have fought before (blood feud)
          return countB - countA + (Math.random() - 0.5) * 1.5;
        });

        let ap = stateAreas[attacker] * states[attacker].expansionism;
        let dp = 0;
        for (const d of shuffledDefenders) {
          if (!isPathBlocked(attacker, d)) {
            dp = stateAreas[d] * states[d].expansionism;
            // The power check works correctly now that Enemies are not filtered out
            if (ap >= dp * gauss(1.6, 0.8, 0, 10, 2)) {
              if (maxWarDisparityRatio > 0) {
                const attackerForce = estimateForces(attacker, "leader", "direct_border").total;
                const defenderForce = estimateForces(d, "leader", "direct_border").total;
                const forceRatio = Math.max(
                  attackerForce / Math.max(1, defenderForce),
                  defenderForce / Math.max(1, attackerForce)
                );
                if (forceRatio > maxWarDisparityRatio) continue;
              }
              defender = d;
              break;
            }
          }
        }
        if (!defender) continue; // all paths blocked or defenders too strong / disparity too large

        const an = states[attacker].name;
        const dn = states[defender].name; // names
        const attackers = [attacker];
        const defenders = [defender]; // attackers and defenders array
        const dd = states[defender].diplomacy as string[]; // defender relations;

        const pairKey = [attacker, defender].sort((a, b) => a - b).join("-");
        const count = (warCounts.get(pairKey) || 0) + 1;

        // start an ongoing war with border burg endpoints
        const leaderEndpoints = resolveLeaderWarEndpoints(pack, attacker, defender);
        const primaryFromBurg = leaderEndpoints.fromBurg;
        const primaryTargetBurg = leaderEndpoints.toBurg;
        const targetBurg = primaryTargetBurg;

        const attackerRelId = cells.religion?.[states[attacker].center];
        const defenderRelId = cells.religion?.[states[defender].center];
        const attackerReligionName = attackerRelId != null ? pack.religions?.[attackerRelId]?.name : undefined;
        const defenderReligionName = defenderRelId != null ? pack.religions?.[defenderRelId]?.name : undefined;
        const attackerCultureName = pack.cultures?.[states[attacker].culture]?.name;
        const defenderCultureName = pack.cultures?.[states[defender].culture]?.name;

        const casusBelli = generateWarCasusBelli({
          attacker: states[attacker],
          defender: states[defender],
          attackerReligionName,
          defenderReligionName,
          attackerCultureName,
          defenderCultureName,
          warCount: count,
          targetBurg
        });

        const name = casusBelli.warName;
        console.log(`WAR START: ${name} (count: ${count}, attempt: ${attempt})`);
        // Base yearsAgo on the attempt to ensure chronological order (War I is older than War II).
        // Segment the 100-year history by the number of attempts.
        const segment = 100 / diplomacyHistoryAttempts;
        const minYears = Math.max(1, 100 - (attempt + 1) * segment);
        const maxYears = 100 - attempt * segment;

        // Randomize within the segment. Math.pow(Math.random(), 1.5) skews the result towards minYears (more recent).
        // This makes it feel like wars typically happened 1-2 generations ago, spreading nicely up to recent times.
        const yearsAgo = Math.max(
          1,
          Math.min(100, Math.floor(minYears + Math.random() ** 1.5 * (maxYears - minYears)))
        );

        const warId = `war-${attacker}-${defender}-${count}-${options.year! - yearsAgo}`;
        const createEvent = (
          from: number,
          to: number,
          action: string,
          rawText: string,
          customEndpoints?: { fromBurg?: number; toBurg?: number },
          tacticalRole?: "concentrated" | "divide" | "leader",
          transitType?: "naval_expedition" | "military_transit" | "direct_border"
        ) => {
          const endpoints = customEndpoints ?? getEventEndpoints(from, to);
          const routeCells = findWarRouteCells(pack, endpoints.fromBurg, endpoints.toBurg, transitType) ?? undefined;
          return {
            id: `war-${attacker}-${defender}-${eventIdCounter++}`,
            yearsAgo: yearsAgo,
            from,
            to,
            fromBurg: endpoints.fromBurg,
            toBurg: endpoints.toBurg,
            action,
            rawText,
            warId,
            tacticalRole,
            transitType,
            routeCells
          };
        };

        // biome-ignore lint/suspicious/noExplicitAny: mixed array
        const war: any[] = [name];
        war.push(
          createEvent(
            attacker,
            defender,
            casusBelli.action,
            casusBelli.rawText,
            { fromBurg: primaryFromBurg?.i, toBurg: primaryTargetBurg?.i },
            "leader",
            "direct_border"
          )
        );

        const start = options.year! - yearsAgo;
        const campaign: Campaign = { name, start, attacker, defender };

        const participants: WarParticipant[] = [
          {
            stateId: attacker,
            side: "attacker",
            role: "leader",
            motivation: casusBelli.category,
            motivationLabel: casusBelli.category.toUpperCase(),
            transitType: "direct_border",
            transitDetail: "Main offensive front",
            forces: estimateForces(attacker, "leader", "direct_border")
          },
          {
            stateId: defender,
            side: "defender",
            role: "leader",
            motivation: "defense",
            motivationLabel: "Territorial Defense",
            transitType: "direct_border",
            transitDetail: "Homeland defensive operations",
            forces: estimateForces(defender, "leader", "direct_border")
          }
        ];
        const nonBelligerents: WarNonBelligerent[] = [];

        // attacker vassals join the war
        ad.forEach((r, d) => {
          if (r === "Suzerain" && states[d].neighbors!.includes(defender) && !isPathBlocked(d, defender)) {
            attackers.push(d);
            participants.push({
              stateId: d,
              side: "attacker",
              role: "vassal",
              motivation: "vassal_duty",
              motivationLabel: "Feudal military levy",
              transitType: "direct_border",
              transitDetail: "Suzerain service deployment",
              forces: estimateForces(d, "vassal", "direct_border")
            });
            const vassalTarget = resolveAlliedAttackerTarget(pack, d, defender, primaryTargetBurg);
            const fromStr = vassalTarget.fromBurg ? `from ${vassalTarget.fromBurg.name} ` : "";
            const toStr = vassalTarget.toBurg ? vassalTarget.toBurg.name : "";
            const roleDetail =
              vassalTarget.tacticalRole === "divide"
                ? `opening a second front at ${toStr || "the frontier"} to divide defenses`
                : `concentrating forces on ${toStr || "the frontline"}`;
            const vassalText = `${an}'s vassal ${states[d].name} marched ${fromStr}to join the war, ${roleDetail}`
              .trim()
              .replace(/\s+/g, " ");

            war.push(
              createEvent(
                d,
                defender,
                "joined the war on attackers side",
                vassalText,
                { fromBurg: vassalTarget.fromBurg?.i, toBurg: vassalTarget.toBurg?.i },
                vassalTarget.tacticalRole,
                "direct_border"
              )
            );
          }
        });

        // defender vassals join the war
        dd.forEach((r, d) => {
          if (r === "Suzerain" && states[d].neighbors!.includes(attacker) && !isPathBlocked(d, attacker)) {
            defenders.push(d);
            participants.push({
              stateId: d,
              side: "defender",
              role: "vassal",
              motivation: "vassal_duty",
              motivationLabel: "Feudal military levy",
              transitType: "direct_border",
              transitDetail: "Suzerain service deployment",
              forces: estimateForces(d, "vassal", "direct_border")
            });
            const endpoints = resolveLeaderWarEndpoints(pack, d, attacker);
            const fromStr = endpoints.fromBurg ? `from ${endpoints.fromBurg.name} ` : "";
            const toStr = endpoints.toBurg ? `against ${endpoints.toBurg.name}` : "";
            const vassalText = `${dn}'s vassal ${states[d].name} mobilized ${fromStr}to defend ${dn}'s borders ${toStr}`
              .trim()
              .replace(/\s+/g, " ");

            war.push(
              createEvent(
                d,
                attacker,
                "joined the war on defenders side",
                vassalText,
                { fromBurg: endpoints.fromBurg?.i, toBurg: endpoints.toBurg?.i },
                undefined,
                "direct_border"
              )
            );
          }
        });

        ap = sum(attackers.map(a => stateAreas[a] * states[a].expansionism)); // attackers joined power
        dp = sum(defenders.map(d => stateAreas[d] * states[d].expansionism)); // defender joined power

        // defender allies join
        dd.forEach((r, d) => {
          if (r !== "Ally" || states[d].diplomacy!.includes("Vassal")) return;

          const isDirect = states[d].neighbors!.includes(attacker) && !isPathBlocked(d, attacker);
          const hasNaval = !isDirect && areStatesSeaConnected(pack, d, defender);
          const hasTransit =
            !isDirect &&
            !hasNaval &&
            states[defender].neighbors!.includes(attacker) &&
            states[d].neighbors!.includes(defender) &&
            !isPathBlocked(d, defender) &&
            !isPathBlocked(defender, attacker);

          if (!isDirect && !hasNaval && !hasTransit) return;

          if (states[d].diplomacy![attacker] !== "Rival") {
            if (ap / dp > gauss(1.5, 0.5, 0, 10, 2)) {
              const isAtWar = states[d].diplomacy!.includes("Enemy");
              const reason = isAtWar ? "Being already at war," : `Frightened by ${an},`;
              const reasonText = isAtWar
                ? `Already engaged in other wars, severed defense pact with ${dn}`
                : `Frightened by ${an}'s superior forces, severed defense pact with ${dn}`;
              nonBelligerents.push({
                stateId: d,
                targetStateId: defender,
                action: "severed_defense_pact",
                reason: reasonText
              });
              war.push(
                createEvent(
                  d,
                  defender,
                  "severed the defense pact",
                  `${reason} ${states[d].name} severed the defense pact with ${dn}`
                )
              );
              dd[d] = states[d].diplomacy![defender] = "Suspicion";
              return;
            }
            if (P(0.4)) {
              nonBelligerents.push({
                stateId: d,
                targetStateId: defender,
                action: "avoided_war",
                reason: `Avoided entering the war to assist ${dn}`
              });
              war.push(
                createEvent(
                  d,
                  attacker,
                  "avoided entering the war",
                  `${dn}'s ally ${states[d].name} avoided entering the war`
                )
              );
              return;
            }
          }

          defenders.push(d);
          dp += stateAreas[d] * states[d].expansionism;

          let transitType: "naval_expedition" | "military_transit" | "direct_border" = "direct_border";
          let transitDetail = "Direct defensive border mobilization";
          let vesselsUsed: number | undefined;
          let allyEndpoints: { fromBurg?: number; toBurg?: number } = {};
          let allyText = `${dn}'s ally ${states[d].name} joined the war on defenders side`;
          let targetStateForEvent = attacker;

          if (hasNaval) {
            transitType = "naval_expedition";
            vesselsUsed = Math.min(50, Math.max(8, Math.round(getStatePorts(d).length * 7 + Math.random() * 10)));
            const dPorts = getStatePorts(d);
            const defenderPorts = getStatePorts(defender);
            const fromPort = dPorts.length > 0 ? dPorts[0] : undefined;
            const toPort = defenderPorts.length > 0 ? defenderPorts[0] : undefined;
            allyEndpoints = { fromBurg: fromPort?.i, toBurg: toPort?.i };
            transitDetail = `Naval expedition fleet (${vesselsUsed} vessels, coastal defense & counter-blockade)`;
            const fromStr = fromPort ? ` from ${fromPort.name}` : "";
            const toStr = toPort ? ` to relieve ${toPort.name}` : "";
            allyText = `${dn}'s ally ${states[d].name} dispatched a relief fleet (${vesselsUsed} ships)${fromStr} across sea lanes${toStr} to defend against ${an}`;
            targetStateForEvent = defender; // Route to ally's port for defensive relief
          } else if (hasTransit) {
            transitType = "military_transit";
            const borderBurgs = findBorderBurgs(pack, d, defender);
            const targetBorderBurgs = findBorderBurgs(pack, attacker, defender);
            allyEndpoints = { fromBurg: borderBurgs[0]?.i, toBurg: targetBorderBurgs[0]?.i };
            transitDetail = `Forward deployment through ${dn}'s transit corridor`;
            allyText = `${dn}'s ally ${states[d].name} deployed reinforcements through ${dn}'s territory`;
          } else {
            const borderEndpoints = resolveLeaderWarEndpoints(pack, d, attacker);
            allyEndpoints = { fromBurg: borderEndpoints.fromBurg?.i, toBurg: borderEndpoints.toBurg?.i };
          }

          const allyForces = estimateForces(d, "ally", transitType, vesselsUsed);
          participants.push({
            stateId: d,
            side: "defender",
            role: "ally",
            motivation: "defense_pact",
            motivationLabel: "Mutual Defense Pact",
            transitType,
            transitDetail,
            vesselsUsed,
            forces: allyForces
          });

          war.push(
            createEvent(
              d,
              targetStateForEvent,
              "joined the war on defenders side",
              allyText,
              allyEndpoints,
              undefined,
              transitType
            )
          );

          // ally vassals join
          states[d]
            .diplomacy!.map((r, v) =>
              r === "Suzerain" && states[v].neighbors!.includes(attacker) && !isPathBlocked(v, attacker) ? v : 0
            )
            .filter(v => v)
            .forEach(v => {
              defenders.push(v);
              dp += stateAreas[v] * states[v].expansionism;
              participants.push({
                stateId: v,
                side: "defender",
                role: "vassal",
                motivation: "vassal_duty",
                motivationLabel: "Feudal military levy",
                transitType: "direct_border",
                transitDetail: "Suzerain service deployment",
                forces: estimateForces(v, "vassal", "direct_border")
              });
              const vassalEndpoints = resolveLeaderWarEndpoints(pack, v, attacker);
              war.push(
                createEvent(
                  v,
                  attacker,
                  "joined the war on defenders side",
                  `${states[d].name}'s vassal ${states[v].name} joined the war on defenders side`,
                  { fromBurg: vassalEndpoints.fromBurg?.i, toBurg: vassalEndpoints.toBurg?.i },
                  undefined,
                  "direct_border"
                )
              );
            });
        });

        // attacker allies join if the defender is their rival or joined power > defenders power and defender is not an ally
        ad.forEach((r, d) => {
          if (r !== "Ally" || states[d].diplomacy!.includes("Vassal") || defenders.includes(d)) return;

          const isDirect = states[d].neighbors!.includes(defender) && !isPathBlocked(d, defender);
          const hasNaval = !isDirect && areStatesSeaConnected(pack, d, defender);

          // If marching requires crossing another country by land, ally MUST use sea route
          if (!isDirect && !hasNaval) return;

          const nameStateD = states[d].name;
          if (states[d].diplomacy![defender] !== "Rival" && (P(0.7) || ap <= dp * 1.5)) {
            nonBelligerents.push({
              stateId: d,
              targetStateId: attacker,
              action: "avoided_war",
              reason: `Avoided entering the war alongside ${an}`
            });
            war.push(
              createEvent(
                d,
                attacker,
                "avoided entering the war",
                `${an}'s ally ${nameStateD} avoided entering the war`
              )
            );
            return;
          }
          const allies = states[d].diplomacy!.map((r, d) => (r === "Ally" ? d : 0)).filter(d => d);
          if (allies.some(ally => defenders.includes(ally))) {
            nonBelligerents.push({
              stateId: d,
              targetStateId: attacker,
              action: "avoided_war",
              reason: `Refused to join as its allies are at war on both sides`
            });
            war.push(
              createEvent(
                d,
                attacker,
                "did not join the war (allies on both sides)",
                `${an}'s ally ${nameStateD} did not join the war as its allies are in war on both sides`
              )
            );
            return;
          }

          attackers.push(d);
          ap += stateAreas[d] * states[d].expansionism;

          let transitType: "naval_expedition" | "military_transit" | "direct_border" = "direct_border";
          let transitDetail = "Direct advance across shared border";
          let motivation = "balance_of_power";
          let motivationLabel = "Balance of Power";
          let pledge: WarPledge = { type: "none", description: `Preserving regional balance of power against ${dn}` };
          let vesselsUsed: number | undefined;
          let allyEndpoints: { fromBurg?: number; toBurg?: number } = {};
          let tacticalRole: "concentrated" | "divide" | undefined;
          let allyText = `${an}'s ally ${nameStateD} joined the war on attackers side`;

          if (hasNaval) {
            transitType = "naval_expedition";
            vesselsUsed = Math.min(60, Math.max(10, Math.round(getStatePorts(d).length * 8 + Math.random() * 12)));
            transitDetail = `Naval expedition fleet (${vesselsUsed} vessels, naval blockade & landing force)`;
            const targetPort = findFrontlineTargetBurg(pack, defender, d);
            const fromPort = findStagingBurg(pack, d, targetPort, true);
            tacticalRole =
              primaryTargetBurg && targetPort && primaryTargetBurg.i === targetPort.i ? "concentrated" : "divide";

            if (targetPort && Math.random() < 0.6) {
              motivation = "territorial_pledge";
              motivationLabel = "Promised port cession";
              pledge = {
                type: "burg_cession",
                burgId: targetPort.i,
                burgName: targetPort.name,
                description: `Promised cession of the strategic port city of ${targetPort.name}`
              };
              allyText = `${an}'s ally ${nameStateD} launched a naval expedition (${vesselsUsed} ships) from ${fromPort?.name || "its ports"}, promised the port of ${targetPort.name}`;
            } else {
              motivation = "trade_concession";
              motivationLabel = "Maritime trade privileges";
              pledge = {
                type: "trade_privilege",
                description: `Exclusive commercial rights and toll exemptions in ${dn}'s waters`
              };
              allyText = `${an}'s ally ${nameStateD} dispatched an expedition fleet (${vesselsUsed} ships) from ${fromPort?.name || "its ports"} across sea lanes for regional trade privileges`;
            }
            allyEndpoints = { fromBurg: fromPort?.i, toBurg: targetPort?.i };
          } else {
            const alliedTarget = resolveAlliedAttackerTarget(pack, d, defender, primaryTargetBurg);
            tacticalRole = alliedTarget.tacticalRole;
            allyEndpoints = { fromBurg: alliedTarget.fromBurg?.i, toBurg: alliedTarget.toBurg?.i };
            const fromStr = alliedTarget.fromBurg ? `from ${alliedTarget.fromBurg.name}` : "";
            const toStr = alliedTarget.toBurg ? alliedTarget.toBurg.name : "the frontier";

            // Direct border offensive
            if (states[d].diplomacy![defender] === "Rival" || states[d].diplomacy![defender] === "Enemy") {
              motivation = "blood_feud";
              motivationLabel = "Historical rivalry";
              pledge = { type: "none", description: `Avenging past territorial conflicts with ${dn}` };
              const roleDesc =
                tacticalRole === "divide"
                  ? `attacking ${toStr} to divide ${dn}'s army`
                  : `concentrating with ${an} on ${toStr}`;
              allyText = `${an}'s ally ${nameStateD} advanced ${fromStr} to settle ancient scores with ${dn}, ${roleDesc}`;
            } else if (Math.random() < 0.5) {
              const targetBurg = alliedTarget.toBurg;
              motivation = "territorial_pledge";
              motivationLabel = "Territorial partition";
              pledge = {
                type: "burg_cession",
                burgId: targetBurg?.i,
                burgName: targetBurg?.name,
                description: `Promised territorial annexation of ${targetBurg?.name || toStr}`
              };
              const roleDesc =
                tacticalRole === "divide"
                  ? `opening a second front to partition ${toStr}`
                  : `concentrating the assault to capture ${toStr}`;
              allyText = `${an}'s ally ${nameStateD} joined the offensive ${fromStr}, ${roleDesc}`;
            } else {
              const roleDesc =
                tacticalRole === "divide"
                  ? `advanced ${fromStr} against ${toStr} to divide ${dn}'s defensive forces`
                  : `advanced ${fromStr} to join the siege of ${toStr}, concentrating allied forces`;
              allyText = `${an}'s ally ${nameStateD} ${roleDesc}`;
            }
          }

          const allyForces = estimateForces(d, "ally", transitType, vesselsUsed);
          participants.push({
            stateId: d,
            side: "attacker",
            role: "ally",
            motivation,
            motivationLabel,
            pledge,
            transitType,
            transitDetail,
            vesselsUsed,
            forces: allyForces
          });

          war.push(
            createEvent(
              d,
              defender,
              "joined the war on attackers side",
              allyText,
              allyEndpoints,
              tacticalRole,
              transitType
            )
          );

          // ally vassals join
          states[d]
            .diplomacy!.map((r, v) =>
              r === "Suzerain" && states[v].neighbors!.includes(defender) && !isPathBlocked(v, defender) ? v : 0
            )
            .filter(v => v)
            .forEach(v => {
              attackers.push(v);
              ap += stateAreas[v] * states[v].expansionism;
              participants.push({
                stateId: v,
                side: "attacker",
                role: "vassal",
                motivation: "vassal_duty",
                motivationLabel: "Feudal military levy",
                transitType: "direct_border",
                transitDetail: "Suzerain service deployment",
                forces: estimateForces(v, "vassal", "direct_border")
              });
              const vassalTarget = resolveAlliedAttackerTarget(pack, v, defender, primaryTargetBurg);
              const fromStr = vassalTarget.fromBurg ? `from ${vassalTarget.fromBurg.name} ` : "";
              const toStr = vassalTarget.toBurg ? vassalTarget.toBurg.name : "";
              const roleDesc =
                vassalTarget.tacticalRole === "divide"
                  ? `opening a second front at ${toStr || "the frontier"} to divide defenders`
                  : `concentrating forces on ${toStr || "the frontline"}`;
              const vassalText =
                `${states[d].name}'s vassal ${states[v].name} marched ${fromStr}to join the assault, ${roleDesc}`
                  .trim()
                  .replace(/\s+/g, " ");

              war.push(
                createEvent(
                  v,
                  defender,
                  "joined the war on attackers side",
                  vassalText,
                  { fromBurg: vassalTarget.fromBurg?.i, toBurg: vassalTarget.toBurg?.i },
                  vassalTarget.tacticalRole,
                  "direct_border"
                )
              );
            });
        });

        const warDetails: WarDetails = {
          id: warId,
          name,
          casusBelliCategory: casusBelli.category,
          casusBelliAction: casusBelli.action,
          casusBelliReason: casusBelli.reason,
          startYear: start,
          attackerLeader: attacker,
          defenderLeader: defender,
          targetBurgId: targetBurg?.i,
          participants,
          nonBelligerents: nonBelligerents.length > 0 ? nonBelligerents : undefined
        };
        const totalAttackerForces = participants
          .filter(p => p.side === "attacker")
          .reduce((sum, p) => sum + p.forces.total, 0);
        const totalDefenderForces = participants
          .filter(p => p.side === "defender")
          .reduce((sum, p) => sum + p.forces.total, 0);

        if (
          maxWarDisparityRatio > 0 &&
          Math.max(
            totalAttackerForces / Math.max(1, totalDefenderForces),
            totalDefenderForces / Math.max(1, totalAttackerForces)
          ) > maxWarDisparityRatio
        ) {
          continue;
        }

        warCounts.set(pairKey, count);
        campaign.details = warDetails;

        const allParticipantStates = Array.from(new Set([...attackers, ...defenders]));
        allParticipantStates.forEach(sId => {
          if (states[sId]?.campaigns) {
            if (!states[sId].campaigns!.some(c => c.name === name && c.start === start)) {
              states[sId].campaigns!.push(campaign);
            }
          }
        });

        // change relations to Enemy for all participants
        attackers.forEach(a => {
          defenders.forEach((d: number) => {
            states[a].diplomacy![d] = states[d].diplomacy![a] = "Enemy";
          });
        });
        // TODO: record war in chronicle to keep state interface clean
        // biome-ignore lint/suspicious/noExplicitAny: mixed chronicle array
        (chronicle as any[]).push(war); // mixed chronicle entry: see TODO above
      }
    }

    // Sort chronicle chronologically so the newest events appear at the top
    // biome-ignore lint/suspicious/noExplicitAny: mixed chronicle array
    (chronicle as any[]).sort((a, b) => {
      // biome-ignore lint/suspicious/noExplicitAny: mixed chronicle array
      const eventA = a.find((e: any) => typeof e === "object");
      // biome-ignore lint/suspicious/noExplicitAny: mixed chronicle array
      const eventB = b.find((e: any) => typeof e === "object");
      if (eventA && eventB) return eventA.yearsAgo - eventB.yearsAgo; // newer events (smaller yearsAgo) come first
      return 0;
    });

    console.log("=== WAR COUNTS SUMMARY ===");
    for (const [key, count] of warCounts.entries()) {
      if (count > 1) {
        console.log(`Blood feud ${key}: ${count} wars`);
      }
    }
    console.log("==========================");

    TIME && console.timeEnd("generateDiplomacy");
  }

  // select a forms for listed or all valid states
  defineStateForms(state: WorldState, list: number[] | null = null) {
    const { pack } = state;
    TIME && console.time("defineStateForms");
    const states = pack.states.filter(s => s.i && !s.removed && !s.lock);
    if (states.length < 1) return;

    const generic = { Monarchy: 25, Republic: 2, Union: 1 };
    const naval = { Monarchy: 25, Republic: 8, Union: 3 };

    const medianState = median(pack.states.map(s => s.area))!;
    const empireMin = states.map(s => s.area).sort((a = 0, b = 0) => b - a)[
      Math.max(Math.ceil(states.length ** 0.4) - 2, 0)
    ]!;
    const expTiers = pack.states.map(s => {
      let tier = Math.min(Math.floor((s.area! / medianState) * 2.6), 4);
      if (tier === 4 && s.area! < empireMin) tier = 3;
      return tier;
    });

    const monarchy = ["Duchy", "Grand Duchy", "Principality", "Kingdom", "Empire"]; // per expansionism tier
    const republic = {
      Republic: 75,
      Federation: 4,
      "Trade Company": 4,
      "Most Serene Republic": 2,
      Oligarchy: 2,
      Tetrarchy: 1,
      Triumvirate: 1,
      Diarchy: 1,
      Junta: 1
    }; // weighted random
    const union = {
      Union: 3,
      League: 4,
      Confederation: 1,
      "United Kingdom": 1,
      "United Republic": 1,
      "United Provinces": 2,
      Commonwealth: 1,
      Heptarchy: 1
    }; // weighted random
    const theocracy = {
      Theocracy: 20,
      Brotherhood: 1,
      Thearchy: 2,
      See: 1,
      "Holy State": 1
    };
    const anarchy = {
      "Free Territory": 2,
      Council: 3,
      Commune: 1,
      Community: 1
    };

    for (const s of states) {
      if (list && !list.includes(s.i)) continue;
      const tier = expTiers[s.i];

      const religion = pack.cells.religion[s.center];
      const isTheocracy =
        (religion && pack.religions[religion].expansion === "state") ||
        (P(0.1) && ["Organized", "Cult"].includes(pack.religions[religion].type));
      const isAnarchy = P(0.01 - tier / 500);

      if (isTheocracy) s.form = "Theocracy";
      else if (isAnarchy) s.form = "Anarchy";
      else s.form = s.type === "Naval" ? rw(naval) : rw(generic);

      const selectForm = (s: State, tier: number) => {
        const base = pack.cultures[s.culture].base;

        if (s.form === "Monarchy") {
          const form = monarchy[tier];
          // Default name depends on exponent tier, some culture bases have special names for tiers
          if (s.diplomacy) {
            if (
              form === "Duchy" &&
              s.neighbors &&
              s.neighbors.length > 1 &&
              rand(6) < s.neighbors.length &&
              s.diplomacy.includes("Vassal")
            )
              return "Marches"; // some vassal duchies on borderland
            if (base === 1 && P(0.3) && s.diplomacy.includes("Vassal")) return "Dominion"; // English vassals
            if (P(0.3) && s.diplomacy.includes("Vassal")) return "Protectorate"; // some vassals
          }

          if (base === 31 && (form === "Empire" || form === "Kingdom")) return "Khanate"; // Mongolian
          if (base === 16 && form === "Principality") return "Beylik"; // Turkic
          if (base === 5 && (form === "Empire" || form === "Kingdom")) return "Tsardom"; // Ruthenian
          if (base === 16 && (form === "Empire" || form === "Kingdom")) return "Khaganate"; // Turkic
          if (base === 12 && (form === "Kingdom" || form === "Grand Duchy")) return "Shogunate"; // Japanese
          if ([18, 17].includes(base) && form === "Empire") return "Caliphate"; // Arabic, Berber
          if (base === 18 && (form === "Grand Duchy" || form === "Duchy")) return "Emirate"; // Arabic
          if (base === 7 && (form === "Grand Duchy" || form === "Duchy")) return "Despotate"; // Greek
          if (base === 31 && (form === "Grand Duchy" || form === "Duchy")) return "Ulus"; // Mongolian
          if (base === 16 && (form === "Grand Duchy" || form === "Duchy")) return "Horde"; // Turkic
          if (base === 24 && (form === "Grand Duchy" || form === "Duchy")) return "Satrapy"; // Iranian
          return form;
        }

        if (s.form === "Republic") {
          // Default name is from weighted array, special case for small states with only 1 burg
          if (tier < 2 && s.burgs === 1) {
            if (trimVowels(s.name) === trimVowels(pack.burgs[s.capital].name!)) {
              s.name = pack.burgs[s.capital].name!;
              return "Free City";
            }
            if (P(0.3)) return "City-state";
          }
          return rw(republic);
        }

        if (s.form === "Union") return rw(union);
        if (s.form === "Anarchy") return rw(anarchy);

        if (s.form === "Theocracy") {
          // European
          if ([0, 1, 2, 3, 4, 6, 8, 9, 13, 15, 20].includes(base)) {
            if (P(0.1)) return `Divine ${monarchy[tier]}`;
            if (tier < 2 && P(0.5)) return "Diocese";
            if (tier < 2 && P(0.5)) return "Bishopric";
          }
          if (P(0.9) && [7, 5].includes(base)) {
            // Greek, Ruthenian
            if (tier < 2) return "Eparchy";
            if (tier === 2) return "Exarchate";
            if (tier > 2) return "Patriarchate";
          }
          if (P(0.9) && [21, 16].includes(base)) return "Imamah"; // Nigerian, Turkish
          if (tier > 2 && P(0.8) && [18, 17, 28].includes(base)) return "Caliphate"; // Arabic, Berber, Swahili
          return rw(theocracy);
        }
      };

      s.formName = selectForm(s, tier);
      s.fullName = this.getFullName(s);
    }

    TIME && console.timeEnd("defineStateForms");
  }

  getFullName(state: State) {
    // state forms requiring Adjective + Name, all other forms use scheme Form + Of + Name
    const adjForms = [
      "Empire",
      "Sultanate",
      "Khaganate",
      "Shogunate",
      "Caliphate",
      "Despotate",
      "Theocracy",
      "Oligarchy",
      "Union",
      "Confederation",
      "Trade Company",
      "League",
      "Tetrarchy",
      "Triumvirate",
      "Diarchy",
      "Horde",
      "Marches"
    ];
    if (!state.formName) return state.name;
    if (!state.name && state.formName) return `The ${state.formName}`;
    const adjName = adjForms.includes(state.formName) && !/-| /.test(state.name);
    return adjName ? `${getAdjective(state.name)} ${state.formName}` : `${state.formName} of ${state.name}`;
  }

  getSalesTax(burg: { state?: number }): number {
    const stateId = burg.state || 0;
    if (!stateId) return 0;
    return this.worldContext.pack.states?.[stateId]?.salesTax ?? 0;
  }
}

export const States = new StatesModule();
