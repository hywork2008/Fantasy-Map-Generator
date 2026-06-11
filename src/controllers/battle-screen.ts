import { mean, sum } from "d3";
import { capitalize, ensureEl, getAdjective, last, list, minmax, Pint, rand, rn } from "../utils";

type BattleSide = "attackers" | "defenders";

interface BattleForces {
  regiments: any[];
  distances: number[];
  morale: number;
  casualties: number;
  power: number;
  phase?: string;
  die?: number;
}

class Battle {
  iteration!: number;
  x!: number;
  y!: number;
  cell!: number;
  attackers!: BattleForces;
  defenders!: BattleForces;
  place!: string;
  type!: string;
  name!: string;

  constructor(attacker: any, defender: any) {
    if (customization) return;
    closeDialogs(".stable");
    customization = 13;

    (Battle.prototype as any).context = this;
    this.iteration = 0;
    this.x = defender.x;
    this.y = defender.y;
    this.cell = findCell(this.x, this.y);
    this.attackers = { regiments: [], distances: [], morale: 100, casualties: 0, power: 0 };
    this.defenders = { regiments: [], distances: [], morale: 100, casualties: 0, power: 0 };

    this.addHeaders();
    this.addRegiment("attackers", attacker);
    this.addRegiment("defenders", defender);
    this.place = this.definePlace();
    this.defineType();
    this.name = this.defineName();
    this.randomize();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
    this.getInitialMorale();

    $("#battleScreen").dialog({
      title: this.name,
      resizable: false,
      width: fitContent(),
      position: { my: "center", at: "center", of: "#map" },
      close: () => (Battle.prototype as any).context.cancelResults()
    });

    if (modules.Battle) return;
    modules.Battle = true;

    ensureEl("battleType").addEventListener("click", ev => this.toggleChange(ev));
    (ensureEl("battleType").nextElementSibling as HTMLElement).addEventListener("click", ev =>
      (Battle.prototype as any).context.changeType(ev)
    );
    ensureEl("battleNameShow").addEventListener("click", () => (Battle.prototype as any).context.showNameSection());
    ensureEl("battleNamePlace").addEventListener(
      "change",
      ev => ((Battle.prototype as any).context.place = (ev.target as HTMLInputElement).value)
    );
    ensureEl("battleNameFull").addEventListener("change", ev => (Battle.prototype as any).context.changeName(ev));
    ensureEl("battleNameCulture").addEventListener("click", () =>
      (Battle.prototype as any).context.generateName("culture")
    );
    ensureEl("battleNameRandom").addEventListener("click", () =>
      (Battle.prototype as any).context.generateName("random")
    );
    ensureEl("battleNameHide").addEventListener("click", this.hideNameSection);
    ensureEl("battleAddRegiment").addEventListener("click", this.addSide);
    ensureEl("battleRoll").addEventListener("click", () => (Battle.prototype as any).context.randomize());
    ensureEl("battleRun").addEventListener("click", () => (Battle.prototype as any).context.run());
    ensureEl("battleApply").addEventListener("click", () => (Battle.prototype as any).context.applyResults());
    ensureEl("battleCancel").addEventListener("click", () => (Battle.prototype as any).context.cancelResults());
    ensureEl("battleWiki").addEventListener("click", () => wiki("Battle-Simulator"));

    ensureEl("battlePhase_attackers").addEventListener("click", ev => this.toggleChange(ev));
    (ensureEl("battlePhase_attackers").nextElementSibling as HTMLElement).addEventListener("click", ev =>
      (Battle.prototype as any).context.changePhase(ev, "attackers")
    );
    ensureEl("battlePhase_defenders").addEventListener("click", ev => this.toggleChange(ev));
    (ensureEl("battlePhase_defenders").nextElementSibling as HTMLElement).addEventListener("click", ev =>
      (Battle.prototype as any).context.changePhase(ev, "defenders")
    );
    ensureEl("battleDie_attackers").addEventListener("click", () =>
      (Battle.prototype as any).context.rollDie("attackers")
    );
    ensureEl("battleDie_defenders").addEventListener("click", () =>
      (Battle.prototype as any).context.rollDie("defenders")
    );
  }

