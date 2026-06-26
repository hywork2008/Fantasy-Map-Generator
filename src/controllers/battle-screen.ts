import { mean, sum } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { Military } from "../generators/military-generator";
import { Names } from "../generators/names-generator";
import { appendMarkerToLayer, moveRegiment } from "../renderers/index";
import type { BattleRegimentDisplay, BattleSide } from "../store/battleScreenState";
import { getBattleScreenState } from "../store/battleScreenState";
import type { MilitaryRegiment } from "../types/models";
import { closeDialog, closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { findCell, getAdjective, last, list, minmax, P, Pint, rand, rn, wiki } from "../utils";
import { tip } from "../utils/uiHelpers";

interface BattleRegiment extends MilitaryRegiment {
  casualties: Record<string, number>;
  survivors: Record<string, number>;
  px?: number;
  py?: number;
}

interface BattleForces {
  regiments: BattleRegiment[];
  distances: number[];
  morale: number;
  casualties: number;
  power: number;
  phase?: string;
  die?: number;
}

class Battle {
  static context: Battle | undefined;

  iteration!: number;
  x!: number;
  y!: number;
  cell!: number;
  attackers!: BattleForces;
  defenders!: BattleForces;
  place!: string;
  type!: string;
  name!: string;

  constructor(attacker: BattleRegiment, defender: BattleRegiment) {
    if (viewContext.customization) return;
    closeDialogs(".stable");
    viewContext.customization = 13;

    Battle.context = this;
    this.iteration = 0;
    this.x = defender.x;
    this.y = defender.y;
    this.cell = findCell(this.x, this.y);
    this.attackers = { regiments: [], distances: [], morale: 100, casualties: 0, power: 0 };
    this.defenders = { regiments: [], distances: [], morale: 100, casualties: 0, power: 0 };

    const store = getBattleScreenState();
    store.setBattleState({
      militaryUnits: worldContext.options.military ?? [],
      attackers: { regiments: [], morale: 100, power: 0, phase: "", die: 1 },
      defenders: { regiments: [], morale: 100, power: 0, phase: "", die: 1 },
      nameSectionVisible: false
    });

    this.addRegiment("attackers", attacker);
    this.addRegiment("defenders", defender);
    this.place = this.definePlace();
    this.defineType();
    this.name = this.defineName();
    this.randomize();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
    this.getInitialMorale();

    store.setBattleState({ name: this.name, type: this.type, place: this.place });

    openDialog("battleScreen", {
      title: this.name,
      resizable: false,
      onClose: () => Battle.context!.cancelResults()
    });
  }

  defineType(): void {
    const attacker = this.attackers.regiments[0];
    const defender = this.defenders.regiments[0];
    const getType = () => {
      const typesA = Object.keys(attacker.u).map(
        (name: string) => worldContext.options.military!.find(u => u.name === name)!.type
      );
      const typesD = Object.keys(defender.u).map(
        (name: string) => worldContext.options.military!.find(u => u.name === name)!.type
      );

      if (attacker.n && defender.n) return "naval";
      if (typesA.every((t: string) => t === "aviation") && typesD.every((t: string) => t === "aviation")) return "air";
      if (attacker.n && !defender.n && typesA.some((t: string) => t !== "naval")) return "landing";
      if (!defender.n && worldContext.pack.burgs[worldContext.pack.cells.burg![this.cell]].walls) return "siege";
      if (P(0.1) && [5, 6, 7, 8, 9, 12].includes(worldContext.pack.cells.biome![this.cell])) return "ambush";
      return "field";
    };

    this.type = getType();
    getBattleScreenState().setBattleState({ type: this.type });
  }

  definePlace(): string {
    const cells = worldContext.pack.cells;
    const i = this.cell;
    const burg = cells.burg![i] ? worldContext.pack.burgs[cells.burg![i]].name : null;
    const getRiver = (idx: number) => {
      const river = worldContext.pack.rivers!.find(r => r.i === idx);
      return `${river!.name} ${river!.type}`;
    };
    const river = !burg && cells.r![i] ? getRiver(cells.r![i]) : null;
    const proper = burg || river ? null : Names.getCulture(cells.culture![this.cell]);
    return (burg ? burg : river ? river : proper) as string;
  }

  defineName(): string {
    if (this.type === "field") return `Battle of ${this.place}`;
    if (this.type === "naval") return `Naval Battle of ${this.place}`;
    if (this.type === "siege") return `Siege of ${this.place}`;
    if (this.type === "ambush") return `${this.place} Ambush`;
    if (this.type === "landing") return `${this.place} Landing`;
    if (this.type === "air") return `${this.place} ${P(0.8) ? "Air Battle" : "Dogfight"}`;
    return `Battle of ${this.place}`;
  }

  getTypeName(): string {
    if (this.type === "field") return "field battle";
    if (this.type === "naval") return "naval battle";
    if (this.type === "siege") return "siege";
    if (this.type === "ambush") return "ambush";
    if (this.type === "landing") return "landing";
    if (this.type === "air") return "battle";
    return "battle";
  }

  addRegiment(side: BattleSide, regiment: BattleRegiment): void {
    regiment.casualties = Object.keys(regiment.u).reduce((a: Record<string, number>, b: string) => {
      a[b] = 0;
      return a;
    }, {});
    regiment.survivors = Object.assign({}, regiment.u);

    const state = worldContext.pack.states[regiment.state];
    const distance = (Math.hypot(this.y - regiment.by, this.x - regiment.bx) * worldContext.distanceScale) | 0;
    const distanceUnit = (document.getElementById("distanceUnitInput") as HTMLSelectElement | null)?.value ?? "km";
    const color = (state.color ?? "#999")[0] === "#" ? (state.color ?? "#999") : "#999";

    const display: BattleRegimentDisplay = {
      key: `${state.i}-${regiment.i}`,
      stateIndex: state.i,
      regimentIndex: regiment.i,
      regimentName: regiment.name,
      stateFullName: state.fullName ?? state.name ?? "",
      stateColor: color,
      icon: regiment.icon ?? "",
      distanceLabel: `${distance} ${distanceUnit}`,
      initialUnits: { ...regiment.u },
      casualties: { ...regiment.casualties },
      survivors: { ...regiment.survivors },
      initialTotal: regiment.a || 0
    };

    getBattleScreenState().addRegimentToSide(side, display);
    this[side].regiments.push(regiment);
    this[side].distances.push(distance);
  }

  addSide(): void {
    openDialog("regimentSelectorScreen", {
      title: "Add regiment to the battle"
    });
  }

  showNameSection(): void {
    getBattleScreenState().setBattleState({ nameSectionVisible: true });
  }

  hideNameSection(): void {
    getBattleScreenState().setBattleState({ nameSectionVisible: false });
  }

  changeName(value: string): void {
    this.name = value;
    getBattleScreenState().setBattleState({ name: this.name });
    openDialog("battleScreen", { title: this.name });
  }

  changePlace(value: string): void {
    this.place = value;
    getBattleScreenState().setBattleState({ place: value });
  }

  generateName(type: string): void {
    const place =
      type === "culture"
        ? Names.getCulture(worldContext.pack.cells.culture![this.cell], undefined, undefined, "")
        : Names.getBase(rand(worldContext.nameBases.length - 1));
    this.place = place;
    this.name = this.defineName();
    getBattleScreenState().setBattleState({ place: this.place, name: this.name });
    openDialog("battleScreen", { title: this.name });
  }

  getJoinedForces(regiments: BattleRegiment[]): Record<string, number> {
    return regiments.reduce((a: Record<string, number>, b: BattleRegiment) => {
      for (const k in b.survivors) {
        if (!Object.hasOwn(b.survivors, k)) continue;
        a[k] = (a[k] || 0) + b.survivors[k];
      }
      return a;
    }, {});
  }

  calculateStrength(side: BattleSide): void {
    const scheme: Record<string, Record<string, number>> = {
      skirmish: {
        melee: 0.2,
        ranged: 2.4,
        mounted: 0.1,
        machinery: 3,
        naval: 1,
        armored: 0.2,
        aviation: 1.8,
        magical: 1.8
      },
      melee: {
        melee: 2,
        ranged: 1.2,
        mounted: 1.5,
        machinery: 0.5,
        naval: 0.2,
        armored: 2,
        aviation: 0.8,
        magical: 0.8
      },
      pursue: { melee: 1, ranged: 1, mounted: 4, machinery: 0.05, naval: 1, armored: 1, aviation: 1.5, magical: 0.6 },
      retreat: {
        melee: 0.1,
        ranged: 0.01,
        mounted: 0.5,
        machinery: 0.01,
        naval: 0.2,
        armored: 0.1,
        aviation: 0.8,
        magical: 0.05
      },
      shelling: { melee: 0, ranged: 0.2, mounted: 0, machinery: 2, naval: 2, armored: 0, aviation: 0.1, magical: 0.5 },
      boarding: {
        melee: 1,
        ranged: 0.5,
        mounted: 0.5,
        machinery: 0,
        naval: 0.5,
        armored: 0.4,
        aviation: 0,
        magical: 0.2
      },
      chase: { melee: 0, ranged: 0.15, mounted: 0, machinery: 1, naval: 1, armored: 0, aviation: 0.15, magical: 0.5 },
      withdrawal: {
        melee: 0,
        ranged: 0.02,
        mounted: 0,
        machinery: 0.5,
        naval: 0.1,
        armored: 0,
        aviation: 0.1,
        magical: 0.3
      },
      blockade: {
        melee: 0.25,
        ranged: 0.25,
        mounted: 0.2,
        machinery: 0.5,
        naval: 0.2,
        armored: 0.1,
        aviation: 0.25,
        magical: 0.25
      },
      sheltering: {
        melee: 0.3,
        ranged: 0.5,
        mounted: 0.2,
        machinery: 0.5,
        naval: 0.2,
        armored: 0.1,
        aviation: 0.25,
        magical: 0.25
      },
      sortie: {
        melee: 2,
        ranged: 0.5,
        mounted: 1.2,
        machinery: 0.2,
        naval: 0.1,
        armored: 0.5,
        aviation: 1,
        magical: 1
      },
      bombardment: {
        melee: 0.2,
        ranged: 0.5,
        mounted: 0.2,
        machinery: 3,
        naval: 1,
        armored: 0.5,
        aviation: 1,
        magical: 1
      },
      storming: {
        melee: 1,
        ranged: 0.6,
        mounted: 0.5,
        machinery: 1,
        naval: 0.1,
        armored: 0.1,
        aviation: 0.5,
        magical: 0.5
      },
      defense: { melee: 2, ranged: 3, mounted: 1, machinery: 1, naval: 0.1, armored: 1, aviation: 0.5, magical: 1 },
      looting: {
        melee: 1.6,
        ranged: 1.6,
        mounted: 0.5,
        machinery: 0.2,
        naval: 0.02,
        armored: 0.2,
        aviation: 0.1,
        magical: 0.3
      },
      surrendering: {
        melee: 0.1,
        ranged: 0.1,
        mounted: 0.05,
        machinery: 0.01,
        naval: 0.01,
        armored: 0.02,
        aviation: 0.01,
        magical: 0.03
      },
      surprise: { melee: 2, ranged: 2.4, mounted: 1, machinery: 1, naval: 1, armored: 1, aviation: 0.8, magical: 1.2 },
      shock: {
        melee: 0.5,
        ranged: 0.5,
        mounted: 0.5,
        machinery: 0.4,
        naval: 0.3,
        armored: 0.1,
        aviation: 0.4,
        magical: 0.5
      },
      landing: {
        melee: 0.8,
        ranged: 0.6,
        mounted: 0.6,
        machinery: 0.5,
        naval: 0.5,
        armored: 0.5,
        aviation: 0.5,
        magical: 0.6
      },
      flee: {
        melee: 0.1,
        ranged: 0.01,
        mounted: 0.5,
        machinery: 0.01,
        naval: 0.5,
        armored: 0.1,
        aviation: 0.2,
        magical: 0.05
      },
      waiting: {
        melee: 0.05,
        ranged: 0.5,
        mounted: 0.05,
        machinery: 0.5,
        naval: 2,
        armored: 0.05,
        aviation: 0.5,
        magical: 0.5
      },
      maneuvering: {
        melee: 0,
        ranged: 0.1,
        mounted: 0,
        machinery: 0.2,
        naval: 0,
        armored: 0,
        aviation: 1,
        magical: 0.2
      },
      dogfight: { melee: 0, ranged: 0.1, mounted: 0, machinery: 0.1, naval: 0, armored: 0, aviation: 2, magical: 0.1 }
    };

    const forces = this.getJoinedForces(this[side].regiments);
    const phase = this[side].phase!;
    const adjuster = Math.max(worldContext.populationRate / 10, 10);
    this[side].power =
      sum(worldContext.options.military!.map(u => (forces[u.name] || 0) * u.power * scheme[phase][u.type])) / adjuster;

    getBattleScreenState().setSidePower(side, this[side].power ? Math.max(this[side].power | 0, 1) : 0);
  }

  getInitialMorale(): void {
    const powerFee = (diff: number) => minmax(100 - diff ** 1.5 * 10 + 10, 50, 100);
    const distanceFee = (dist: number[]) => Math.min((mean(dist) || 0) / 50, 15);
    const powerDiff = this.defenders.power / this.attackers.power;
    this.attackers.morale = powerFee(powerDiff) - distanceFee(this.attackers.distances);
    this.defenders.morale = powerFee(1 / powerDiff) - distanceFee(this.defenders.distances);
    this.updateMorale("attackers");
    this.updateMorale("defenders");
  }

  updateMorale(side: BattleSide): void {
    getBattleScreenState().setSideMorale(side, this[side].morale | 0);
  }

  randomize(): void {
    this.rollDie("attackers");
    this.rollDie("defenders");
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
  }

  rollDie(side: BattleSide): void {
    const prev = this[side].die ?? 0;
    let next: number;
    do {
      next = rand(1, 6);
    } while (next === prev);
    this[side].die = next;
    getBattleScreenState().setSideDie(side, next);
  }

  selectPhase(): void {
    const i = this.iteration;
    const morale = [this.attackers.morale, this.defenders.morale];
    const powerRatio = this.attackers.power / this.defenders.power;

    const getFieldBattlePhase = (): [string, string] => {
      const prev = [this.attackers.phase || "skirmish", this.defenders.phase || "skirmish"];

      if (P(1 - morale[0] / 25)) return ["retreat", "pursue"];
      if (P(1 - morale[1] / 25)) return ["pursue", "retreat"];

      if (prev[0] === "skirmish" && prev[1] === "skirmish") {
        const forces = this.getJoinedForces(this.attackers.regiments.concat(this.defenders.regiments));
        const total = sum(Object.values(forces) as number[]);
        const ranged =
          sum(
            worldContext.options
              .military!.filter(u => u.type === "ranged")
              .map(u => u.name)
              .map((u: string) => forces[u])
          ) / total;
        if (P(ranged) || P(0.8 - i / 10)) return ["skirmish", "skirmish"];
      }

      return ["melee", "melee"];
    };

    const getNavalBattlePhase = (): [string, string] => {
      const prev = [this.attackers.phase || "shelling", this.defenders.phase || "shelling"];

      if (prev[0] === "withdrawal") return ["withdrawal", "chase"];
      if (prev[0] === "chase") return ["chase", "withdrawal"];

      if (prev[0] !== "boarding") {
        if (powerRatio < 0.5 || (P(this.attackers.casualties) && powerRatio < 1)) return ["withdrawal", "chase"];
        if (powerRatio > 2 || (P(this.defenders.casualties) && powerRatio > 1)) return ["chase", "withdrawal"];
      }

      if (prev[0] === "boarding" || P(i / 10 - 0.1)) return ["boarding", "boarding"];

      return ["shelling", "shelling"];
    };

    const getSiegePhase = (): [string, string] => {
      const prev = [this.attackers.phase || "blockade", this.defenders.phase || "sheltering"];
      const phase: [string, string] = ["blockade", "sheltering"];

      if (prev[0] === "retreat" || prev[0] === "looting") return prev as [string, string];

      if (P(1 - morale[0] / 30) && powerRatio < 1) return ["retreat", "pursue"];
      if (P(1 - morale[1] / 15)) return ["looting", "surrendering"];

      if (P((powerRatio - 1) / 2)) return ["storming", "defense"];

      if (prev[0] !== "storming") {
        const machinery = worldContext.options.military!.filter(u => u.type === "machinery").map(u => u.name);

        const attackersForces = this.getJoinedForces(this.attackers.regiments);
        const machineryA = sum(machinery.map((u: string) => attackersForces[u]));
        if (i && machineryA && P(0.9)) phase[0] = "bombardment";

        const defendersForces = this.getJoinedForces(this.defenders.regiments);
        const machineryD = sum(machinery.map((u: string) => defendersForces[u]));
        if (machineryD && P(0.9)) phase[1] = "bombardment";

        if (i && prev[1] !== "sortie" && machineryD < machineryA && P(0.25) && P(morale[1] / 70)) phase[1] = "sortie";
      }

      return phase;
    };

    const getAmbushPhase = (): [string, string] => {
      const prev = [this.attackers.phase || "shock", this.defenders.phase || "surprise"];

      if (prev[1] === "surprise" && P(1 - (powerRatio * i) / 5)) return ["shock", "surprise"];

      if (P(1 - morale[0] / 25)) return ["retreat", "pursue"];
      if (P(1 - morale[1] / 25)) return ["pursue", "retreat"];

      return ["melee", "melee"];
    };

    const getLandingPhase = (): [string, string] => {
      const prev = [this.attackers.phase || "landing", this.defenders.phase || "defense"];

      if (prev[1] === "waiting") return ["flee", "waiting"];
      if (prev[1] === "pursue") return ["flee", P(0.3) ? "pursue" : "waiting"];
      if (prev[1] === "retreat") return ["pursue", "retreat"];

      if (prev[0] === "landing") {
        const attackers = P(i / 2) ? "melee" : "landing";
        const defenders = i ? prev[1] : P(0.5) ? "defense" : "shock";
        return [attackers, defenders];
      }

      if (P(1 - morale[0] / 40)) return ["flee", "pursue"];
      if (P(1 - morale[1] / 25)) return ["pursue", "retreat"];

      return ["melee", "melee"];
    };

    const getAirBattlePhase = (): [string, string] => {
      const prev = [this.attackers.phase || "maneuvering", this.defenders.phase || "maneuvering"];

      if (P(1 - morale[0] / 25)) return ["retreat", "pursue"];
      if (P(1 - morale[1] / 25)) return ["pursue", "retreat"];

      if (prev[0] === "maneuvering" && P(1 - i / 10)) return ["maneuvering", "maneuvering"];

      return ["dogfight", "dogfight"];
    };

    const phase = ((): [string, string] => {
      switch (this.type) {
        case "field":
          return getFieldBattlePhase();
        case "naval":
          return getNavalBattlePhase();
        case "siege":
          return getSiegePhase();
        case "ambush":
          return getAmbushPhase();
        case "landing":
          return getLandingPhase();
        case "air":
          return getAirBattlePhase();
        default:
          return getFieldBattlePhase();
      }
    })();

    this.attackers.phase = phase[0];
    this.defenders.phase = phase[1];

    getBattleScreenState().setSidePhase("attackers", phase[0]);
    getBattleScreenState().setSidePhase("defenders", phase[1]);
  }

  run(): void {
    if (!this.attackers.power) {
      tip("Attackers army destroyed", false, "warn");
      return;
    }
    if (!this.defenders.power) {
      tip("Defenders army destroyed", false, "warn");
      return;
    }

    const attack = this.attackers.power * (this.attackers.die! / 10 + 0.4);
    const defense = this.defenders.power * (this.defenders.die! / 10 + 0.4);

    const phaseModifier: Record<string, number> = {
      skirmish: 0.1,
      melee: 0.2,
      pursue: 0.3,
      retreat: 0.3,
      boarding: 0.2,
      shelling: 0.1,
      chase: 0.03,
      withdrawal: 0.03,
      blockade: 0,
      sheltering: 0,
      sortie: 0.1,
      bombardment: 0.05,
      storming: 0.2,
      defense: 0.2,
      looting: 0.5,
      surrendering: 0.5,
      surprise: 0.3,
      shock: 0.3,
      landing: 0.3,
      flee: 0,
      waiting: 0,
      maneuvering: 0.1,
      dogfight: 0.2
    };

    const totalCasualties =
      Math.random() * Math.max(phaseModifier[this.attackers.phase!], phaseModifier[this.defenders.phase!]);
    const casualtiesA = (totalCasualties * defense) / (attack + defense);
    const casualtiesD = (totalCasualties * attack) / (attack + defense);

    this.calculateCasualties("attackers", casualtiesA);
    this.calculateCasualties("defenders", casualtiesD);
    this.attackers.casualties += casualtiesA;
    this.defenders.casualties += casualtiesD;

    this.attackers.morale = Math.max(this.attackers.morale - casualtiesA * 100 - 1, 0);
    this.defenders.morale = Math.max(this.defenders.morale - casualtiesD * 100 - 1, 0);

    this.syncCasualtiesDisplay("attackers");
    this.syncCasualtiesDisplay("defenders");

    this.iteration += 1;
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
    this.updateMorale("attackers");
    this.updateMorale("defenders");
  }

  calculateCasualties(side: BattleSide, casualties: number): void {
    for (const r of this[side].regiments) {
      for (const unit in r.u) {
        const randVal = 0.8 + Math.random() * 0.4;
        const died = Math.min(Pint(r.u[unit] * casualties * randVal), r.survivors[unit]);
        r.casualties[unit] -= died;
        r.survivors[unit] -= died;
      }
    }
  }

  syncCasualtiesDisplay(side: BattleSide): void {
    const store = getBattleScreenState();
    for (const r of this[side].regiments) {
      const key = `${r.state}-${r.i}`;
      store.updateRegimentCasualties(side, key, { ...r.casualties }, { ...r.survivors });
    }
  }

  changeType(type: string): void {
    this.type = type;
    getBattleScreenState().setBattleState({ type });
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
    this.name = this.defineName();
    getBattleScreenState().setBattleState({ name: this.name });
    openDialog("battleScreen", { title: this.name });
  }

  changePhase(side: BattleSide, phase: string): void {
    this[side].phase = phase;
    getBattleScreenState().setSidePhase(side, phase);
    this.calculateStrength(side);
  }

  applyResults(): void {
    const battleName = this.name;
    const maxCasualties = Math.max(this.attackers.casualties, this.defenders.casualties);
    const relativeCasualties = this.defenders.casualties / (this.attackers.casualties + this.defenders.casualties);
    const battleStatus = getBattleStatus(relativeCasualties, maxCasualties);

    function getBattleStatus(relative: number, max: number): [string, string] {
      if (Number.isNaN(relative)) return ["standoff", "standoff"];
      if (max < 0.05) return ["minor skirmishes", "minor skirmishes"];
      if (relative > 95) return ["attackers flawless victory", "disorderly retreat of defenders"];
      if (relative > 0.7) return ["attackers decisive victory", "defenders disastrous defeat"];
      if (relative > 0.6) return ["attackers victory", "defenders defeat"];
      if (relative > 0.4) return ["stalemate", "stalemate"];
      if (relative > 0.3) return ["attackers defeat", "defenders victory"];
      if (relative > 0.5) return ["attackers disastrous defeat", "decisive victory of defenders"];
      if (relative >= 0) return ["attackers disorderly retreat", "flawless victory of defenders"];
      return ["stalemate", "stalemate"];
    }

    this.attackers.regiments.forEach(r => {
      applyResultForSide(r, "attackers");
    });
    this.defenders.regiments.forEach(r => {
      applyResultForSide(r, "defenders");
    });

    function applyResultForSide(r: BattleRegiment, side: BattleSide): void {
      const id = `regiment${r.state}-${r.i}`;

      const note = worldContext.notes.find(n => n.id === id);
      if (note) {
        const status = side === "attackers" ? battleStatus[0] : battleStatus[1];
        const losses = r.a ? Math.abs(sum(Object.values(r.casualties) as number[])) / r.a : 1;
        const regStatus =
          losses === 1
            ? "is destroyed"
            : losses > 0.8
              ? "is almost completely destroyed"
              : losses > 0.5
                ? "suffered terrible losses"
                : losses > 0.3
                  ? "suffered severe losses"
                  : losses > 0.2
                    ? "suffered heavy losses"
                    : losses > 0.05
                      ? "suffered significant losses"
                      : losses > 0
                        ? "suffered unsignificant losses"
                        : "left the battle without loss";
        const casualties = Object.keys(r.casualties)
          .map((t: string) => (r.casualties[t] ? `${Math.abs(r.casualties[t])} ${t}` : null))
          .filter((c: string | null) => c);
        const casualtiesText = casualties.length ? ` Casualties: ${list(casualties as string[])}.` : "";
        const legend = `\r\n\r\n${battleName} (${worldContext.options.year} ${worldContext.options.eraShort}): ${status}. The regiment ${regStatus}.${casualtiesText}`;
        note.legend += legend;
      }

      r.u = Object.assign({}, r.survivors);
      r.a = sum(Object.values(r.u) as number[]);
      viewContext.armies.select(`g#${id} > text`).text(Military.getTotal(r));

      moveRegiment(worldContext, viewContext, appServices, r, r.px as number, r.py as number);
    }

    const markerI = last(worldContext.pack.markers)?.i + 1 || 0;
    {
      const marker = { i: markerI, x: this.x, y: this.y, cell: this.cell, icon: "⚔️", type: "battlefields", dy: 52 };
      worldContext.pack.markers.push(marker);
      appendMarkerToLayer(viewContext.markers.node()!, worldContext, viewContext, appServices, marker);
    }

    const getSide = (regs: BattleRegiment[], n: number) =>
      regs.length > 1
        ? `${n ? "regiments" : "forces"} of ${list([...new Set(regs.map(r => worldContext.pack.states[r.state].name))])}`
        : `${getAdjective(worldContext.pack.states[regs[0].state].name)} ${regs[0].name}`;
    const getLosses = (casualties: number) => Math.min(rn(casualties * 100), 100);

    const status = battleStatus[+P(0.7)];
    const result = `The ${this.getTypeName()} ended in ${status}`;
    const legend = `${this.name} took place in ${worldContext.options.year} ${worldContext.options.eraShort}. It was fought between ${getSide(
      this.attackers.regiments,
      1
    )} and ${getSide(this.defenders.regiments, 0)}. ${result}.
      \r\nAttackers losses: ${getLosses(this.attackers.casualties)}%, defenders losses: ${getLosses(this.defenders.casualties)}%`;
    worldContext.notes.push({ id: `marker${markerI}`, name: this.name, legend });

    tip(`${this.name} is over. ${result}`, true, "success", 4000);

    closeDialog("battleScreen");
    this.cleanData();
  }

  cancelResults(): void {
    this.attackers.regiments.forEach(r => {
      moveRegiment(worldContext, viewContext, appServices, r, r.px as number, r.py as number);
    });
    this.defenders.regiments.forEach(r => {
      moveRegiment(worldContext, viewContext, appServices, r, r.px as number, r.py as number);
    });

    closeDialog("battleScreen");
    this.cleanData();
  }

  cleanData(): void {
    viewContext.customization = 0;

    this.attackers.regiments.concat(this.defenders.regiments).forEach(r => {
      delete r.px;
      delete r.py;
      delete (r as Partial<BattleRegiment>).casualties;
      delete (r as Partial<BattleRegiment>).survivors;
    });
    Battle.context = undefined;
    getBattleScreenState().reset();
  }
}

// ── Public action helpers called from the React component ─────────────────────

export function battleAction_rollDie(side: BattleSide): void {
  Battle.context?.rollDie(side);
}

export function battleAction_run(): void {
  Battle.context?.run();
}

export function battleAction_applyResults(): void {
  Battle.context?.applyResults();
}

export function battleAction_cancelResults(): void {
  Battle.context?.cancelResults();
}

export function battleAction_randomize(): void {
  Battle.context?.randomize();
}

export function battleAction_changeType(type: string): void {
  Battle.context?.changeType(type);
}

export function battleAction_changePhase(side: BattleSide, phase: string): void {
  Battle.context?.changePhase(side, phase);
}

export function battleAction_changeName(value: string): void {
  Battle.context?.changeName(value);
}

export function battleAction_changePlace(value: string): void {
  Battle.context?.changePlace(value);
}

export function battleAction_generateName(type: "culture" | "random"): void {
  Battle.context?.generateName(type);
}

export function battleAction_showNameSection(): void {
  Battle.context?.showNameSection();
}

export function battleAction_hideNameSection(): void {
  Battle.context?.hideNameSection();
}

export function battleAction_addSide(): void {
  Battle.context?.addSide();
}

export function battleAction_addRegimentToSide(side: BattleSide, stateI: number, regimentI: number): void {
  const context = Battle.context;
  if (!context) return;

  const state = worldContext.pack.states[stateI];
  const regiment = state.military?.find(r => r.i === regimentI) as BattleRegiment | undefined;
  if (!regiment) return;

  context.addRegiment(side, regiment);
  context.calculateStrength(side);
  context.getInitialMorale();

  const defenders = context.defenders.regiments;
  const attackers = context.attackers.regiments;
  const shift = side === "attackers" ? attackers.length * -8 : (defenders.length - 1) * 8;
  regiment.px = regiment.x;
  regiment.py = regiment.y;
  moveRegiment(worldContext, viewContext, appServices, regiment, defenders[0].x, defenders[0].y + shift);
}

export function battleAction_wiki(): void {
  wiki("Battle-Simulator");
}

export type { Battle, BattleRegiment };

export function initBattleScreen(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
