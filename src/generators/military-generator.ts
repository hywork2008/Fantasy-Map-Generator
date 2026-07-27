import { sum } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { isForestBiome, isNomadicBiome, isWetlandBiome } from "../data/biomeCatalog";
import { useOptionsState } from "../store/optionsState";
import type { MilitaryRegiment, MilitaryUnit, Platoon, State } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { gauss, minmax, nth, ra, rand, rn, si } from "../utils";
import { TIME } from "../utils/debug";
import { isGunpowderEraEnabled, isGunpowderEraMilitaryUnit } from "../utils/gunpowderEra";
import { isRegimentLockedForBattle } from "./battleLock";
import {
  analyzeFrontiers,
  analyzeSeaFrontiers,
  analyzeUnclaimedFrontiers,
  getProvinceThreats,
  mergeFrontiers
} from "./frontierAnalysis";
import { isManpowerSimEnabled, markStatesNeedManpowerReconcile, reconcileAllStatesManpower } from "./manpower";
import { getNavalTechBonus } from "./navalTechBonus";
import { buildSeaRouteGraph } from "./seaRouteGraph";

/** At most this many consolidated field armies per state (plus one capital guard, plus one fleet). */
const MAX_FIELD_ARMIES = 21;

/** How much the capital guard grows per unit of threat weight on the capital's own province (0 = no threat, no bonus). */
const CAPITAL_GUARD_THREAT_MULTIPLIER = 0.15;

/** Share of local land troops embarked as shipborne marines when a fleet needs them. */
const MARINE_TRANSFER_RATE = 0.25;

/**
 * Ranged troops embark at a fraction of the normal marine transfer rate — a rocking deck
 * ruins archery more than it ruins melee (see the "fleet" unit's own NAVAL_MELEE_PENALTY,
 * getDefaultOptions() below), so states preferentially send melee troops to sea and keep
 * proportionally more archers on land duty instead.
 */
const NAVAL_RANGED_EMBARK_PENALTY = 0.4;

/** Regiment size tiers, expressed as multiples of populationRate so they scale with map settings. */
const SIZE_TIERS: { max: number; name: string }[] = [
  { max: 1, name: "Company" },
  { max: 5, name: "Battalion" },
  { max: 20, name: "Brigade" },
  { max: Infinity, name: "Division" }
];

function getSizeTier(troops: number, populationRate: number): string {
  const scale = troops / (populationRate || 1);
  return (SIZE_TIERS.find(tier => scale < tier.max) ?? SIZE_TIERS[SIZE_TIERS.length - 1]).name;
}

function poolToUnits(platoons: Platoon[]): Record<string, number> {
  const u: Record<string, number> = {};
  for (const p of platoons) u[p.u] = (u[p.u] ?? 0) + p.a;
  return u;
}

function sumUnits(u: Record<string, number>): number {
  return Object.values(u).reduce((sum, v) => sum + v, 0);
}

function addUnits(target: Record<string, number>, source: Record<string, number>, fraction = 1): void {
  for (const [name, amount] of Object.entries(source)) {
    if (!amount) continue;
    target[name] = (target[name] ?? 0) + amount * fraction;
  }
}

interface FieldArmyBucket {
  neighborState: number;
  weight: number;
  units: Record<string, number>;
  anchorProvince: number;
  anchorWeight: number;
  anchorX?: number;
  anchorY?: number;
}

class MilitaryModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { populationRate, urbanization, notes } = this.worldContext;
    const { pack, options } = state;
    const biomesData = state.biomesData ?? this.worldContext.biomesData;
    TIME && console.time("generateMilitary");
    const { cells, states } = pack;
    const { p } = cells;
    // Return previous under-arms to civilians before wiping regiments (avoids double-deduct).
    if (isManpowerSimEnabled()) {
      markStatesNeedManpowerReconcile(pack, populationRate);
    }
    const valid = states.filter(s => s.i && !s.removed); // valid states
    if (!options.military) options.military = this.getDefaultOptions();
    const military = options.military.filter(
      unit => unit.enabled !== false && (isGunpowderEraEnabled(options) || !isGunpowderEraMilitaryUnit(unit))
    );

    // Hostile borders (from Relations History), used to decide which provinces are on the
    // frontier and garrison regiments toward active threats instead of leaving them wherever
    // they were recruited. Peaceful states get no segments back. Land (adjacency-based) and
    // sea (charted sea-route-based, docs/plan/naval-sea-lanes.md) frontiers are merged so
    // getProvinceThreats() below also flags port provinces under naval threat as frontier
    // provinces — the existing land-regiment redistribution logic then pulls field armies
    // toward them without any further changes, same as any other frontier province.
    const seaRouteGraph = buildSeaRouteGraph(pack);
    const frontiers = mergeFrontiers(
      analyzeFrontiers(pack, options.year ?? 0),
      analyzeSeaFrontiers(pack, seaRouteGraph, options.year ?? 0),
      ...(isFrontierExpansionPattern(options.initialSettlementPattern) ? [analyzeUnclaimedFrontiers(pack)] : [])
    );

    const expn = sum(valid.map(s => s.expansionism)); // total expansion
    const area = sum(valid.map(s => s.area)); // total area
    const rate = {
      x: 0,
      Ally: -0.2,
      Friendly: -0.1,
      Neutral: 0,
      Suspicion: 0.1,
      Enemy: 1,
      Unknown: 0,
      Rival: 0.5,
      Vassal: 0.5,
      Suzerain: -0.5
    };

    const stateModifier = {
      melee: {
        Nomadic: 0.5,
        Highland: 1.2,
        Lake: 1,
        Naval: 0.7,
        Hunting: 1.2,
        River: 1.1
      },
      ranged: {
        Nomadic: 0.9,
        Highland: 1.3,
        Lake: 1,
        Naval: 0.8,
        Hunting: 2,
        River: 0.8
      },
      mounted: {
        Nomadic: 2.3,
        Highland: 0.6,
        Lake: 0.7,
        Naval: 0.3,
        Hunting: 0.7,
        River: 0.8
      },
      machinery: {
        Nomadic: 0.8,
        Highland: 1.4,
        Lake: 1.1,
        Naval: 1.4,
        Hunting: 0.4,
        River: 1.1
      },
      naval: {
        Nomadic: 0.5,
        Highland: 0.5,
        Lake: 1.2,
        Naval: 1.8,
        Hunting: 0.7,
        River: 1.2
      },
      armored: {
        Nomadic: 1,
        Highland: 0.5,
        Lake: 1,
        Naval: 1,
        Hunting: 0.7,
        River: 1.1
      },
      aviation: {
        Nomadic: 0.5,
        Highland: 0.5,
        Lake: 1.2,
        Naval: 1.2,
        Hunting: 0.6,
        River: 1.2
      },
      magical: {
        Nomadic: 1,
        Highland: 2,
        Lake: 1,
        Naval: 1,
        Hunting: 1,
        River: 1
      }
    };

    const cellTypeModifier = {
      nomadic: {
        melee: 0.2,
        ranged: 0.5,
        mounted: 3,
        machinery: 0.4,
        naval: 0.3,
        armored: 1.6,
        aviation: 1,
        magical: 0.5
      },
      wetland: {
        melee: 0.8,
        ranged: 2,
        mounted: 0.3,
        machinery: 1.2,
        naval: 1.0,
        armored: 0.2,
        aviation: 0.5,
        magical: 0.5
      },
      highland: {
        melee: 1.2,
        ranged: 1.6,
        mounted: 0.3,
        machinery: 3,
        naval: 1.0,
        armored: 0.8,
        aviation: 0.3,
        magical: 2
      }
    };

    const burgTypeModifier = {
      nomadic: {
        melee: 0.3,
        ranged: 0.8,
        mounted: 3,
        machinery: 0.4,
        naval: 1.0,
        armored: 1.6,
        aviation: 1,
        magical: 0.5
      },
      wetland: {
        melee: 1,
        ranged: 1.6,
        mounted: 0.2,
        machinery: 1.2,
        naval: 1.0,
        armored: 0.2,
        aviation: 0.5,
        magical: 0.5
      },
      highland: {
        melee: 1.2,
        ranged: 2,
        mounted: 0.3,
        machinery: 3,
        naval: 1.0,
        armored: 0.8,
        aviation: 0.3,
        magical: 2
      }
    };

    const stateCellsCount = new Int32Array(pack.states.length);
    const statePlainsCount = new Int32Array(pack.states.length);
    const stateForestCount = new Int32Array(pack.states.length);
    const stateHighlandCount = new Int32Array(pack.states.length);

    for (let i = 0; i < cells.i.length; i++) {
      const stateId = cells.state[i];
      if (stateId) {
        stateCellsCount[stateId]++;
        const b = cells.biomeCode[i];
        if (biomesData.keys[b] === "savanna" || biomesData.keys[b] === "grassland") {
          statePlainsCount[stateId]++;
        } else if (isForestBiome(biomesData, b)) {
          stateForestCount[stateId]++;
        }
        if (cells.h[i] >= 70) {
          stateHighlandCount[stateId]++;
        }
      }
    }

    valid.forEach(s => {
      s.temp = {} as Exclude<State["temp"], undefined>;
      const d = s.diplomacy!;

      const expansionRate = minmax(s.expansionism / expn / (s.area! / area), 0.25, 4); // how much state expansionism is realized
      const diplomacyRate = d.some(d => d === "Enemy")
        ? 1
        : d.some(d => d === "Rival")
          ? 0.8
          : d.some(d => d === "Suspicion")
            ? 0.5
            : 0.1; // peacefulness
      const neighborsRateRaw = s
        .neighbors!.map(n => (n ? pack.states[n].diplomacy![s.i] : "Suspicion"))
        .reduce((s, r) => s + rate[r as keyof typeof rate], 0.5);
      const neighborsRate = minmax(neighborsRateRaw, 0.3, 3); // neighbors rate
      s.alert = minmax(rn(expansionRate * diplomacyRate * neighborsRate, 2), 0.1, 5); // alert rate (area modifier)
      s.temp.platoons = [];

      // apply overall state modifiers for unit types based on state features
      for (const unit of military) {
        if (!stateModifier[unit.type as keyof typeof stateModifier]) continue;

        let modifier =
          stateModifier[unit.type as keyof typeof stateModifier][
            s.type as keyof (typeof stateModifier)[keyof typeof stateModifier]
          ] || 1;
        if (unit.type === "mounted") {
          if (s.formName!.includes("Horde")) modifier *= 2;
          const plainsRatio = stateCellsCount[s.i] ? statePlainsCount[s.i] / stateCellsCount[s.i] : 0;
          // Sharp exponential curve: high plains -> massive boost, low plains -> practically zero
          const plainsModifier = minmax(0.05 + plainsRatio ** 2 * 15, 0.05, 5);
          modifier *= plainsModifier;
        } else if (unit.type === "melee" || unit.type === "ranged") {
          if (s.type === "Nomadic" || s.formName!.includes("Horde")) modifier *= 0.3;
          const forestRatio = stateCellsCount[s.i] ? stateForestCount[s.i] / stateCellsCount[s.i] : 0;
          const highlandRatio = stateCellsCount[s.i] ? stateHighlandCount[s.i] / stateCellsCount[s.i] : 0;
          const roughModifier = minmax(1 + (forestRatio + highlandRatio) * 2.5, 1, 3);
          modifier *= roughModifier;
        } else if (unit.type === "naval" && s.form === "Republic") {
          modifier *= 1.2;
        }
        s.temp[unit.name] = modifier * s.alert;
        // Shipbuilding extension (if enabled) boosts naval unit strength for states
        // whose shipyards have completed state-owned hulls — defaults to 1 (no-op).
        if (unit.type === "naval") s.temp[unit.name] *= getNavalTechBonus(s.i);
      }
    });

    const getType = (cell: number) => {
      const biome = cells.biomeCode[cell];
      if (isNomadicBiome(biomesData, biome)) return "nomadic";
      // Dense wet forests + wetlands historically shared the wetland military terrain type
      if (
        isWetlandBiome(biomesData, biome) ||
        biomesData.keys[biome] === "tropicalRainforest" ||
        biomesData.keys[biome] === "temperateRainforest" ||
        biomesData.keys[biome] === "taiga"
      )
        return "wetland";
      if (cells.h[cell] >= 70) return "highland";
      return "generic";
    };

    function passUnitLimits(unit: MilitaryUnit, biome: number, state: number, culture: number, religion: number) {
      if (unit.biomes && !unit.biomes.includes(biome)) return false;
      if (unit.states && !unit.states.includes(state)) return false;
      if (unit.cultures && !unit.cultures.includes(culture)) return false;
      if (unit.religions && !unit.religions.includes(religion)) return false;
      return true;
    }

    // rural cells
    for (const i of cells.i) {
      if (!cells.pop[i]) continue;

      const biome = cells.biomeCode[i];
      const state = cells.state[i];
      const culture = cells.culture[i];
      const religion = cells.religion[i];

      const stateObj = states[state];
      if (!state || stateObj.removed) continue;

      let modifier = cells.pop[i] / 100; // basic rural army in percentages
      if (culture !== stateObj.culture) modifier = stateObj.form === "Union" ? modifier / 1.2 : modifier / 2; // non-dominant culture
      if (religion !== cells.religion[stateObj.center])
        modifier = stateObj.form === "Theocracy" ? modifier / 2.2 : modifier / 1.4; // non-dominant religion
      if (cells.f[i] !== cells.f[stateObj.center])
        modifier = stateObj.type === "Naval" ? modifier / 1.2 : modifier / 1.8; // different landmass
      const type = getType(i);

      for (const unit of military) {
        const perc = +unit.rural;
        if (Number.isNaN(perc) || perc <= 0 || !stateObj.temp![unit.name]) continue;
        if (!passUnitLimits(unit, biome, state, culture, religion)) continue;
        if (unit.type === "naval" && !cells.haven[i]) continue; // only near-ocean cells create naval units

        const cellTypeMod =
          type === "generic"
            ? 1
            : cellTypeModifier[type as keyof typeof cellTypeModifier][
                unit.type as keyof (typeof cellTypeModifier)[keyof typeof cellTypeModifier]
              ]; // cell specific modifier
        const army = modifier * perc * cellTypeMod; // rural cell army
        const total = rn(army * stateObj.temp![unit.name] * populationRate); // total troops
        if (!total) continue;

        let [x, y] = p[i];
        let n = 0;
        let waterBody: number | undefined;

        // place naval units to sea
        if (unit.type === "naval") {
          const haven = cells.haven[i];
          [x, y] = p[haven];
          n = 1;
          waterBody = cells.f[haven];
        }

        stateObj.temp!.platoons!.push({
          cell: i,
          a: total,
          t: total,
          x,
          y,
          u: unit.name,
          n,
          s: unit.separate,
          type: unit.type,
          province: cells.province[i],
          waterBody
        });
      }
    }

    // burgs
    for (const b of pack.burgs) {
      if (!b.i || b.removed || !b.state || !b.population) continue;

      const biome = cells.biomeCode[b.cell];
      const state = b.state;
      const culture = b.culture;
      const religion = cells.religion[b.cell];

      const stateObj = states[state];
      let m = (b.population * urbanization) / 100; // basic urban army in percentages
      if (b.capital) m *= 1.2; // capital has household troops
      if (culture !== stateObj.culture) m = stateObj.form === "Union" ? m / 1.2 : m / 2; // non-dominant culture
      if (religion !== cells.religion[stateObj.center]) m = stateObj.form === "Theocracy" ? m / 2.2 : m / 1.4; // non-dominant religion
      if (cells.f[b.cell] !== cells.f[stateObj.center]) m = stateObj.type === "Naval" ? m / 1.2 : m / 1.8; // different landmass
      const type = getType(b.cell);

      for (const unit of military) {
        const perc = +unit.urban;
        if (Number.isNaN(perc) || perc <= 0 || !stateObj.temp![unit.name]) continue;
        if (!passUnitLimits(unit, biome, state, culture!, religion)) continue;
        if (unit.type === "naval" && (!b.port || !cells.haven[b.cell])) continue; // only ports create naval units

        const mod =
          type === "generic"
            ? 1
            : burgTypeModifier[type as keyof typeof burgTypeModifier][
                unit.type as keyof (typeof burgTypeModifier)[keyof typeof burgTypeModifier]
              ]; // cell specific modifier
        const army = m * perc * mod; // urban cell army
        const total = rn(army * stateObj.temp![unit.name] * populationRate); // total troops
        if (!total) continue;

        let [x, y] = p[b.cell];
        let n = 0;
        let waterBody: number | undefined;

        // place naval to sea
        if (unit.type === "naval") {
          const haven = cells.haven[b.cell];
          [x, y] = p[haven];
          n = 1;
          waterBody = cells.f[haven];
        }

        stateObj.temp!.platoons!.push({
          cell: b.cell,
          a: total,
          t: total,
          x,
          y,
          u: unit.name,
          n,
          s: unit.separate,
          type: unit.type,
          // the capital's own household troops form the dedicated capital guard, not a
          // province levy — tag with province 0 is irrelevant for them since they are
          // filtered out by `b.capital` before province-pooling ever sees them
          province: cells.province[b.cell],
          waterBody
        });
      }
    }

    // Resolves a province (or the fallback "no province" bucket) to a stationing point:
    // its representative burg if it has one, else its center cell, else the largest of the
    // given platoons (used for the "no provinces at all" fallback and the peaceful/no-frontier
    // single field army).
    const getAnchor = (provinceId: number, fallbackPlatoons: Platoon[]): { cell: number; x: number; y: number } => {
      const province = provinceId ? pack.provinces[provinceId] : undefined;
      if (province) {
        if (province.burg && pack.burgs[province.burg]) {
          const burg = pack.burgs[province.burg];
          return { cell: burg.cell, x: burg.x, y: burg.y };
        }
        const cell = province.center;
        return { cell, x: cells.p[cell][0], y: cells.p[cell][1] };
      }
      if (fallbackPlatoons.length) {
        const largest = fallbackPlatoons.reduce((a, b) => (a.a > b.a ? a : b));
        return { cell: largest.cell, x: largest.x, y: largest.y };
      }
      return { cell: 0, x: 0, y: 0 };
    };

    const dominantUnitType = (units: Record<string, number>): string => {
      const mainUnit = Object.entries(units).sort((a, b) => b[1] - a[1])[0]?.[0];
      return military.find(u => u.name === mainUnit)?.type ?? "melee";
    };

    const buildRegiment = (
      units: Record<string, number>,
      anchor: { cell: number; x: number; y: number },
      s: State,
      opts: { n?: number; isCapitalGuard?: boolean }
    ): MilitaryRegiment => {
      const total = rn(sumUnits(units));
      return {
        i: 0,
        t: total,
        a: total,
        s: 0,
        cell: anchor.cell,
        x: anchor.x,
        y: anchor.y,
        bx: anchor.x,
        by: anchor.y,
        u: units,
        n: opts.n ?? 0,
        type: opts.n ? "naval" : dominantUnitType(units),
        name: "",
        state: s.i,
        isCapitalGuard: opts.isCapitalGuard,
        // Manpower fill prefers this province (cells.province; 0 = statewide)
        homeProvince: pack.cells.province?.[anchor.cell] ?? 0,
        // Standing forces start trained; green recruits dilute this on fill
        quality: 1
      };
    };

    // remove all existing regiment notes before regenerating
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].id.startsWith("regiment")) notes.splice(i, 1);
    }

    // Consolidate every state's platoons into at most: 1 naval fleet + 1 capital guard +
    // up to MAX_FIELD_ARMIES field armies (province levies pooled and merged toward the
    // frontier, so no direction is left thin and interior provinces don't each get their
    // own garrison).
    valid.forEach(s => {
      const platoons = s.temp!.platoons!;
      delete s.temp; // do not store temp data

      const navalPlatoons = platoons.filter(pl => pl.n);
      const capitalPlatoons = platoons.filter(pl => !pl.n && pl.cell === s.center);
      const landPlatoons = platoons.filter(pl => !pl.n && pl.cell !== s.center);

      const regiments: MilitaryRegiment[] = [];

      // 1. Fleet
      if (navalPlatoons.length) {
        const needsMarines = s.alert! >= 2 || s.expansionism > 1.5;
        const platoonsByWaterBody = new Map<number, Platoon[]>();

        navalPlatoons.forEach(pl => {
          const wb = pl.waterBody ?? 0;
          if (!platoonsByWaterBody.has(wb)) platoonsByWaterBody.set(wb, []);
          platoonsByWaterBody.get(wb)!.push(pl);
        });

        const MAX_TROOPS_PER_FLEET = 2500 * (populationRate || 1);

        platoonsByWaterBody.forEach((wbPlatoons, _wb) => {
          const units = poolToUnits(wbPlatoons);
          const totalNavalTroops = sumUnits(units);
          const numFleets = Math.max(1, Math.ceil(totalNavalTroops / (MAX_TROOPS_PER_FLEET || 2500)) || 1);

          for (let i = 0; i < numFleets; i++) {
            const fleetUnits: Record<string, number> = {};
            for (const [unitName, amount] of Object.entries(units)) {
              fleetUnits[unitName] = rn(amount / numFleets);
            }

            const anchorPlatoon = wbPlatoons[i % wbPlatoons.length];
            const anchor = { cell: anchorPlatoon.cell, x: anchorPlatoon.x, y: anchorPlatoon.y };

            // Embark land troops as marines for blockade/transport
            if (needsMarines) {
              const localLand = landPlatoons.filter(lp => lp.province === anchorPlatoon.province && lp.a > 0);
              localLand.forEach(lp => {
                const isRanged = military.find(u => u.name === lp.u)?.type === "ranged";
                const transferRate = isRanged
                  ? MARINE_TRANSFER_RATE * NAVAL_RANGED_EMBARK_PENALTY
                  : MARINE_TRANSFER_RATE;
                const amountToTransfer = Math.floor(lp.a * transferRate);
                if (amountToTransfer > 0) {
                  fleetUnits[lp.u] = (fleetUnits[lp.u] ?? 0) + amountToTransfer;
                  lp.a -= amountToTransfer;
                  lp.t -= amountToTransfer;
                }
              });
            }

            regiments.push(buildRegiment(fleetUnits, anchor, s, { n: 1 }));
          }
        });
      }

      const segments = frontiers.get(s.i) ?? [];
      const landSegments = segments.filter(seg => seg.origin !== "sea");
      const seaSegments = segments.filter(seg => seg.origin === "sea");
      const landProvinceThreats = getProvinceThreats(pack, landSegments);
      const seaProvinceThreats = getProvinceThreats(pack, seaSegments);

      const splitAndAddLandRegiments = (
        units: Record<string, number>,
        anchor: { cell: number; x: number; y: number },
        opts: { isCapitalGuard?: boolean; allowSplit?: boolean }
      ) => {
        if (opts.isCapitalGuard || opts.allowSplit === false) {
          if (sumUnits(units) > 0) {
            regiments.push(buildRegiment(units, anchor, s, opts));
          }
          return;
        }

        const cavalryUnits: Record<string, number> = {};
        const footUnits: Record<string, number> = {};

        for (const [unitName, amount] of Object.entries(units)) {
          const unitDef = military.find(u => u.name === unitName);
          if (unitDef?.type === "mounted") {
            const amountToKeepInFoot = Math.min(amount, Math.floor(2 + Math.random() * 2));
            const pureCavalryAmount = amount - amountToKeepInFoot;

            if (pureCavalryAmount < 5) {
              if (amount > 0) footUnits[unitName] = amount;
            } else {
              if (amountToKeepInFoot > 0) footUnits[unitName] = amountToKeepInFoot;
              if (pureCavalryAmount > 0) cavalryUnits[unitName] = pureCavalryAmount;
            }
          } else {
            footUnits[unitName] = amount;
          }
        }

        if (Object.keys(footUnits).length > 0 && sumUnits(footUnits) > 0) {
          regiments.push(buildRegiment(footUnits, anchor, s, opts));
        }
        if (Object.keys(cavalryUnits).length > 0 && sumUnits(cavalryUnits) > 0) {
          const cavAnchor = { cell: anchor.cell, x: anchor.x + 6, y: anchor.y - 6 };
          regiments.push(buildRegiment(cavalryUnits, cavAnchor, s, opts));
        }
      };

      // 2. Capital Guard — sized normally unless the capital's own province is itself
      // threatened, in which case it grows proportionally to that threat.
      const guardUnits: Record<string, number> = capitalPlatoons.length ? poolToUnits(capitalPlatoons) : {};
      const capitalProvince = cells.province[s.center];
      const capLand = capitalProvince ? (landProvinceThreats.get(capitalProvince)?.totalWeight ?? 0) : 0;
      const capSea = capitalProvince ? (seaProvinceThreats.get(capitalProvince)?.totalWeight ?? 0) : 0;
      const capitalThreat = capLand + capSea * 0.001;
      // Cap the maximum bonus to 1.5x to prevent absurd numbers
      const bonus = Math.min(1.5, 1 + capitalThreat * CAPITAL_GUARD_THREAT_MULTIPLIER);
      Object.keys(guardUnits).forEach(name => {
        guardUnits[name] = rn(guardUnits[name] * bonus);
      });

      // Guarantee Capital Guard is at least 5% of total land forces
      const totalFieldTroops = sumUnits(poolToUnits(landPlatoons));
      const currentGuardTroops = sumUnits(guardUnits);
      const minGuardSize = Math.floor((totalFieldTroops + currentGuardTroops) * 0.05);

      if (currentGuardTroops < minGuardSize && totalFieldTroops > 0) {
        let deficit = minGuardSize - currentGuardTroops;
        const takeRatio = Math.min(1, deficit / totalFieldTroops);

        for (const pl of landPlatoons) {
          if (deficit <= 0) break;
          if (pl.a <= 0) continue;

          const amountToTake = Math.min(Math.ceil(pl.a * takeRatio), deficit, pl.a);
          if (amountToTake > 0) {
            guardUnits[pl.u] = (guardUnits[pl.u] ?? 0) + amountToTake;
            pl.a -= amountToTake;
            pl.t -= amountToTake;
            deficit -= amountToTake;
          }
        }
      }

      if (sumUnits(guardUnits) > 0) {
        const anchor = { cell: s.center, x: p[s.center][0], y: p[s.center][1] };
        splitAndAddLandRegiments(guardUnits, anchor, { isCapitalGuard: true });
      }

      // 3. Province levies → frontier field armies
      const platoonsByProvince = new Map<number, Platoon[]>();
      landPlatoons.forEach(pl => {
        if (!platoonsByProvince.has(pl.province)) platoonsByProvince.set(pl.province, []);
        platoonsByProvince.get(pl.province)!.push(pl);
      });

      const armyBuckets = new Map<number, FieldArmyBucket>();

      platoonsByProvince.forEach((provincePlatoons, provinceId) => {
        const units = poolToUnits(provincePlatoons);
        const landThreat = provinceId ? landProvinceThreats.get(provinceId) : undefined;
        const seaThreat = provinceId ? seaProvinceThreats.get(provinceId) : undefined;
        const troops = sumUnits(units);

        // Prioritize threatened provinces over all others by giving them massive weight,
        // so that unthreatened interior armies ALWAYS merge into the frontier.
        // Land threats (1e9) completely dominate sea threats (1e6).
        const landWeight = (landThreat?.totalWeight ?? 0) * 1e9;
        const seaWeight = (seaThreat?.totalWeight ?? 0) * 1e6;
        const weight = troops + landWeight + seaWeight;
        const neighborState = landThreat ? landThreat.primaryNeighbor : seaThreat ? seaThreat.primaryNeighbor : 0;
        const anchor = getAnchor(provinceId, landPlatoons);

        armyBuckets.set(provinceId, {
          neighborState,
          weight,
          units,
          anchorProvince: provinceId,
          anchorWeight: weight,
          anchorX: anchor.x,
          anchorY: anchor.y
        });
      });

      // Spatial merge: merge buckets that are very close to each other
      const buckets = Array.from(armyBuckets.values()).sort((a, b) => b.weight - a.weight);
      const MERGE_DISTANCE = 15;

      for (let i = 0; i < buckets.length; i++) {
        const bucketA = buckets[i];
        if (!bucketA) continue;

        for (let j = i + 1; j < buckets.length; j++) {
          const bucketB = buckets[j];
          if (!bucketB) continue;

          const dist = Math.hypot(bucketA.anchorX! - bucketB.anchorX!, bucketA.anchorY! - bucketB.anchorY!);
          if (dist < MERGE_DISTANCE) {
            addUnits(bucketA.units, bucketB.units);
            bucketA.weight += bucketB.weight;
            buckets.splice(j, 1);
            j--;
          }
        }
      }

      const countRegiments = (bucketUnits: Record<string, number>) => {
        let hasFoot = false;
        let hasCavalry = false;
        for (const [unitName, amount] of Object.entries(bucketUnits)) {
          const unitDef = military.find(u => u.name === unitName);
          if (unitDef?.type === "mounted") {
            if (amount > 0) hasFoot = true;
            // We need pureCavalryAmount >= 5. With max keep of 3, amount must be >= 8 to reliably split.
            if (amount >= 8) hasCavalry = true;
          } else {
            if (amount > 0) hasFoot = true;
          }
        }
        return (hasFoot ? 1 : 0) + (hasCavalry ? 1 : 0);
      };

      let totalExpectedRegiments = buckets.reduce((sum, b) => sum + countRegiments(b.units), 0);

      while (buckets.length > 1 && totalExpectedRegiments > MAX_FIELD_ARMIES) {
        const weakest = buckets.pop()!;
        addUnits(buckets[0].units, weakest.units);
        buckets[0].weight += weakest.weight;
        totalExpectedRegiments = buckets.reduce((sum, b) => sum + countRegiments(b.units), 0);
      }

      const allowSplit = totalExpectedRegiments <= MAX_FIELD_ARMIES;

      buckets.forEach(bucket => {
        const anchor = getAnchor(bucket.anchorProvince, landPlatoons);
        splitAndAddLandRegiments(bucket.units, anchor, { allowSplit });
      });

      // Spatial merge specifically for pure cavalry regiments (radius 40).
      // This ensures mobile cavalry forces group up into cohesive larger armies
      // even if their originating foot armies remain separate.
      const isPureCavalry = (reg: MilitaryRegiment) => {
        if (!reg.u) return false;
        return Object.keys(reg.u).every(unitName => {
          const unitDef = military.find(u => u.name === unitName);
          return unitDef?.type === "mounted";
        });
      };

      for (let i = 0; i < regiments.length; i++) {
        const regA = regiments[i];
        if (!regA || !isPureCavalry(regA)) continue;

        for (let j = i + 1; j < regiments.length; j++) {
          const regB = regiments[j];
          if (!regB || !isPureCavalry(regB)) continue;

          const dist = Math.hypot(regA.x - regB.x, regA.y - regB.y);
          if (dist < 40) {
            // Merge B into A
            for (const [unitName, amount] of Object.entries(regB.u)) {
              regA.u[unitName] = (regA.u[unitName] || 0) + amount;
            }
            regA.a = sumUnits(regA.u);

            // Average coordinates to place them centrally between the two
            regA.x = (regA.x + regB.x) / 2;
            regA.y = (regA.y + regB.y) / 2;
            regA.bx = regA.x;
            regA.by = regA.y;

            regiments.splice(j, 1);
            j--;
          }
        }
      }

      s.military = regiments;

      // Physical positioning (marching toward a threatened frontier) is no longer done here —
      // see docs/plan/military-movement.md Phase 2 / src/generators/regimentMovement.ts. This
      // function only ever sets a regiment's *initial* spawn position (its recruitment anchor);
      // regimentMovement.ts owns repositioning from here on, across however many times
      // generate() itself gets rebuilt (e.g. on every bordersChanged tick).

      // Prevent regiments from overlapping perfectly by applying a small visual offset
      // to any regiments that end up at the exact same coordinate.
      const posMap = new Map<string, MilitaryRegiment[]>();
      s.military.forEach(r => {
        const key = `${r.x},${r.y}`;
        if (!posMap.has(key)) posMap.set(key, []);
        posMap.get(key)!.push(r);
      });
      posMap.forEach(regs => {
        if (regs.length > 1) {
          const radius = 6;
          const angleStep = (Math.PI * 2) / regs.length;
          regs.forEach((r, i) => {
            // For 2 regiments, places them at 0 and PI (+6,0 and -6,0)
            r.x += Math.cos(i * angleStep) * radius;
            r.y += Math.sin(i * angleStep) * radius;
            r.bx = r.x;
            r.by = r.y;
          });
        }
      });

      // finalize indices, names, icons, notes
      s.military.forEach((r, i) => {
        r.i = i;
      });
      s.military.forEach(r => {
        r.name = this.getName(r, s.military!);
        r.icon = this.getEmblem(r);
        this.generateNote(r, s);
      });
    });

    // Deduct the newly generated under-arms from civilian adult males (ledger).
    if (isManpowerSimEnabled()) {
      reconcileAllStatesManpower(pack, populationRate);
    }

    TIME && console.timeEnd("generateMilitary");
  }

  getDefaultOptions() {
    // Ships stay unarmed transports until Shipbuilding tech unlocks cannons (docs/plan/shipbuilding.md) —
    // a fleet unit's own combat power is just its crew fighting hand-to-hand, cut down for the cramped
    // footing a rolling deck gives against a proper melee line. Troops it ferries/embarks (marines) are
    // separate `MilitaryRegiment.u` entries with their own land-unit power, added on top of this.
    const fleetCrew = 100;
    const NAVAL_MELEE_PENALTY = 0.3;

    return [
      {
        icon: "⚔️",
        name: "infantry",
        rural: 0.25,
        urban: 0.2,
        crew: 1,
        power: 1,
        type: "melee",
        separate: 0
      },
      {
        icon: "🏹",
        name: "archers",
        rural: 0.12,
        urban: 0.2,
        crew: 1,
        power: 1,
        type: "ranged",
        separate: 0
      },
      {
        icon: "🐴",
        name: "cavalry",
        rural: 0.12,
        urban: 0.03,
        crew: 2,
        power: 2,
        type: "mounted",
        separate: 0
      },
      {
        icon: "💣",
        name: "artillery",
        rural: 0,
        urban: 0.03,
        crew: 8,
        power: 12,
        type: "machinery",
        separate: 0,
        enabled: false
      },
      {
        icon: "🌊",
        name: "fleet",
        rural: 0,
        urban: 0.015,
        crew: fleetCrew,
        power: rn(fleetCrew * NAVAL_MELEE_PENALTY),
        type: "naval",
        separate: 1
      }
    ];
  }

  getName(r: MilitaryRegiment, regiments: MilitaryRegiment[]) {
    const { pack, populationRate } = this.worldContext;
    const cells = pack.cells;

    if (r.isCapitalGuard) return `${pack.states[r.state].name} Royal Guard`;

    const proper = r.n
      ? null
      : cells.province[r.cell] && pack.provinces[cells.province[r.cell]]
        ? pack.provinces[cells.province[r.cell]].name
        : cells.burg[r.cell] && pack.burgs[cells.burg[r.cell]]
          ? pack.burgs[cells.burg[r.cell]].name
          : null;
    const number = nth(regiments.filter(reg => reg.n === r.n && !reg.isCapitalGuard && reg.i < r.i).length + 1);
    const form = r.n ? "Fleet" : getSizeTier(r.a, populationRate);
    return `${number}${proper ? ` (${proper}) ` : ` `}${form}`;
  }

  // utilize si function to make regiment total text fit regiment box
  getTotal(reg: MilitaryRegiment) {
    return reg.a > (reg.n ? 999 : 99999) ? si(reg.a) : rn(reg.a);
  }

  generateNote(r: MilitaryRegiment, s: State) {
    const { pack, options, notes } = this.worldContext;
    const cells = pack.cells;
    const base =
      cells.burg[r.cell] && pack.burgs[cells.burg[r.cell]]
        ? pack.burgs[cells.burg[r.cell]].name
        : cells.province[r.cell] && pack.provinces[cells.province[r.cell]]
          ? pack.provinces[cells.province[r.cell]].fullName
          : null;
    const station = base ? `${r.name} is ${r.n ? "based" : "stationed"} in ${base}. ` : "";

    const composition = r.a
      ? Object.keys(r.u)
          .map(t => `— ${t}: ${r.u[t as keyof typeof r.u]}`)
          .join("\r\n")
      : null;
    const currentYear = options.year!;
    const troops = composition
      ? `\r\n\r\nRegiment composition in ${currentYear} ${options.eraShort}:\r\n${composition}.`
      : "";

    const campaign = s.campaigns ? ra(s.campaigns) : null;
    const year = campaign
      ? rand(campaign.start, campaign.end || currentYear)
      : gauss(currentYear - 100, 150, 1, currentYear - 6);
    const conflict = campaign ? ` during the ${campaign.name}` : "";
    const legend = `Regiment was formed in ${year} ${options.era}${conflict}. ${station}${troops}`;
    const id = `regiment${s.i}-${r.i}`;
    const existing = notes.find(n => n.id === id);
    if (existing) {
      existing.name = r.name;
      existing.legend = legend;
    } else {
      notes.push({ id, name: r.name, legend });
    }
  }

  // get default regiment emblem
  getEmblem(r: MilitaryRegiment) {
    const { options } = this.worldContext;
    if (r.isCapitalGuard) return "👑";
    if (r.n) {
      const navalUnit = options.military?.find((u: { type: string; icon: string }) => u.type === "naval");
      return navalUnit ? navalUnit.icon : "🌊";
    }
    if (!Object.values(r.u).length) return "🔰"; // "Newbie" regiment without troops
    const mainUnit = Object.entries(r.u).sort((a, b) => b[1] - a[1])[0][0]; // unit with more troops in regiment
    const unit = options.military?.find((u: { name: string; icon: string }) => u.name === mainUnit);
    return unit ? unit.icon : "⚔️";
  }

  /**
   * Dynamically updates military regiments over time (e.g. from nobility time hooks)
   * without destroying and recreating them from scratch. This allows active marches
   * and skirmishes to persist without regiments teleporting back home.
   */
  updateDynamic(worldContext: WorldContext, deltaYears: number) {
    if (deltaYears <= 0) return;
    if (!useOptionsState.getState().simMilitaryRecovery) return;

    const { pack } = worldContext;
    const states = pack.states;
    const useLedger = isManpowerSimEnabled();

    // Recovery rate when not using the manpower ledger (legacy infinite refill)
    const RECOVERY_RATE_PER_YEAR = 0.2;

    for (const state of states) {
      if (!state.i || state.removed || !state.military) continue;

      const military = state.military;

      for (let i = military.length - 1; i >= 0; i--) {
        const r = military[i];

        // 1. Cleanup dead regiments (unless a pending UI attack still holds a reference to it —
        // see battleLock.ts)
        if (r.a <= 0) {
          if (isRegimentLockedForBattle(r)) continue;

          // Find and clean up any notes associated with it
          const id = `regiment${state.i}-${r.i}`;
          const noteIndex = worldContext.notes.findIndex(n => n.id === id);
          if (noteIndex !== -1) worldContext.notes.splice(noteIndex, 1);

          military.splice(i, 1);
          continue;
        }

        // 2. Reinforcement — when simManpower is on, tickManpower() already fills from civilians.
        if (useLedger) continue;

        if (r.a < r.t) {
          const recoveryAmount = r.t * RECOVERY_RATE_PER_YEAR * deltaYears;
          let totalRecovered = 0;
          for (const [unitName, currentAmount] of Object.entries(r.u)) {
            const ratio = r.a > 0 ? currentAmount / r.a : 1 / Math.max(1, Object.keys(r.u).length);
            const recovered = Math.round(recoveryAmount * ratio);
            if (recovered > 0) {
              r.u[unitName] = currentAmount + recovered;
              totalRecovered += recovered;
            }
          }

          r.a += totalRecovered;
          if (r.a > r.t) {
            const scale = r.t / r.a;
            for (const unitName in r.u) {
              r.u[unitName] = Math.floor(r.u[unitName] * scale);
            }
            r.a = r.t;
          }
        }
      }
    }
  }
}
export const Military = new MilitaryModule();

function isFrontierExpansionPattern(pattern: WorldState["options"]["initialSettlementPattern"]): boolean {
  return pattern === "frontier" || pattern === "scattered";
}