  defineType(): void {
    const attacker = this.attackers.regiments[0];
    const defender = this.defenders.regiments[0];
    const getType = () => {
      const typesA = Object.keys(attacker.u).map((name: string) => options.military!.find(u => u.name === name)!.type);
      const typesD = Object.keys(defender.u).map((name: string) => options.military!.find(u => u.name === name)!.type);

      if (attacker.n && defender.n) return "naval";
      if (typesA.every((t: string) => t === "aviation") && typesD.every((t: string) => t === "aviation")) return "air";
      if (attacker.n && !defender.n && typesA.some((t: string) => t !== "naval")) return "landing";
      if (!defender.n && pack.burgs[pack.cells.burg![this.cell]].walls) return "siege";
      if (P(0.1) && [5, 6, 7, 8, 9, 12].includes(pack.cells.biome![this.cell])) return "ambush";
      return "field";
    };

    this.type = getType();
    this.setType();
  }

  setType(): void {
    ensureEl("battleType").className = `icon-button-${this.type}`;

    const sideSpecific = document.getElementById(`battlePhases_${this.type}_attackers`) as HTMLTemplateElement | null;
    const attackers = sideSpecific
      ? sideSpecific.content
      : (document.getElementById(`battlePhases_${this.type}`) as HTMLTemplateElement).content;
    const defenders = sideSpecific
      ? (document.getElementById(`battlePhases_${this.type}_defenders`) as HTMLTemplateElement).content
      : attackers;

    (ensureEl("battlePhase_attackers").nextElementSibling as HTMLElement).innerHTML = "";
    (ensureEl("battlePhase_defenders").nextElementSibling as HTMLElement).innerHTML = "";
    (ensureEl("battlePhase_attackers").nextElementSibling as HTMLElement).append(attackers.cloneNode(true));
    (ensureEl("battlePhase_defenders").nextElementSibling as HTMLElement).append(defenders.cloneNode(true));
  }

