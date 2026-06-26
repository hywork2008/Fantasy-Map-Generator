import * as d3 from "d3";
import { pointer } from "d3";
import { zoomTo } from "../actions";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { Names } from "../generators/names-generator";
import { drawBurgIcon, drawBurgLabel, drawRoute } from "../renderers";
import { useBurgsOverviewState } from "../store/burgsOverviewState";
import { useOptionsState } from "../store/optionsState";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { convertTemperature, findCell, getLatitude, getLongitude, rn, si } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { confirmationDialog, downloadFile, getFileName } from "../utils/editorHelpers";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, getHeight, tip } from "../utils/uiHelpers";
import { getTemperatureLikeness } from "./burg-editor";
import { interactionManager } from "./interactionManager";
import { toggleBurgIcons, toggleLabels } from "./layers";

export function overviewBurgs(settings: { stateId?: number | null; cultureId?: number | null } = {}): void {
  if (viewContext.customization) return;
  closeDialogs("#burgsOverview, .stable");
  if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  useBurgsOverviewState.getState().open(settings.stateId ?? null, settings.cultureId ?? null);
  useBurgsOverviewState.getState().refresh();
  openDialog("burgsOverview");
}

export function burgHighlightOn(burgId: number): void {
  const label = viewContext.burgLabels.select(`[data-id='${burgId}']`);
  if (label.size()) label.classed("drag", true);
}

export function burgHighlightOff(): void {
  viewContext.burgLabels.selectAll("text.drag").classed("drag", false);
}

export function zoomIntoBurg(burgId: number): void {
  const label = document.querySelector(`#burgLabels [data-id='${burgId}']`) as SVGTextElement | null;
  if (!label) return;
  const x = +label.getAttribute("x")!;
  const y = +label.getAttribute("y")!;
  zoomTo(x, y, 8, 2000);
}

export function startAddBurgMode(onDone: () => void): void {
  viewContext.customization = 3;
  viewContext.viewbox.style("cursor", "crosshair");
  tip("Click on the map to create a new burg. Hold Shift to add multiple", true, "warn");
  interactionManager.setClickHandler(function (this: SVGElement, event: MouseEvent) {
    const point = pointer(event, this) as [number, number];
    const cell = findCell(point[0], point[1]);

    if (worldContext.pack.cells.h[cell] < 20) {
      tip("You cannot place state into the water. Please click on a land cell", false, "error");
      return;
    }
    if (worldContext.pack.cells.burg![cell]) {
      tip("There is already a burg in this cell. Please select a free cell", false, "error");
      return;
    }

    const { burgId, newRoute } = Burgs.add(point);
    const burg = worldContext.pack.burgs[burgId];
    drawBurgIcon(worldContext, viewContext, appServices, burg);
    drawBurgLabel(worldContext, viewContext, appServices, burg);
    if (newRoute && layerIsOn("toggleRoutes")) drawRoute(worldContext, viewContext, appServices, newRoute);

    if (event.shiftKey === false) {
      stopAddBurgMode();
      onDone();
    }
  });
}

export function stopAddBurgMode(): void {
  viewContext.customization = 0;
  EditorBus.restoreDefaultEvents();
  clearMainTip();
  document.getElementById("addBurgTool")?.classList.remove("pressed");
}

export function regenerateBurgNames(refresh: () => void): void {
  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed && !b.lock);
  for (const burg of validBurgs) {
    const name = Names.getCulture(burg.culture!);
    burg.name = name;
    viewContext.burgLabels.select(`[data-id='${burg.i}']`).text(name);
  }
  refresh();
}

