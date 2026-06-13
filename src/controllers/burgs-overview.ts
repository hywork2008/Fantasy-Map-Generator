import * as d3 from "d3";
import { pointer } from "d3";
import { Burgs, Names } from "../modules";
import { applySorting, ensureEl, getHeight, rn, si } from "../utils";
import { editBurg, getTemperatureLikeness } from "./burg-editor";
import { editBurgGroups } from "./burg-group-editor";
import {
  closeDialogs,
  confirmationDialog,
  downloadFile,
  fitContent,
  getFileName,
  restoreDefaultEvents,
  uploadFile
} from "./editors";
import { layerIsOn, toggleBurgIcons, toggleLabels } from "./layers";

export function overviewBurgs(settings: { stateId?: number | null; cultureId?: number | null } = {}): void {
  if (customization) return;
  closeDialogs("#burgsOverview, .stable");
  if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  const body = ensureEl("burgsBody");
  updateFilter();
  updateLockAllIcon();
  burgsOverviewAddLines();
  $("#burgsOverview").dialog();

  if (modules.overviewBurgs) return;
  modules.overviewBurgs = true;

  $("#burgsOverview").dialog({
    title: "Burgs Overview",
    resizable: false,
    width: fitContent(),
    close: exitAddBurgMode,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  ensureEl("burgsOverviewRefresh").addEventListener("click", refreshBurgsEditor);
  ensureEl("burgsGroupsEditorButton").addEventListener("click", editBurgGroups);
  ensureEl("burgsChart").addEventListener("click", showBurgsChart);
  ensureEl("burgsFilterState").addEventListener("change", burgsOverviewAddLines);
  ensureEl("burgsFilterCulture").addEventListener("change", burgsOverviewAddLines);
  ensureEl("burgsSearch").addEventListener("input", burgsOverviewAddLines);
  ensureEl("regenerateBurgNames").addEventListener("click", regenerateNames);
  ensureEl("addNewBurg").addEventListener("click", enterAddBurgMode);
  ensureEl("burgsExport").addEventListener("click", downloadBurgsData);
  ensureEl("burgNamesImport").addEventListener("click", renameBurgsInBulk);
  (ensureEl("burgsListToLoad") as HTMLInputElement).addEventListener("change", function (this: HTMLInputElement) {
    uploadFile(this, importBurgNames);
  });
  ensureEl("burgsLockAll").addEventListener("click", toggleLockAll);
  ensureEl("burgsRemoveAll").addEventListener("click", triggerAllBurgsRemove);

  function refreshBurgsEditor(): void {
    updateFilter();
    burgsOverviewAddLines();
  }

  function updateFilter(): void {
    const stateFilter = ensureEl("burgsFilterState") as HTMLSelectElement;
    const selectedState = settings.stateId !== null ? settings.stateId : +stateFilter.value || -1;
    stateFilter.options.length = 0;
    stateFilter.options.add(new Option("all", "-1", false, selectedState === -1));
    stateFilter.options.add(new Option(pack.states[0].name, "0", false, selectedState === 0));
    const statesSorted = pack.states.filter(s => s.i && !s.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
    statesSorted.forEach(s => {
      stateFilter.options.add(new Option(s.name, String(s.i), false, s.i === selectedState));
    });

    const cultureFilter = ensureEl("burgsFilterCulture") as HTMLSelectElement;
    const selectedCulture = settings.cultureId !== null ? settings.cultureId : +cultureFilter.value || -1;
    cultureFilter.options.length = 0;
    cultureFilter.options.add(new Option(`all`, "-1", false, selectedCulture === -1));
    cultureFilter.options.add(new Option(pack.cultures[0].name, "0", false, selectedCulture === 0));
    const culturesSorted = pack.cultures.filter(c => c.i && !c.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
    culturesSorted.forEach(c => {
      cultureFilter.options.add(new Option(c.name, String(c.i), false, c.i === selectedCulture));
    });
  }

  function burgsOverviewAddLines(): void {
    const searchText = (ensureEl("burgsSearch") as HTMLInputElement).value.toLowerCase().trim();
    const selectedStateId = +(ensureEl("burgsFilterState") as HTMLSelectElement).value;
    const selectedCultureId = +(ensureEl("burgsFilterCulture") as HTMLSelectElement).value;

    const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
    let filtered = validBurgs;

    if (searchText) {
      filtered = filtered.filter(b => {
        const name = b.name!.toLowerCase();
        const state = (pack.states[b.state!]?.name || "").toLowerCase();
        const prov = pack.cells.province![b.cell];
        const province = prov ? pack.provinces![prov]?.name.toLowerCase() : "";
        const culture = (pack.cultures[b.culture!]?.name || "").toLowerCase();
        return (
          name.includes(searchText) ||
          state.includes(searchText) ||
          province.includes(searchText) ||
          culture.includes(searchText) ||
          b.group!.toLowerCase().includes(searchText)
        );
      });
    }
    if (selectedStateId !== -1) filtered = filtered.filter(b => b.state === selectedStateId);
    if (selectedCultureId !== -1) filtered = filtered.filter(b => b.culture === selectedCultureId);

    body.innerHTML = "";
    let lines = "";
    let totalPopulation = 0;

    for (const b of filtered) {
      const population = b.population! * populationRate * urbanization;
      totalPopulation += population;
      const features = b.capital && b.port ? "a-capital-port" : b.capital ? "c-capital" : b.port ? "p-port" : "z-burg";
      const state = pack.states[b.state!].name;
      const prov = pack.cells.province![b.cell];
      const province = prov ? pack.provinces![prov].name : "";
      const culture = pack.cultures[b.culture!].name;

      lines += /* html */ `<div
        class="states"
        data-id=${b.i!}
        data-name="${b.name!}"
        data-state="${state}"
        data-province="${province}"
        data-culture="${culture}"
        data-group="${b.group!}"
        data-population=${population}
        data-features="${features}"
      >
        <span data-tip="Click to zoom into view" class="icon-dot-circled pointer"></span>
        <input data-tip="Burg name" class="burgName" value="${b.name!}" disabled />
        <input data-tip="Burg province" value="${province}" disabled />
        <input data-tip="Burg state" value="${state}" disabled />
        <input data-tip="Dominant culture" value="${culture}" disabled />
        <input data-tip="Burg group" value="${b.group!}" disabled />
        <span data-tip="Burg population" class="icon-male"></span>
        <input data-tip="Burg population" value=${si(population)} style="width: 5em" disabled />
        <div style="width: 3em">
          <span
            data-tip="${b.capital ? " This burg is a state capital" : "This burg is a NOT state capital"}"
            class="icon-star-empty${b.capital ? "" : " inactive"}" style="padding: 0 1px;"></span>
          <span data-tip="${b.port ? " This burg is a port" : "This burg is NOT a port"}"
          class="icon-anchor${b.port ? "" : " inactive"}" style="font-size: .9em; padding: 0 1px;"></span>
        </div>
        <span data-tip="Edit burg" class="icon-pencil"></span>
        <span class="locks pointer ${
          b.lock ? "icon-lock" : "icon-lock-open inactive"
        }" onmouseover="showElementLockTip(event)"></span>
        <span data-tip="Remove burg" class="icon-trash-empty"></span>
      </div>`;
    }
    if (!filtered.length) body.innerHTML = /* html */ `<div style="padding-block: 0.3em;">No burgs found</div>`;
    body.insertAdjacentHTML("beforeend", lines);

    (document.getElementById("burgsFooterBurgs") as HTMLElement).innerHTML =
      `${filtered.length} of ${validBurgs.length}`;
    (document.getElementById("burgsFooterPopulation") as HTMLElement).innerHTML = filtered.length
      ? si(totalPopulation / filtered.length)
      : "0";

    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseenter", ev => burgHighlightOn(ev as MouseEvent));
    });
    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("mouseleave", () => burgHighlightOff());
    });
    body.querySelectorAll("div > span.icon-dot-circled").forEach(el => {
      el.addEventListener("click", zoomIntoBurg);
    });
    body.querySelectorAll("div > span.locks").forEach(el => {
      el.addEventListener("click", toggleBurgLockStatus);
    });
    body.querySelectorAll("div > span.icon-pencil").forEach(el => {
      el.addEventListener("click", openBurgEditor);
    });
    body.querySelectorAll("div > span.icon-trash-empty").forEach(el => {
      el.addEventListener("click", triggerBurgRemove);
    });

    applySorting(document.getElementById("burgsHeader") as HTMLElement);
  }

  function burgHighlightOn(event: MouseEvent): void {
    const burg = +(event.target as HTMLElement).dataset.id!;
    const label = burgLabels.select(`[data-id='${burg}']`);
    if (label.size()) label.classed("drag", true);
  }

  function burgHighlightOff(): void {
    burgLabels.selectAll("text.drag").classed("drag", false);
  }

  function zoomIntoBurg(this: HTMLElement): void {
    const burg = +(this.parentNode as HTMLElement).dataset.id!;
    const label = document.querySelector(`#burgLabels [data-id='${burg}']`) as SVGTextElement;
    const x = +label.getAttribute("x")!;
    const y = +label.getAttribute("y")!;
    zoomTo(x, y, 8, 2000);
  }

  function toggleBurgLockStatus(this: HTMLElement): void {
    const burgId = +(this.parentNode as HTMLElement).dataset.id!;

    const burg = pack.burgs[burgId];
    burg.lock = !burg.lock;

    if (this.classList.contains("icon-lock")) {
      this.classList.remove("icon-lock");
      this.classList.add("icon-lock-open");
      this.classList.add("inactive");
    } else {
      this.classList.remove("icon-lock-open");
      this.classList.add("icon-lock");
      this.classList.remove("inactive");
    }
  }

  function openBurgEditor(this: HTMLElement): void {
    const burg = +(this.parentNode as HTMLElement).dataset.id!;
    editBurg(burg);
  }

  function triggerBurgRemove(this: HTMLElement): void {
    const burgId = +(this.parentNode as HTMLElement).dataset.id!;
    if (pack.burgs[burgId].capital) {
      tip("You cannot remove the capital. Please change the state capital first", false, "error");
      return;
    }

    confirmationDialog({
      title: "Remove burg",
      message: "Are you sure you want to remove the burg? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        Burgs.remove(burgId);
        burgsOverviewAddLines();
      }
    });
  }

  function regenerateNames(): void {
    body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
      const burg = +el.dataset.id!;
      if (pack.burgs[burg].lock) return;

      const culture = pack.burgs[burg].culture!;
      const name = Names.getCulture(culture);

      (el.querySelector(".burgName") as HTMLInputElement).value = name;
      pack.burgs[burg].name = el.dataset.name = name;
      burgLabels.select(`[data-id='${burg}']`).text(name);
    });
  }

  function enterAddBurgMode(this: HTMLElement): void {
    if (this.classList.contains("pressed")) {
      exitAddBurgMode();
      return;
    }
    customization = 3;
    this.classList.add("pressed");
    tip("Click on the map to create a new burg. Hold Shift to add multiple", true, "warn");
    viewbox.style("cursor", "crosshair").on("click", addBurgOnClick);
  }

  function addBurgOnClick(this: SVGElement, event: MouseEvent): void {
    const point = pointer(event, this) as [number, number];
    const cell = findCell(point[0], point[1]);

    if (pack.cells.h[cell] < 20) {
      tip("You cannot place state into the water. Please click on a land cell", false, "error");
      return;
    }
    if (pack.cells.burg![cell]) {
      tip("There is already a burg in this cell. Please select a free cell", false, "error");
      return;
    }

    Burgs.add(point);

    if (event.shiftKey === false) {
      exitAddBurgMode();
      burgsOverviewAddLines();
    }
  }

  function exitAddBurgMode(): void {
    customization = 0;
    restoreDefaultEvents?.();
    clearMainTip();
    const addBurgToolEl = document.getElementById("addBurgTool");
    const addNewBurgEl = document.getElementById("addNewBurg");
    if (addBurgToolEl?.classList.contains("pressed")) addBurgToolEl.classList.remove("pressed");
    if (addNewBurgEl?.classList.contains("pressed")) addNewBurgEl.classList.remove("pressed");
  }

  function showBurgsChart(): void {
    interface ChartDatum {
      id: number;
      color?: string;
      name?: string;
      i?: number | null;
      state?: number | null;
      culture?: number | null;
      province?: number | null;
      parent?: number | null;
      population?: number;
      x?: number;
      y?: number;
      capital?: number | boolean;
    }

    const states: ChartDatum[] = pack.states.map(s => ({
      id: s.i,
      state: s.i ? 0 : null,
      color: s.color ?? "#ccc",
      name: s.fullName ?? s.name
    }));

    const burgs: ChartDatum[] = pack.burgs
      .filter(b => b.i && !b.removed)
      .map(b => {
        const province = pack.cells.province![b.cell];
        const parent = province ? province + states.length - 1 : b.state;
        return {
          id: b.i! + states.length - 1,
          i: b.i,
          state: b.state,
          culture: b.culture,
          province,
          parent,
          name: b.name,
          population: b.population,
          capital: b.capital,
          x: b.x,
          y: b.y,
          color: "#ccc"
        };
      });
    const data: ChartDatum[] = [...states, ...burgs];
    if (data.length < 2) {
      tip("No burgs to show", false, "error");
      return;
    }

    const root = d3
      .stratify<ChartDatum>()
      .id(d => String(d.id))
      .parentId(d => (d.state != null ? String(d.state) : null))(data)
      .sum(d => d.population ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const width = 150 + 200 * +uiSize.value;
    const height = 150 + 200 * +uiSize.value;
    const margin = { top: 0, right: -50, bottom: -10, left: -50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const treeLayout = d3.pack<ChartDatum>().size([w, h]).padding(3);

    alertMessage.innerHTML = /* html */ `<select id="burgsTreeType" style="display:block; margin-left:13px; font-size:11px">
      <option value="states" selected>Group by state</option>
      <option value="cultures">Group by culture</option>
      <option value="parent">Group by province and state</option>
      <option value="provinces">Group by province</option>
    </select>`;
    alertMessage.innerHTML += `<div id='burgsInfo' class='chartInfo'>&#8205;</div>`;
    const svg = d3
      .select("#alertMessage")
      .insert("svg", "#burgsInfo")
      .attr("id", "burgsTree")
      .attr("width", width)
      .attr("height", height - 10)
      .attr("stroke-width", 2);
    const graph = svg.append("g").attr("transform", `translate(-50, -10)`);
    document.getElementById("burgsTreeType")!.addEventListener("change", updateChart);

    treeLayout(root);

    type PackNode = d3.HierarchyCircularNode<ChartDatum>;
    const node = graph
      .selectAll<SVGCircleElement, PackNode>("circle")
      .data(root.leaves() as PackNode[])
      .join("circle")
      .attr("data-id", d => d.data.i ?? "")
      .attr("r", d => d.r)
      .attr("fill", d => d.parent?.data.color ?? "#ccc")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .on("mouseenter", (event: MouseEvent, d) => showInfo(event, d))
      .on("mouseleave", (ev: MouseEvent) => hideInfo(ev))
      .on("click", (_event, d) => zoomTo(d.data.x ?? 0, d.data.y ?? 0, 8, 2000));

    function showInfo(ev: MouseEvent, d: PackNode): void {
      d3.select(ev.target as Element)
        .transition()
        .duration(1500)
        .attr("stroke", "#c13119");
      const name = d.data.name;
      const parent = d.parent?.data.name;
      const population = si((d.value ?? 0) * populationRate * urbanization);

      (document.getElementById("burgsInfo") as HTMLElement).innerHTML =
        /* html */ `${name}. ${parent}. Population: ${population}`;
      burgHighlightOn(ev as MouseEvent);
      tip("Click to zoom into view");
    }

    function hideInfo(ev: MouseEvent): void {
      burgHighlightOff();
      const burgsInfoEl = document.getElementById("burgsInfo");
      if (!burgsInfoEl) return;
      burgsInfoEl.innerHTML = "&#8205;";
      d3.select(ev.target as Element)
        .transition()
        .attr("stroke", null);
      tip("");
    }

    function updateChart(this: HTMLSelectElement): void {
      const getStatesData = () =>
        pack.states.map(s => {
          const c = s.color ? s.color : "#ccc";
          const name = s.fullName ? s.fullName : s.name;
          return { id: s.i, state: s.i ? 0 : null, color: c, name };
        });

      const getCulturesData = () =>
        pack.cultures.map(c => {
          const col = c.color ? c.color : "#ccc";
          return { id: c.i, culture: c.i ? 0 : null, color: col, name: c.name };
        });

      const getParentData = () => {
        const statesData = pack.states.map(s => {
          const c = s.color ? s.color : "#ccc";
          const name = s.fullName ? s.fullName : s.name;
          return { id: s.i, parent: s.i ? 0 : null, color: c, name };
        });
        const provinces = pack
          .provinces!.filter(p => p.i && !p.removed)
          .map(p => {
            return { id: p.i + statesData.length - 1, parent: p.state, color: p.color, name: p.fullName };
          });
        return [...statesData, ...provinces] as ChartDatum[];
      };

      const getProvincesData = (): ChartDatum[] =>
        pack.provinces!.map(p => ({
          id: p.i ? p.i : 0,
          province: p.i ? 0 : null,
          color: p.color ?? "#ccc",
          name: p.fullName ?? p.name
        }));

      const value = (d: ChartDatum): number | null | undefined => {
        if (this.value === "states") return d.state;
        if (this.value === "cultures") return d.culture;
        if (this.value === "parent") return d.parent;
        if (this.value === "provinces") return d.province;
      };

      const mapping: Record<string, () => ChartDatum[]> = {
        states: getStatesData,
        cultures: getCulturesData,
        parent: getParentData,
        provinces: getProvincesData
      };

      const base = mapping[this.value]();
      burgs.forEach(b => {
        b.id = b.i! + base.length - 1;
      });

      const chartData: ChartDatum[] = [...base, ...burgs];

      const newRoot = d3
        .stratify<ChartDatum>()
        .id(d => String(d.id))
        .parentId(d => (value(d) != null ? String(value(d)) : null))(chartData)
        .sum(d => d.population ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      node
        .data(treeLayout(newRoot).leaves() as PackNode[])
        .transition()
        .duration(2000)
        .attr("data-id", d => d.data.i ?? "")
        .attr("fill", d => d.parent?.data.color ?? "#ccc")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", d => d.r);
    }

    $("#alert").dialog({
      title: "Burgs bubble chart",
      width: fitContent(),
      position: { my: "left bottom", at: "left+10 bottom-10", of: "svg" },
      buttons: {},
      close: () => (alertMessage.innerHTML = "")
    });
  }

  function downloadBurgsData(): void {
    let data = `Id,Burg,Province,Province Full Name,State,State Full Name,Culture,Religion,Group,Population,X,Y,Latitude,Longitude,Elevation (${heightUnit.value}),Temperature,Temperature likeness,Capital,Port,Citadel,Walls,Plaza,Temple,Shanty Town,Emblem,Preview link\n`;
    const valid = pack.burgs.filter(b => b.i && !b.removed);

    valid.forEach(b => {
      data += `${b.i},`;
      data += `${b.name},`;
      const province = pack.cells.province![b.cell];
      data += province ? `${pack.provinces![province].name},` : ",";
      data += province ? `${pack.provinces![province].fullName},` : ",";
      data += `${pack.states[b.state!].name},`;
      data += `${pack.states[b.state!].fullName},`;
      data += `${pack.cultures[b.culture!].name},`;
      data += `${pack.religions![pack.cells.religion![b.cell]].name},`;
      data += `${b.group!},`;
      data += `${rn(b.population! * populationRate * urbanization)},`;

      data += `${b.x},`;
      data += `${b.y},`;
      data += `${getLatitude(b.y, 2)},`;
      data += `${getLongitude(b.x, 2)},`;
      data += `${parseInt(getHeight(pack.cells.h[b.cell]), 10)},`;
      const temperature = grid.cells.temp![pack.cells.g![b.cell]];
      data += `${convertTemperature(temperature)},`;
      data += `${getTemperatureLikeness(temperature)},`;

      data += b.capital ? "capital," : ",";
      data += b.port ? "port," : ",";
      data += b.citadel ? "citadel," : ",";
      data += b.walls ? "walls," : ",";
      data += b.plaza ? "plaza," : ",";
      data += b.temple ? "temple," : ",";
      data += b.shanty ? "shanty town," : ",";
      data += b.coa ? `${JSON.stringify(b.coa).replace(/"/g, "").replace(/,/g, ";")},` : ",";
      data += Burgs.getPreview(b).link;

      data += "\n";
    });

    const name = `${getFileName("Burgs")}.csv`;
    downloadFile(data, name);
  }

  function renameBurgsInBulk(): void {
    alertMessage.innerHTML = /* html */ `Download burgs list as a text file, make changes and re-upload the file. Make sure the file is a plain text document with each
    name on its own line (the dilimiter is CRLF). If you do not want to change the name, just leave it as is`;

    $("#alert").dialog({
      title: "Burgs bulk renaming",
      width: "22em",
      position: { my: "center", at: "center", of: "svg" },
      buttons: {
        Download: () => {
          const data = pack.burgs
            .filter(b => b.i && !b.removed)
            .map(b => b.name)
            .join("\r\n");
          const name = `${getFileName("Burg names")}.txt`;
          downloadFile(data, name);
        },
        Upload: () => (document.getElementById("burgsListToLoad") as HTMLInputElement).click(),
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function importBurgNames(dataLoaded: string): void {
    if (!dataLoaded) {
      tip("Cannot load the file, please check the format", false, "error");
      return;
    }
    const data = dataLoaded
      .replace(/\r\n|\r/g, "\n")
      .split("\n")
      .filter(Boolean);
    if (!data.length) {
      tip("Cannot parse the list, please check the file format", false, "error");
      return;
    }

    const change: { id: number; name: string }[] = [];
    let message = `Burgs to be renamed as below:`;
    message += `<table class="overflow-table"><tr><th>Id</th><th>Current name</th><th>New Name</th></tr>`;

    const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
    for (let i = 0; i < data.length && i <= validBurgs.length; i++) {
      const v = data[i];
      if (!v || !validBurgs[i] || v === validBurgs[i].name) continue;
      change.push({ id: validBurgs[i].i!, name: v });
      message += `<tr><td style="width:20%">${validBurgs[i].i}</td><td style="width:40%">${validBurgs[i].name}</td><td style="width:40%">${v}</td></tr>`;
    }
    message += `</tr></table>`;

    if (!change.length) message = "No changes found in the file. Please change some names to get a result";
    alertMessage.innerHTML = message;

    const onConfirm = () => {
      for (let i = 0; i < change.length; i++) {
        const id = change[i].id;
        pack.burgs[id].name = change[i].name;
        burgLabels.select(`[data-id='${id}']`).text(change[i].name);
      }
      burgsOverviewAddLines();
    };

    confirmationDialog({
      title: "Burgs bulk renaming",
      message,
      confirm: "Rename",
      onConfirm
    });
  }

  function triggerAllBurgsRemove(): void {
    const number = pack.burgs.filter(b => b.i && !b.removed && !b.capital && !b.lock).length;
    confirmationDialog({
      title: `Remove ${number} burgs`,
      message: `
        Are you sure you want to remove all <i>unlocked</i> burgs except for capitals?
        <br><i>To remove a capital you have to remove its state first</i>`,
      confirm: "Remove",
      onConfirm: () => {
        pack.burgs
          .filter(b => b.i && !(b.capital || b.lock))
          .forEach(b => {
            Burgs.remove(b.i!);
          });
        burgsOverviewAddLines();
      }
    });
  }

  function toggleLockAll(): void {
    const activeBurgs = pack.burgs.filter(b => b.i && !b.removed);
    const allLocked = activeBurgs.every(burg => burg.lock);

    activeBurgs.forEach(burg => {
      burg.lock = !allLocked;
    });

    burgsOverviewAddLines();
    ensureEl("burgsLockAll").className = allLocked ? "icon-lock" : "icon-lock-open";
  }

  function updateLockAllIcon(): void {
    const allLocked = pack.burgs.every(({ lock, i, removed }) => lock || !i || removed);
    ensureEl("burgsLockAll").className = allLocked ? "icon-lock-open" : "icon-lock";
  }
}

declare global {
  interface Window {
    overviewBurgs: (settings?: { stateId?: number | null; cultureId?: number | null }) => void;
  }
}
