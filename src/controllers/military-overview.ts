import { interpolateString, sum } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { toggleStates } from "../controllers/layers";
import type { MilitaryUnit } from "../modules/military-generator";
import { Military } from "../modules/military-generator";
import { closeDialog, closeDialogs, openConfirm, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { capitalize, rn, sanitizeId, si, wiki } from "../utils";
import { applySorting, fitContent, sortLines, tip } from "../utils/uiHelpers";
import { downloadFile, getFileName, selectIcon } from "./editors";
import { layerIsOn, toggleBorders, toggleMilitary } from "./layers";
import { overviewRegiments } from "./regiments-overview";

type LimitEntity = { i?: number; name?: string; fullName?: string; color?: string; removed?: boolean };
type MilitaryUnitConfig = MilitaryUnit & {
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
};

export function overviewMilitary(): void {
  if (viewContext.customization) return;
  closeDialogs("#militaryOverview, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  const body = document.getElementById("militaryBody") as HTMLElement;
  addLines();
  openDialog("militaryOverview");

  if (modules.overviewMilitary) return;
  modules.overviewMilitary = true;
  updateHeaders();

  openDialog("militaryOverview", {
    title: "Military Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  document.getElementById("militaryOverviewRefresh")!.addEventListener("click", addLines);
  document.getElementById("militaryPercentage")!.addEventListener("click", togglePercentageMode);
  document.getElementById("militaryOptionsButton")!.addEventListener("click", militaryCustomize);
  document.getElementById("militaryRegimentsList")!.addEventListener("click", () => overviewRegiments(-1));
  document.getElementById("militaryOverviewRecalculate")!.addEventListener("click", militaryRecalculate);
  document.getElementById("militaryExport")!.addEventListener("click", downloadMilitaryData);
  document.getElementById("militaryWiki")!.addEventListener("click", () => wiki("Military-Forces"));

  body.addEventListener("change", ev => {
    const el = ev.target as HTMLInputElement;
    const line = el.parentNode as HTMLElement;
    const state = +line.dataset.id!;
    changeAlert(state, line, +el.value);
  });

  body.addEventListener("click", ev => {
    const el = ev.target as HTMLElement;
    const line = el.parentNode as HTMLElement;
    const state = +line.dataset.id!;
    if (el.tagName === "SPAN") overviewRegiments(state);
  });

  function updateHeaders(): void {
    const header = document.getElementById("militaryHeader") as HTMLElement;
    const units = worldContext.options.military!.length;
    header.style.gridTemplateColumns = `8em repeat(${units}, 5.2em) 4em 7em 5em 6em`;

    header.querySelectorAll(".removable").forEach(el => {
      el.remove();
    });
    const insert = (html: string) =>
      document.getElementById("militaryTotalColumn")!.insertAdjacentHTML("beforebegin", html);
    for (const u of worldContext.options.military!) {
      const label = capitalize(u.name.replace(/_/g, " "));
      insert(
        `<div data-tip="State ${u.name} units number. Click to sort" class="sortable removable" data-sortby="${u.name.toLowerCase()}">${label}&nbsp;</div>`
      );
    }
    header.querySelectorAll<HTMLElement>(".removable").forEach(e => {
      e.addEventListener("click", function (this: HTMLElement) {
        sortLines(this);
      });
    });
  }

  function addLines(): void {
    body.innerHTML = "";
    let lines = "";
    const states = worldContext.pack.states.filter(s => s.i && !s.removed);

    for (const s of states) {
      const population = rn(
        ((s.rural ?? 0) + (s.urban ?? 0) * worldContext.urbanization) * worldContext.populationRate
      );
      const getForces = (u: { name: string }) => s.military!.reduce((acc, r) => acc + (r.u[u.name] || 0), 0);
      const total = worldContext.options.military!.reduce((acc, u) => acc + getForces(u) * u.crew, 0);
      const rate = (total / population) * 100;

      const sortData = worldContext.options
        .military!.map(u => `data-${u.name.toLowerCase()}="${getForces(u)}"`)
        .join(" ");
      const lineData = worldContext.options
        .military!.map(u => `<div data-type="${u.name}" data-tip="State ${u.name} units number">${getForces(u)}</div>`)
        .join(" ");

      lines += /* html */ `<div
        class="states"
        data-id=${s.i}
        data-state="${s.name}"
        ${sortData}
        data-total="${total}"
        data-population="${population}"
        data-rate="${rate}"
        data-alert="${s.alert}"
      >
        <fill-box data-tip="${s.fullName}" fill="${s.color}" disabled></fill-box>
        <input data-tip="${s.fullName}" style="width:6em" value="${s.name}" readonly />
        ${lineData}
        <div data-type="total" data-tip="Total state military personnel (considering crew)" style="font-weight: bold">${si(total)}</div>
        <div data-type="population" data-tip="State population">${si(population)}</div>
        <div data-type="rate" data-tip="Military personnel rate (% of state population). Depends on war alert">${rn(rate, 2)}%</div>
        <input
          data-tip="War Alert. Editable modifier to military forces number, depends of political situation"
          style="width:4.1em"
          type="number"
          min="0"
          step=".01"
          value="${rn(s.alert!, 2)}"
        />
        <span data-tip="Show regiments list" class="icon-list-bullet pointer"></span>
      </div>`;
    }
    body.insertAdjacentHTML("beforeend", lines);
    updateFooter();

    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseenter", ev => stateHighlightOn(ev as MouseEvent));
    });
    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseleave", ev => stateHighlightOff(ev as MouseEvent));
    });

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      togglePercentageMode();
    }
    applySorting(document.getElementById("militaryHeader") as HTMLElement);
  }

  function changeAlert(state: number, line: HTMLElement, alert: number): void {
    const s = worldContext.pack.states[state];
    const dif = s.alert || alert ? alert / s.alert! : 0;
    s.alert = alert;
    line.dataset.alert = String(alert);

    s.military!.forEach(r => {
      Object.keys(r.u).forEach(u => {
        r.u[u] = rn(r.u[u] * dif);
      });
      r.a = sum(Object.values(r.u) as number[]);
      viewContext.armies.select(`g>g#regiment${s.i}-${r.i}>text`).text(Military.getTotal(r));
    });

    const getForces = (u: { name: string }) => s.military!.reduce((acc, r) => acc + (r.u[u.name] || 0), 0);
    worldContext.options.military!.forEach(u => {
      line.dataset[u.name] = (line.querySelector(`div[data-type='${u.name}']`) as HTMLElement).innerHTML = String(
        getForces(u)
      );
    });

    const population = rn(((s.rural ?? 0) + (s.urban ?? 0) * worldContext.urbanization) * worldContext.populationRate);
    const total = worldContext.options.military!.reduce((acc, u) => acc + getForces(u) * u.crew, 0);
    const rate = (total / population) * 100;
    line.dataset.total = String(total);
    line.dataset.rate = String(rate);
    (line.querySelector("div[data-type='total']") as HTMLElement).innerHTML = si(total);
    (line.querySelector("div[data-type='rate']") as HTMLElement).innerHTML = `${rn(rate, 2)}%`;

    updateFooter();
  }

  function updateFooter(): void {
    const lines = Array.from(body.querySelectorAll<HTMLElement>(":scope > div"));
    const statesNumber = worldContext.pack.states.filter(s => s.i && !s.removed).length;
    (document.getElementById("militaryFooterStates") as HTMLElement).innerHTML = String(statesNumber);
    const total = sum(lines.map(el => +el.dataset.total!));
    (document.getElementById("militaryFooterForcesTotal") as HTMLElement).innerHTML = si(total);
    (document.getElementById("militaryFooterForces") as HTMLElement).innerHTML = si(total / statesNumber);
    (document.getElementById("militaryFooterRate") as HTMLElement).innerHTML =
      `${rn(sum(lines.map(el => +el.dataset.rate!)) / statesNumber, 2)}%`;
    (document.getElementById("militaryFooterAlert") as HTMLElement).innerHTML = String(
      rn(sum(lines.map(el => +el.dataset.alert!)) / statesNumber, 2)
    );
  }

  function stateHighlightOn(event: MouseEvent): void {
    const state = +(event.target as HTMLElement).dataset.id!;
    if (viewContext.customization || !state) return;
    viewContext.armies.select(`#army${state}`).transition().duration(2000).style("fill", "#ff0000");

    if (!layerIsOn("toggleStates")) return;
    const d = viewContext.regions.select(`#state${state}`).attr("d");

    const path = viewContext.debug
      .append("path")
      .attr("class", "highlight")
      .attr("d", d)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 1)
      .attr("opacity", 1)
      .attr("filter", "url(#blur1)");

    const l = (path.node() as SVGPathElement).getTotalLength();
    const dur = (l + 5000) / 2;
    const interp = interpolateString(`0,${l}`, `${l},${l}`);
    path
      .transition()
      .duration(dur)
      .attrTween("stroke-dasharray", () => (t: number) => interp(t));
  }

  function stateHighlightOff(event: MouseEvent): void {
    viewContext.debug.selectAll(".highlight").each(function () {
      (this as Element & { __transition?: { end?: () => void } }).__transition?.end?.();
    });
    viewContext.debug
      .selectAll<SVGElement, unknown>(".highlight")
      .transition()
      .duration(1000)
      .attr("opacity", 0)
      .remove();

    const state = +(event.target as HTMLElement).dataset.id!;
    viewContext.armies.select(`#army${state}`).transition().duration(1000).style("fill", null);
  }

  function togglePercentageMode(): void {
    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const lines = body.querySelectorAll<HTMLElement>(":scope > div");
      const array = Array.from(lines);
      const cache: Record<string, number> = {};

      const getTotal = (type: string) => {
        if (cache[type] !== undefined) return cache[type];
        cache[type] = sum(array.map(el => Number(el.dataset[type]) || 0));
        return cache[type];
      };

      lines.forEach(el => {
        el.querySelectorAll<HTMLElement>("div").forEach(div => {
          const type = div.dataset.type!;
          if (type === "rate") return;
          const total = getTotal(type);
          div.textContent = total ? `${rn((Number(el.dataset[type]) / total) * 100)}%` : "0%";
        });
      });
    } else {
      body.dataset.type = "absolute";
      addLines();
    }
  }

  function militaryCustomize(): void {
    const types = ["melee", "ranged", "mounted", "machinery", "naval", "armored", "aviation", "magical"];
    const tableBody = document.getElementById("militaryOptions")!.querySelector("tbody") as HTMLTableSectionElement;
    removeUnitLines();
    worldContext.options.military!.forEach(unit => {
      addUnitLine(unit);
    });

    openDialog("militaryOptions", {
      title: "Edit Military Units",
      resizable: false,
      width: fitContent(),
      position: { my: "center", at: "center", of: "svg" },
      buttons: {
        Apply: applyMilitaryOptions,
        Add: () =>
          addUnitLine({
            icon: "🛡️",
            name: `custom${(document.getElementById("militaryOptionsTable") as HTMLTableElement).rows.length}`,
            rural: 0.2,
            urban: 0.5,
            crew: 1,
            power: 1,
            type: "melee",
            separate: 0
          }),
        Restore: restoreDefaultUnits,
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      },
      open: () => {
        const buttons = document.body /* .dialog("widget") removed */
          .querySelectorAll(".ui-dialog-buttonset > button");
        buttons[0].addEventListener("mousemove", () =>
          tip("Apply military units settings. <span style='color:#cb5858'>All forces will be recalculated!</span>")
        );
        buttons[1].addEventListener("mousemove", () => tip("Add new military unit to the table"));
        buttons[2].addEventListener("mousemove", () => tip("Restore default military units and settings"));
        buttons[3].addEventListener("mousemove", () => tip("Close the window without saving the changes"));
      }
    });

    if (modules.overviewMilitaryCustomize) return;
    modules.overviewMilitaryCustomize = true;

    tableBody.addEventListener("click", event => {
      const el = event.target as HTMLButtonElement;
      if (el.tagName !== "BUTTON") return;
      const type = el.dataset.type!;

      if (type === "icon") {
        return selectIcon(el.textContent!, (value: string) => {
          el.innerHTML =
            value.startsWith("http") || value.startsWith("data:image")
              ? `<img src="${value}" style="width:1.2em;height:1.2em;pointer-events:none;">`
              : value;
        });
      }

      if (type === "biomes") {
        const { i, name, color: bColor } = worldContext.biomesData;
        const biomesArray = Array(i.length).fill(null);
        const biomes = biomesArray.map((_: null, idx: number) => ({ i: idx, name: name[idx], color: bColor[idx] }));
        return selectLimitation(el, biomes);
      }
      if (type === "states") return selectLimitation(el, worldContext.pack.states);
      if (type === "cultures") return selectLimitation(el, worldContext.pack.cultures);
      if (type === "religions") return selectLimitation(el, worldContext.pack.religions);
    });

    function removeUnitLines(): void {
      tableBody.querySelectorAll("tr").forEach(el => {
        el.remove();
      });
    }

    function getLimitValue(attr: number[] | undefined): string {
      return attr?.join(",") || "";
    }

    function getLimitText(attr: number[] | undefined): string {
      return attr?.length ? "some" : "all";
    }

    function getLimitTip(attr: number[] | undefined, data: LimitEntity[]): string {
      if (!attr?.length) return "";
      return attr.map(idx => data?.[idx]?.name || "").join(", ");
    }

    function addUnitLine(unit: MilitaryUnitConfig): void {
      const { type, icon, name, rural, urban, power, crew, separate } = unit;
      const row = document.createElement("tr");
      const typeOptions = types
        .map(t => `<option ${type === t ? "selected" : ""} value="${t}">${t}</option>`)
        .join(" ");

      const getLimitButton = (attr: "biomes" | "states" | "cultures" | "religions") =>
        `<button
          data-tip="Select allowed ${attr}"
          data-type="${attr}"
          title="${getLimitTip(unit[attr], (worldContext.pack as unknown as Record<string, LimitEntity[]>)[attr])}"
          data-value="${getLimitValue(unit[attr])}">
          ${getLimitText(unit[attr])}
        </button>`;

      row.innerHTML = /* html */ `<td>
          <button data-type="icon" data-tip="Click to select unit icon">
            ${
              icon.startsWith("http") || icon.startsWith("data:image")
                ? `<img src="${icon}" worldContext.style="width:1.2em;height:1.2em;pointer-events:none;">`
                : icon || ""
            }
          </button>
        </td>
        <td><input data-tip="Type unit name. If name is changed for existing unit, old unit will be replaced" value="${name}" /></td>
        <td>${getLimitButton("biomes")}</td>
        <td>${getLimitButton("states")}</td>
        <td>${getLimitButton("cultures")}</td>
        <td>${getLimitButton("religions")}</td>
        <td><input data-tip="Enter conscription percentage for rural population" type="number" min="0" max="100" step=".01" value="${rural}" /></td>
        <td><input data-tip="Enter conscription percentage for urban population" type="number" min="0" max="100" step=".01" value="${urban}" /></td>
        <td><input data-tip="Enter average number of people in crew (for total personnel calculation)" type="number" min="1" step="1" value="${crew}" /></td>
        <td><input data-tip="Enter military power (used for battle simulation)" type="number" min="0" step=".1" value="${power}" /></td>
        <td>
          <select data-tip="Select unit type to apply special rules on forces recalculation">
            ${typeOptions}
          </select>
        </td>
        <td data-tip="Check if unit is <b>separate</b> and can be stacked only with the same units">
          <input id="${name}Separate" type="checkbox" class="checkbox" ${separate ? "checked" : ""} />
          <label for="${name}Separate" class="checkbox-label"></label>
        </td>
        <td data-tip="Remove the unit">
          <span data-tip="Remove unit type" class="icon-trash-empty pointer" onclick="this.parentElement.parentElement.remove();"></span>
        </td>`;
      tableBody.appendChild(row);
    }

    function restoreDefaultUnits(): void {
      removeUnitLines();
      Military.getDefaultOptions().forEach(unit => {
        addUnitLine(unit);
      });
    }

    function selectLimitation(el: HTMLButtonElement, data: LimitEntity[]): void {
      const type = el.dataset.type!;
      const value = el.dataset.value!;
      const initial = value ? value.split(",").map(v => +v) : [];

      const filtered = data.filter(datum => datum.i && !datum.removed);
      const lines = filtered.map(
        ({ i, name, fullName, color: c }) => /* html */ `
          <tr data-tip="${name}">
            <td><span style="color:${c}">⬤</span></td>
            <td>
              <input data-i="${i}" id="el${i}" type="checkbox" class="checkbox"
                ${!initial.length || (i !== undefined && initial.includes(i)) ? "checked" : ""} >
              <label for="el${i}" class="checkbox-label">${fullName || name}</label>
            </td>
          </tr>`
      );

      openRichDialog({
        title: "Limit unit",
        content: /* html */ `<b>Limit unit by ${type}:</b>
          <table style="margin-top:.3em">
            <tbody>
              ${lines.join("")}
            </tbody>
          </table>`,
        buttons: [
          {
            label: "Invert",
            keepOpen: true,
            onClick: () => {
              const alertMsg = document.getElementById("alert");
              if (alertMsg) {
                alertMsg.querySelectorAll("input").forEach(el => {
                  (el as HTMLInputElement).checked = !(el as HTMLInputElement).checked;
                });
              }
            }
          },
          {
            label: "Apply",
            onClick: () => {
              const alertMsg = document.getElementById("alert");
              if (!alertMsg) return;
              const inputs = Array.from(alertMsg.querySelectorAll<HTMLInputElement>("input"));
              const selected = inputs.reduce<string[]>((acc, input) => {
                if (input.checked) acc.push(input.dataset.i!);
                return acc;
              }, []);

              if (!selected.length) return tip("Select at least one element", false, "error");

              const allAreSelected = selected.length === inputs.length;
              el.dataset.value = allAreSelected ? "" : selected.join(",");
              el.innerHTML = allAreSelected ? "all" : "some";
              el.setAttribute("title", getLimitTip(selected.map(Number), data));
            }
          },
          {
            label: "Cancel",
            onClick: () => {}
          }
        ]
      });
    }

    function applyMilitaryOptions(): void {
      const unitLines = Array.from(tableBody.querySelectorAll("tr"));
      const names = unitLines.map(r => sanitizeId(r.querySelector("input")!.value));
      if (new Set(names).size !== names.length) {
        tip("All units should have unique names", false, "error");
        return;
      }

      closeDialog("militaryOptions");

      worldContext.options.military = unitLines.map((r, i) => {
        const elements = Array.from(r.querySelectorAll<HTMLElement>("input, button, select"));
        const [icon, _name, biomes, states, cultures, religions, rural, urban, crew, power, type, separate] =
          elements.map(el => {
            const { type: dType, value: dValue } = el.dataset;
            if (dType === "icon") {
              const val = el.innerHTML.trim();
              const isImage = val.startsWith("<img");
              return isImage ? val.match(/src="([^"]*)"/)?.[1] : val || "⠀";
            }
            if (dType) return dValue ? dValue.split(",").map((v: string) => parseInt(v, 10)) : null;
            if ((el as HTMLInputElement).type === "number") return +(el as HTMLInputElement).value || 0;
            if ((el as HTMLInputElement).type === "checkbox") return +(el as HTMLInputElement).checked || 0;
            return (el as HTMLInputElement).value;
          });

        const unit: MilitaryUnitConfig = {
          icon: icon as string,
          name: names[i],
          rural: rural as number,
          urban: urban as number,
          crew: crew as number,
          power: power as number,
          type: type as string,
          separate: separate as number
        };
        if (biomes) unit.biomes = biomes as number[];
        if (states) unit.states = states as number[];
        if (cultures) unit.cultures = cultures as number[];
        if (religions) unit.religions = religions as number[];
        return unit;
      });
      localStorage.setItem("military", JSON.stringify(worldContext.options.military));
      Military.generate(worldContext, viewContext, appServices, getWorldState());
      updateHeaders();
      addLines();
    }
  }

  function militaryRecalculate(): void {
    openConfirm(
      "Are you sure you want to recalculate military forces for all states?<br>Regiments for all states will be regenerated",
      {
        title: "Recalculate military",
        confirm: "Recalculate",
        onConfirm: () => {
          Military.generate(worldContext, viewContext, appServices, getWorldState());
          addLines();
        }
      }
    );
  }

  function downloadMilitaryData(): void {
    const units = worldContext.options.military!.map(u => u.name);
    let data = `Id,State,${units.map(u => capitalize(u)).join(",")},Total,Population,Rate,War Alert\n`;

    body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
      data += `${el.dataset.id},`;
      data += `${el.dataset.state},`;
      data += `${units.map(u => el.dataset[u.toLowerCase()]).join(",")},`;
      data += `${el.dataset.total},`;
      data += `${el.dataset.population},`;
      data += `${rn(+el.dataset.rate!, 2)}%,`;
      data += `${el.dataset.alert}\n`;
    });

    const name = `${getFileName("Military")}.csv`;
    downloadFile(data, name);
  }
}

declare global {
  var overviewMilitaryCustomize: boolean | undefined;
  var militaryFooterStates: HTMLElement;
  var militaryFooterForcesTotal: HTMLElement;
  var militaryFooterForces: HTMLElement;
  var militaryFooterRate: HTMLElement;
  var militaryFooterAlert: HTMLElement;
  var militaryTotalColumn: HTMLElement;
  var militaryHeader: HTMLElement;
  var militaryOptionsTable: HTMLTableElement;
}

export function initMilitaryOverview(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