  definePlace(): string {
    const cells = pack.cells;
    const i = this.cell;
    const burg = cells.burg![i] ? pack.burgs[cells.burg![i]].name : null;
    const getRiver = (idx: number) => {
      const river = pack.rivers!.find(r => r.i === idx);
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

  addHeaders(): void {
    let headers = "<thead><tr><th></th><th></th>";

    for (const u of options.military!) {
      const label = capitalize(u.name.replace(/_/g, " "));
      const isExternal = u.icon.startsWith("http") || u.icon.startsWith("data:image");
      const iconHTML = isExternal ? `<img src="${u.icon}" width="15" height="15">` : u.icon;
      headers += `<th data-tip="${label}">${iconHTML}</th>`;
    }

    headers += "<th data-tip='Total military''>Total</th></tr></thead>";
    battleAttackers.innerHTML = battleDefenders.innerHTML = headers;
  }

  addRegiment(side: BattleSide, regiment: any): void {
    regiment.casualties = Object.keys(regiment.u).reduce((a: any, b: string) => {
      a[b] = 0;
      return a;
    }, {});
    regiment.survivors = Object.assign({}, regiment.u);

    const state = pack.states[regiment.state];
    const distance = (Math.hypot(this.y - regiment.by, this.x - regiment.bx) * distanceScale) | 0;
    const color = (state.color ?? "#999")[0] === "#" ? (state.color ?? "#999") : "#999";

    const isExternal = regiment.icon.startsWith("http") || regiment.icon.startsWith("data:image");
    const iconHtml = isExternal
      ? `<image href="${regiment.icon}" x="0.1em" y="0.1em" width="1.2em" height="1.2em"></image>`
      : `<text x="50%" y="1em" style="text-anchor: middle">${regiment.icon}</text>`;
    const icon = `<svg width="1.4em" height="1.4em" style="margin-bottom: -.6em; stroke: #333">
      <rect x="0" y="0" width="100%" height="100%" fill="${color}"></rect>${iconHtml}</svg>`;
    const body = `<tbody id="battle${state.i}-${regiment.i}">`;

    let initial = `<tr class="battleInitial"><td>${icon}</td><td class="regiment" data-tip="${regiment.name}">${regiment.name.slice(0, 24)}</td>`;
    let casualties = `<tr class="battleCasualties"><td></td><td data-tip="${state.fullName ?? ""}">${(state.fullName ?? "").slice(0, 26)}</td>`;
    let survivors = `<tr class="battleSurvivors"><td></td><td data-tip="Supply line length, affects morale">Distance to base: ${distance} ${distanceUnitInput.value}</td>`;

    for (const u of options.military!) {
      initial += `<td data-tip="Initial forces" style="width: 2.5em; text-align: center">${regiment.u[u.name] || 0}</td>`;
      casualties += `<td data-tip="Casualties" style="width: 2.5em; text-align: center; color: red">0</td>`;
      survivors += `<td data-tip="Survivors" style="width: 2.5em; text-align: center; color: green">${regiment.u[u.name] || 0}</td>`;
    }

    initial += `<td data-tip="Initial forces" style="width: 2.5em; text-align: center">${regiment.a || 0}</td></tr>`;
    casualties += `<td data-tip="Casualties"  style="width: 2.5em; text-align: center; color: red">0</td></tr>`;
    survivors += `<td data-tip="Survivors" style="width: 2.5em; text-align: center; color: green">${regiment.a || 0}</td></tr>`;

    const div = side === "attackers" ? battleAttackers : battleDefenders;
    div.innerHTML += `${body + initial + casualties + survivors}</tbody>`;
    this[side].regiments.push(regiment);
    this[side].distances.push(distance);
  }

  addSide(): void {
    const body = ensureEl("regimentSelectorBody");
    const context = (Battle.prototype as any).context;
    const regiments = pack.states.filter((s: any) => s.military && !s.removed).flatMap((s: any) => s.military);
    const distance = (reg: any) =>
      `${rn(Math.hypot(context.y - reg.y, context.x - reg.x) * distanceScale)} ${distanceUnitInput.value}`;
    const isAdded = (reg: any) =>
      context.defenders.regiments.some((r: any) => r === reg) ||
      context.attackers.regiments.some((r: any) => r === reg);

    body.innerHTML = (regiments as any[])
      .map((r: any) => {
        const s = pack.states[r.state];
        const added = isAdded(r);
        const dist = added ? `0 ${distanceUnitInput.value}` : distance(r);
        return `<div ${added ? "class='inactive'" : ""} data-s=${s.i} data-i=${r.i} data-state=${s.name} data-regiment=${r.name}
        data-total=${r.a} data-distance=${dist} data-tip="Click to select regiment">
        <svg width=".9em" height=".9em" style="margin-bottom:-1px; stroke: #333"><rect x="0" y="0" width="100%" height="100%" fill="${s.color}" ></svg>
        <div style="width:6em">${s.name.slice(0, 11)}</div>
        <div style="width:1.2em">${r.icon}</div>
        <div style="width:13em">${r.name.slice(0, 24)}</div>
        <div style="width:4em">${r.a}</div>
        <div style="width:4em">${dist}</div>
      </div>`;
      })
      .join("");

    $("#regimentSelectorScreen").dialog({
      resizable: false,
      width: fitContent(),
      title: "Add regiment to the battle",
      position: { my: "left center", at: "right+10 center", of: "#battleScreen" },
      close: addSideClosed,
      buttons: {
        "Add to attackers": () => addSideClicked("attackers"),
        "Add to defenders": () => addSideClicked("defenders"),
        Cancel: () => $("#regimentSelectorScreen").dialog("close")
      }
    });

    applySorting(document.getElementById("regimentSelectorHeader") as HTMLElement);
    body.addEventListener("click", selectLine);

    function selectLine(ev: Event): void {
      const target = ev.target as HTMLElement;
      if (target.className === "inactive") {
        tip("Regiment is already in the battle", false, "error");
        return;
      }
      target.classList.toggle("selected");
    }

    function addSideClicked(side: BattleSide): void {
      const selected = body.querySelectorAll(".selected");
      if (!selected.length) {
        tip("Please select a regiment first", false, "error");
        return;
      }

      $("#regimentSelectorScreen").dialog("close");
      selected.forEach(line => {
        const lineEl = line as HTMLElement;
        const state = pack.states[+lineEl.dataset.s!];
        const regiment = state.military!.find((r: any) => r.i === +lineEl.dataset.i!);
        Battle.prototype.addRegiment.call(context, side, regiment);
        Battle.prototype.calculateStrength.call(context, side);
        Battle.prototype.getInitialMorale.call(context);

        const defenders = context.defenders.regiments;
        const attackers = context.attackers.regiments;
        const shift = side === "attackers" ? attackers.length * -8 : (defenders.length - 1) * 8;
        regiment.px = regiment.x;
        regiment.py = regiment.y;
        moveRegiment(regiment, defenders[0].x, defenders[0].y + shift);
      });
    }

    function addSideClosed(): void {
      body.innerHTML = "";
      body.removeEventListener("click", selectLine);
    }
  }

  showNameSection(): void {
    document.querySelectorAll<HTMLElement>("#battleBottom > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("battleNameSection") as HTMLElement).style.display = "inline-block";

    (ensureEl("battleNamePlace") as HTMLInputElement).value = this.place;
    (ensureEl("battleNameFull") as HTMLInputElement).value = this.name;
  }

  hideNameSection(): void {
    document.querySelectorAll<HTMLElement>("#battleBottom > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("battleNameSection") as HTMLElement).style.display = "none";
  }

  changeName(ev: Event): void {
    this.name = (ev.target as HTMLInputElement).value;
    $("#battleScreen").dialog({ title: this.name });
  }

  generateName(type: string): void {
    const place =
      type === "culture"
        ? Names.getCulture(pack.cells.culture![this.cell], undefined, undefined, "")
        : Names.getBase(rand(nameBases.length - 1));
    (ensureEl("battleNamePlace") as HTMLInputElement).value = this.place = place;
    (ensureEl("battleNameFull") as HTMLInputElement).value = this.name = this.defineName();
    $("#battleScreen").dialog({ title: this.name });
  }

  getJoinedForces(regiments: any[]): Record<string, number> {
    return regiments.reduce((a: Record<string, number>, b: any) => {
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
    const adjuster = Math.max(populationRate / 10, 10);
    this[side].power =
      sum(options.military!.map(u => (forces[u.name] || 0) * u.power * scheme[phase][u.type])) / adjuster;
    const UIvalue = this[side].power ? Math.max(this[side].power | 0, 1) : 0;
    (ensureEl(`battlePower_${side}`) as HTMLElement).innerHTML = String(UIvalue);
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
    const morale = ensureEl(`battleMorale_${side}`) as HTMLInputElement;
    morale.dataset.tip = morale.dataset.tip!.replace(morale.value, "");
    morale.value = String(this[side].morale | 0);
    morale.dataset.tip += morale.value;
  }

  randomize(): void {
    this.rollDie("attackers");
    this.rollDie("defenders");
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
  }

  rollDie(side: BattleSide): void {
    const el = ensureEl(`battleDie_${side}`) as HTMLElement;
    const prev = +el.innerHTML;
    do {
      el.innerHTML = String(rand(1, 6));
    } while (+el.innerHTML === prev);
    this[side].die = +el.innerHTML;
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
            options
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
        const machinery = options.military!.filter(u => u.type === "machinery").map(u => u.name);

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

    const buttonA = ensureEl("battlePhase_attackers") as HTMLElement;
    buttonA.className = `icon-button-${this.attackers.phase}`;
    buttonA.dataset.tip = (
      buttonA.nextElementSibling!.querySelector(`[data-phase='${phase[0]}']`) as HTMLElement
    ).dataset.tip;

    const buttonD = ensureEl("battlePhase_defenders") as HTMLElement;
    buttonD.className = `icon-button-${this.defenders.phase}`;
    buttonD.dataset.tip = (
      buttonD.nextElementSibling!.querySelector(`[data-phase='${phase[1]}']`) as HTMLElement
    ).dataset.tip;
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

    this.updateTable("attackers");
    this.updateTable("defenders");

    this.iteration += 1;
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
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

  updateTable(side: BattleSide): void {
    for (const r of this[side].regiments) {
      const tbody = document.getElementById(`battle${r.state}-${r.i}`) as HTMLElement;
      const battleCasualties = tbody.querySelector(".battleCasualties") as HTMLElement;
      const battleSurvivors = tbody.querySelector(".battleSurvivors") as HTMLElement;

      let index = 3;
      for (const u of options.military!) {
        (battleCasualties.querySelector(`td:nth-child(${index})`) as HTMLElement).innerHTML = String(
          r.casualties[u.name] || 0
        );
        (battleSurvivors.querySelector(`td:nth-child(${index})`) as HTMLElement).innerHTML = String(
          r.survivors[u.name] || 0
        );
        index++;
      }

      (battleCasualties.querySelector(`td:nth-child(${index})`) as HTMLElement).innerHTML = String(
        sum(Object.values(r.casualties) as number[])
      );
      (battleSurvivors.querySelector(`td:nth-child(${index})`) as HTMLElement).innerHTML = String(
        sum(Object.values(r.survivors) as number[])
      );
    }
    this.updateMorale(side);
  }

  toggleChange(ev: Event): void {
    ev.stopPropagation();
    const button = ev.target as HTMLElement;
    const div = button.nextElementSibling as HTMLElement;

    const hideSection = (): void => {
      button.style.opacity = "1";
      div.style.display = "none";
    };
    if (div.style.display === "block") {
      hideSection();
      return;
    }

    button.style.opacity = "0.5";
    div.style.display = "block";

    document.body.addEventListener("click", hideSection, { once: true });
  }

  changeType(ev: Event): void {
    const target = ev.target as HTMLElement;
    if (target.tagName !== "BUTTON") return;
    this.type = target.dataset.type!;
    this.setType();
    this.selectPhase();
    this.calculateStrength("attackers");
    this.calculateStrength("defenders");
    this.name = this.defineName();
    $("#battleScreen").dialog({ title: this.name });
  }

  changePhase(ev: Event, side: BattleSide): void {
    const target = ev.target as HTMLElement;
    if (target.tagName !== "BUTTON") return;
    this[side].phase = target.dataset.phase!;
    const phase = this[side].phase!;
    const button = ensureEl(`battlePhase_${side}`) as HTMLElement;
    button.className = `icon-button-${phase}`;
    button.dataset.tip = target.dataset.tip!;
    this.calculateStrength(side);
  }

  applyResults(): void {
    const battleName = this.name;
    const maxCasualties = Math.max(this.attackers.casualties, this.attackers.casualties);
    const relativeCasualties = this.defenders.casualties / (this.attackers.casualties + this.attackers.casualties);
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

    function applyResultForSide(r: any, side: BattleSide): void {
      const id = `regiment${r.state}-${r.i}`;

      const note = notes.find(n => n.id === id);
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
        const legend = `\r\n\r\n${battleName} (${options.year} ${options.eraShort}): ${status}. The regiment ${regStatus}.${casualtiesText}`;
        note.legend += legend;
      }

      r.u = Object.assign({}, r.survivors);
      r.a = sum(Object.values(r.u) as number[]);
      armies.select(`g#${id} > text`).text(Military.getTotal(r));

      moveRegiment(r, r.px, r.py);
    }

    const markerI = last(pack.markers)?.i + 1 || 0;
    {
      const marker = { i: markerI, x: this.x, y: this.y, cell: this.cell, icon: "⚔️", type: "battlefields", dy: 52 };
      pack.markers.push(marker);
      const markerHTML = drawMarker(marker);
      (document.getElementById("markers") as HTMLElement).insertAdjacentHTML("beforeend", markerHTML);
    }

    const getSide = (regs: any[], n: number) =>
      regs.length > 1
        ? `${n ? "regiments" : "forces"} of ${list([...new Set(regs.map(r => pack.states[r.state].name))])}`
        : `${getAdjective(pack.states[regs[0].state].name)} ${regs[0].name}`;
    const getLosses = (casualties: number) => Math.min(rn(casualties * 100), 100);

    const status = battleStatus[+P(0.7)];
    const result = `The ${this.getTypeName()} ended in ${status}`;
    const legend = `${this.name} took place in ${options.year} ${options.eraShort}. It was fought between ${getSide(
      this.attackers.regiments,
      1
    )} and ${getSide(this.defenders.regiments, 0)}. ${result}.
      \r\nAttackers losses: ${getLosses(this.attackers.casualties)}%, defenders losses: ${getLosses(this.defenders.casualties)}%`;
    notes.push({ id: `marker${markerI}`, name: this.name, legend });

    tip(`${this.name} is over. ${result}`, true, "success", 4000);

    $("#battleScreen").dialog("destroy");
    this.cleanData();
  }

  cancelResults(): void {
    this.attackers.regiments.forEach(r => {
      moveRegiment(r, r.px, r.py);
    });
    this.defenders.regiments.forEach(r => {
      moveRegiment(r, r.px, r.py);
    });

    $("#battleScreen").dialog("close");
    this.cleanData();
  }

  cleanData(): void {
    battleAttackers.innerHTML = battleDefenders.innerHTML = "";
    customization = 0;

    this.attackers.regiments.concat(this.defenders.regiments).forEach(r => {
      delete r.px;
      delete r.py;
      delete r.casualties;
      delete r.survivors;
    });
    delete (Battle.prototype as any).context;
  }
}

window.Battle = Battle;

export type { Battle };

declare global {
  interface Window {
    Battle: new (...args: any[]) => any;
  }
  var wiki: (topic: string) => void;
}