export function downloadBurgsData(): void {
  const heightUnitEl = document.getElementById("heightUnit") as HTMLSelectElement | null;
  const heightUnitVal = heightUnitEl?.value ?? "m";

  let data = `Id,Burg,Province,Province Full Name,State,State Full Name,Culture,Religion,Group,Population,X,Y,Latitude,Longitude,Elevation (${heightUnitVal}),Temperature,Temperature likeness,Capital,Port,Citadel,Walls,Plaza,Temple,Shanty Town,Emblem,Preview link\n`;
  const valid = worldContext.pack.burgs.filter(b => b.i && !b.removed);

  valid.forEach(b => {
    data += `${b.i},`;
    data += `${b.name},`;
    const province = worldContext.pack.cells.province![b.cell];
    data += province ? `${worldContext.pack.provinces![province].name},` : ",";
    data += province ? `${worldContext.pack.provinces![province].fullName},` : ",";
    data += `${worldContext.pack.states[b.state!].name},`;
    data += `${worldContext.pack.states[b.state!].fullName},`;
    data += `${worldContext.pack.cultures[b.culture!].name},`;
    data += `${worldContext.pack.religions![worldContext.pack.cells.religion![b.cell]].name},`;
    data += `${b.group!},`;
    data += `${rn(b.population! * worldContext.populationRate * worldContext.urbanization)},`;
    data += `${b.x},`;
    data += `${b.y},`;
    data += `${getLatitude(b.y, worldContext.mapCoordinates, worldContext.graphHeight, 2)},`;
    data += `${getLongitude(b.x, worldContext.mapCoordinates, worldContext.graphWidth, 2)},`;
    data += `${parseInt(getHeight(worldContext.pack.cells.h[b.cell]), 10)},`;
    const temperature = worldContext.grid.cells.temp![worldContext.pack.cells.g![b.cell]];
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

export function renameBurgsInBulk(): void {
  openRichDialog({
    title: "Burgs bulk renaming",
    content: `Download burgs list as a text file, make changes and re-upload the file. Make sure the file is a plain text document with each name on its own line (the dilimiter is CRLF). If you do not want to change the name, just leave it as is`,
    buttons: [
      {
        label: "Download",
        keepOpen: true,
        onClick: () => {
          const data = worldContext.pack.burgs
            .filter(b => b.i && !b.removed)
            .map(b => b.name)
            .join("\r\n");
          const name = `${getFileName("Burg names")}.txt`;
          downloadFile(data, name);
        }
      },
      {
        label: "Upload",
        keepOpen: true,
        onClick: () => (document.getElementById("burgsListToLoad") as HTMLInputElement | null)?.click()
      },
      { label: "Cancel", onClick: () => {} }
    ]
  });
}

export function importBurgNames(dataLoaded: string, refresh: () => void): void {
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

  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed);
  for (let i = 0; i < data.length && i <= validBurgs.length; i++) {
    const v = data[i];
    if (!v || !validBurgs[i] || v === validBurgs[i].name) continue;
    change.push({ id: validBurgs[i].i!, name: v });
    message += `<tr><td style="width:20%">${validBurgs[i].i}</td><td style="width:40%">${validBurgs[i].name}</td><td style="width:40%">${v}</td></tr>`;
  }
  message += `</tr></table>`;

  if (!change.length) message = "No changes found in the file. Please change some names to get a result";

  confirmationDialog({
    title: "Burgs bulk renaming",
    message,
    confirm: "Rename",
    onConfirm: () => {
      for (const { id, name } of change) {
        worldContext.pack.burgs[id].name = name;
        viewContext.burgLabels.select(`[data-id='${id}']`).text(name);
      }
      refresh();
    }
  });
}

export function showBurgsChart(): void {
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

  const states: ChartDatum[] = worldContext.pack.states.map(s => ({
    id: s.i,
    state: s.i ? 0 : null,
    color: s.color ?? "#ccc",
    name: s.fullName ?? s.name
  }));

  const burgs: ChartDatum[] = worldContext.pack.burgs
    .filter(b => b.i && !b.removed)
    .map(b => {
      const province = worldContext.pack.cells.province![b.cell];
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

  const width = 150 + 200 * useOptionsState.getState().uiSize;
  const height = 150 + 200 * useOptionsState.getState().uiSize;
  const margin = { top: 0, right: -50, bottom: -10, left: -50 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const treeLayout = d3.pack<ChartDatum>().size([w, h]).padding(3);

  const content = /* html */ `<select id="burgsTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="states" selected>Group by state</option>
    <option value="cultures">Group by culture</option>
    <option value="parent">Group by province and state</option>
    <option value="provinces">Group by province</option>
  </select>
  <div id='burgsInfo' class='chartInfo'>&#8205;</div>`;

  openRichDialog({
    title: "Burgs bubble chart",
    content,
    onOpen: container => {
      const svg = d3
        .select(container)
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

      function updateChart(this: HTMLSelectElement): void {
        const getStatesData = () =>
          worldContext.pack.states.map(s => ({
            id: s.i,
            state: s.i ? 0 : null,
            color: s.color ?? "#ccc",
            name: s.fullName ?? s.name
          }));
        const getCulturesData = () =>
          worldContext.pack.cultures.map(c => ({
            id: c.i,
            culture: c.i ? 0 : null,
            color: c.color ?? "#ccc",
            name: c.name
          }));
        const getParentData = () => {
          const statesData = worldContext.pack.states.map(s => ({
            id: s.i,
            parent: s.i ? 0 : null,
            color: s.color ?? "#ccc",
            name: s.fullName ?? s.name
          }));
          const provinces = worldContext.pack
            .provinces!.filter(p => p.i && !p.removed)
            .map(p => ({
              id: p.i + statesData.length - 1,
              parent: p.state,
              color: p.color,
              name: p.fullName
            }));
          return [...statesData, ...provinces] as ChartDatum[];
        };
        const getProvincesData = (): ChartDatum[] =>
          worldContext.pack.provinces!.map(p => ({
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

      function showInfo(ev: MouseEvent, d: PackNode): void {
        const el = ev.target as HTMLElement;
        el.style.transition = "stroke 1.5s";
        el.setAttribute("stroke", "#c13119");
        const name = d.data.name;
        const parent = d.parent?.data.name;
        const population = si((d.value ?? 0) * worldContext.populationRate * worldContext.urbanization);
        (document.getElementById("burgsInfo") as HTMLElement).textContent =
          `${name}. ${parent}. Population: ${population}`;
        if (d.data.i != null) burgHighlightOn(d.data.i);
        tip("Click to zoom into view");
      }

      function hideInfo(ev: MouseEvent): void {
        burgHighlightOff();
        const burgsInfoEl = document.getElementById("burgsInfo");
        if (burgsInfoEl) burgsInfoEl.textContent = "‍";
        const el = ev.target as HTMLElement;
        el.style.transition = "";
        el.removeAttribute("stroke");
        tip("");
      }
    }
  });
}
