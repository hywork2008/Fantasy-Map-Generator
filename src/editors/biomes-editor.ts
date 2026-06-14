import { drag, easeSinIn, pointer, type Selection, sum, transition } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Biomes } from "../modules/biomes";
import { drawBiomes, drawReliefIcons } from "../renderers";
import { findCell, getRandomColor, isLand, openURL, rn, si } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

export function editBiomes(): void {
  if (customization) return;
  closeDialogs("#biomesEditor, .stable");
  if (!layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleReligions")) toggleReligions();
  if (layerIsOn("toggleProvinces")) toggleProvinces();

  const body = document.getElementById("biomesBody")!;
  const animate = transition().duration(2000).ease(easeSinIn);
  refreshBiomesEditor();

  if (modules.editBiomes) return;
  modules.editBiomes = true;

  $("#biomesEditor").dialog({
    title: "Biomes Editor",
    resizable: false,
    width: fitContent(),
    close: closeBiomesEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg" }
  });

  // add listeners
  document.getElementById("biomesEditorRefresh")!.addEventListener("click", refreshBiomesEditor);
  document.getElementById("biomesEditStyle")!.addEventListener("click", () => editStyle("biomes"));
  document.getElementById("biomesLegend")!.addEventListener("click", toggleLegend);
  document.getElementById("biomesPercentage")!.addEventListener("click", togglePercentageMode);
  document.getElementById("biomesManually")!.addEventListener("click", enterBiomesCustomizationMode);
  document.getElementById("biomesManuallyApply")!.addEventListener("click", applyBiomesChange);
  document.getElementById("biomesManuallyCancel")!.addEventListener("click", () => exitBiomesCustomizationMode());
  document.getElementById("biomesRestore")!.addEventListener("click", restoreInitialBiomes);
  document.getElementById("biomesAdd")!.addEventListener("click", addCustomBiome);
  document.getElementById("biomesRegenerateReliefIcons")!.addEventListener("click", regenerateIcons);
  document.getElementById("biomesExport")!.addEventListener("click", downloadBiomesData);

  body.addEventListener("click", ev => {
    const el = ev.target as HTMLElement;
    const cl = el.classList;
    if (el.tagName === "FILL-BOX") biomeChangeColor(el);
    else if (cl.contains("icon-info-circled")) openWiki(el);
    else if (cl.contains("icon-trash-empty")) removeCustomBiome(el);
    if (customization === 6) selectBiomeOnLineClick(el);
  });

  body.addEventListener("change", ev => {
    const el = ev.target as HTMLInputElement;
    const cl = el.classList;
    if (cl.contains("biomeName")) biomeChangeName(el);
    else if (cl.contains("biomeHabitability")) biomeChangeHabitability(el);
  });

  function refreshBiomesEditor(): void {
    biomesCollectStatistics();
    biomesEditorAddLines();
  }

  function biomesCollectStatistics(): void {
    const cells = pack.cells;
    const array = new Uint8Array(biomesData.i.length);
    biomesData.cells = Array.from(array);
    biomesData.area = Array.from(array);
    biomesData.rural = Array.from(array);
    biomesData.urban = Array.from(array);

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const b = cells.biome[i];
      biomesData.cells![b] += 1;
      biomesData.area![b] += cells.area[i];
      biomesData.rural![b] += cells.pop[i];
      if (cells.burg[i]) biomesData.urban![b] += pack.burgs[cells.burg[i]]?.population ?? 0;
    }
  }

  function biomesEditorAddLines(): void {
    const unit = ` ${getAreaUnit()}`;
    const b = biomesData;
    let lines = "",
      totalArea = 0,
      totalPopulation = 0;

    for (const i of b.i) {
      if (!i || biomesData.name[i] === "removed") continue;
      const area = getArea(b.area![i]);
      const rural = b.rural![i] * populationRate;
      const urban = b.urban![i] * populationRate * urbanization;
      const population = rn(rural + urban);
      const populationTip = `Total population: ${si(population)}; Rural population: ${si(
        rural
      )}; Urban population: ${si(urban)}`;
      totalArea += area;
      totalPopulation += population;

      lines += /* html */ `
        <div
          class="states biomes"
          data-id="${i}"
          data-name="${b.name[i]}"
          data-habitability="${b.habitability[i]}"
          data-cells=${b.cells![i]}
          data-area=${area}
          data-population=${population}
          data-color=${b.color[i]}
        >
          <fill-box fill="${b.color[i]}"></fill-box>
          <input data-tip="Biome name. Click and type to change" class="biomeName" value="${
            b.name[i]
          }" autocorrect="off" spellcheck="false" />
          <span data-tip="Biome habitability percent" class="hide">%</span>
          <input
            data-tip="Biome habitability percent. Click and set new value to change"
            type="number"
            min="0"
            max="9999"
            class="biomeHabitability hide"
            value=${b.habitability[i]}
          />
          <span data-tip="Cells count" class="icon-check-empty hide"></span>
          <div data-tip="Cells count" class="biomeCells hide">${b.cells![i]}</div>
          <span data-tip="Biome area" style="padding-right: 4px" class="icon-map-o hide"></span>
          <div data-tip="Biome area" class="biomeArea hide">${si(area) + unit}</div>
          <span data-tip="${populationTip}" class="icon-male hide"></span>
          <div data-tip="${populationTip}" class="biomePopulation hide">${si(population)}</div>
          <span data-tip="Open Wikipedia article about the biome" class="icon-info-circled pointer hide"></span>
          ${
            i > 12 && !b.cells![i]
              ? '<span data-tip="Remove the custom biome" class="icon-trash-empty hide"></span>'
              : ""
          }
        </div>
      `;
    }
    body.innerHTML = lines;

    const totalMapArea = getArea(sum(pack.cells.area));
    (document.getElementById("biomesFooterBiomes") as HTMLElement).innerHTML = String(
      body.querySelectorAll(":scope > div").length
    );
    (document.getElementById("biomesFooterCells") as HTMLElement).innerHTML = String(
      pack.cells.h.filter(h => h >= 20).length
    );
    const biomesFooterArea = document.getElementById("biomesFooterArea") as HTMLElement;
    const biomesFooterPopulation = document.getElementById("biomesFooterPopulation") as HTMLElement;
    biomesFooterArea.innerHTML = si(totalArea) + unit;
    biomesFooterPopulation.innerHTML = si(totalPopulation);
    biomesFooterArea.dataset.area = String(totalArea);
    biomesFooterArea.dataset.mapArea = String(totalMapArea);
    biomesFooterPopulation.dataset.population = String(totalPopulation);

    body.querySelectorAll("div.biomes").forEach(el => {
      el.addEventListener("mouseenter", ev => biomeHighlightOn(ev as MouseEvent));
    });
    body.querySelectorAll("div.biomes").forEach(el => {
      el.addEventListener("mouseleave", ev => biomeHighlightOff(ev as MouseEvent));
    });

    if ((body as HTMLElement & { dataset: DOMStringMap }).dataset.type === "percentage") {
      (body as HTMLElement & { dataset: DOMStringMap }).dataset.type = "absolute";
      togglePercentageMode();
    }
    applySorting(document.getElementById("biomesHeader") as HTMLElement);
    $("#biomesEditor").dialog({ width: fitContent() });
  }

  function biomeHighlightOn(event: MouseEvent): void {
    if (customization === 6) return;
    const biome = +(event.target as HTMLElement).dataset.id!;
    (biomes as Selection<SVGGElement, unknown, null, undefined>)
      .select(`#biome${biome}`)
      .raise()
      .transition(animate as import("d3").Transition<import("d3").BaseType, unknown, null, undefined>)
      .attr("stroke-width", 2)
      .attr("stroke", "#cd4c11");
  }

  function biomeHighlightOff(event: MouseEvent): void {
    if (customization === 6) return;
    const biome = +(event.target as HTMLElement).dataset.id!;
    const color = biomesData.color[biome];
    (biomes as Selection<SVGGElement, unknown, null, undefined>)
      .select(`#biome${biome}`)
      .transition()
      .attr("stroke-width", 0.7)
      .attr("stroke", color);
  }

  function biomeChangeColor(el: HTMLElement): void {
    const currentFill = el.getAttribute("fill")!;
    const biome = +(el.parentNode as HTMLElement).dataset.id!;

    const callback = (newFill: string) => {
      (el as Element & { fill?: string }).fill = newFill;
      biomesData.color[biome] = newFill;
      (biomes as Selection<SVGGElement, unknown, null, undefined>)
        .select(`#biome${biome}`)
        .attr("fill", newFill)
        .attr("stroke", newFill);
    };

    openPicker(currentFill, callback);
  }

  function biomeChangeName(el: HTMLInputElement): void {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    (el.parentNode as HTMLElement).dataset.name = el.value;
    biomesData.name[biome] = el.value;
  }

  function biomeChangeHabitability(el: HTMLInputElement): void {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    const failed = Number.isNaN(+el.value) || +el.value < 0 || +el.value > 9999;
    if (failed) {
      el.value = String(biomesData.habitability[biome]);
      tip("Please provide a valid number in range 0-9999", false, "error");
      return;
    }
    biomesData.habitability[biome] = +el.value;
    (el.parentNode as HTMLElement).dataset.habitability = el.value;
    recalculatePopulation();
    refreshBiomesEditor();
  }

  function openWiki(el: HTMLElement): void {
    const biomeName = (el.parentNode as HTMLElement).dataset.name;
    if (biomeName === "Custom" || !biomeName) {
      tip("Please fill in the biome name", false, "error");
      return;
    }

    const wikiBase = "https://en.wikipedia.org/wiki/";
    const pages: Record<string, string> = {
      "Hot desert": "Desert_climate#Hot_desert_climates",
      "Cold desert": "Desert_climate#Cold_desert_climates",
      Savanna: "Tropical_and_subtropical_grasslands,_savannas,_and_shrublands",
      Grassland: "Temperate_grasslands,_savannas,_and_shrublands",
      "Tropical seasonal forest": "Seasonal_tropical_forest",
      "Temperate deciduous forest": "Temperate_deciduous_forest",
      "Tropical rainforest": "Tropical_rainforest",
      "Temperate rainforest": "Temperate_rainforest",
      Taiga: "Taiga",
      Tundra: "Tundra",
      Glacier: "Glacier",
      Wetland: "Wetland"
    };
    const customBiomeLink = `https://en.wikipedia.org/w/index.php?search=${biomeName}`;
    const link = pages[biomeName] ? wikiBase + pages[biomeName] : customBiomeLink;
    openURL(link);
  }

  function toggleLegend(): void {
    if ((legend as Selection<SVGGElement, unknown, null, undefined>).selectAll("*").size()) {
      clearLegend();
      return;
    }
    const d = biomesData;
    const data = Array.from(d.i)
      .filter(i => d.cells![i])
      .sort((a, b) => d.area![b] - d.area![a])
      .map(i => [i, d.color[i], d.name[i]] as [number, string, string]);
    drawLegend("Biomes", data);
  }

  function togglePercentageMode(): void {
    const biomesFooterCells = document.getElementById("biomesFooterCells") as HTMLElement;
    const biomesFooterArea = document.getElementById("biomesFooterArea") as HTMLElement;
    const biomesFooterPopulation = document.getElementById("biomesFooterPopulation") as HTMLElement;

    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalCells = +biomesFooterCells.innerHTML;
      const totalArea = +biomesFooterArea.dataset.area!;
      const totalMapArea = +biomesFooterArea.dataset.mapArea!;
      const totalPopulation = +biomesFooterPopulation.dataset.population!;

      body.querySelectorAll(":scope > div").forEach(el => {
        const div = el as HTMLElement;
        (div.querySelector(".biomeCells") as HTMLElement).innerHTML =
          `${rn((+div.dataset.cells! / totalCells) * 100)}%`;
        (div.querySelector(".biomeArea") as HTMLElement).innerHTML = `${rn((+div.dataset.area! / totalArea) * 100)}%`;
        (div.querySelector(".biomePopulation") as HTMLElement).innerHTML =
          `${rn((+div.dataset.population! / totalPopulation) * 100)}%`;
      });

      biomesFooterArea.innerHTML = `${rn((totalArea / totalMapArea) * 100)}%`;
    } else {
      body.dataset.type = "absolute";
      biomesEditorAddLines();
    }
  }

  function addCustomBiome(): void {
    const b = biomesData;
    const i = biomesData.i.length;
    if (i > 254) {
      tip("Maximum number of biomes reached (255), data cleansing is required", false, "error");
      return;
    }

    b.i.push(i);
    b.color.push(getRandomColor());
    b.habitability.push(50);
    b.name.push("Custom");
    b.iconsDensity.push(0);
    b.icons.push([]);
    b.cost.push(50);

    b.rural!.push(0);
    b.urban!.push(0);
    b.cells!.push(0);
    b.area!.push(0);

    const unit = getAreaUnit();
    const line = `<div class="states biomes" data-id="${i}" data-name="${b.name[i]}" data-habitability=${b.habitability[i]} data-cells=0 data-area=0 data-population=0 data-color=${b.color[i]}>
      <fill-box fill="${b.color[i]}"></fill-box>
      <input data-tip="Biome name. Click and type to change" class="biomeName" value="${b.name[i]}" autocorrect="off" spellcheck="false">
      <span data-tip="Biome habitability percent" class="hide">%</span>
      <input data-tip="Biome habitability percent. Click and set new value to change" type="number" min=0 max=9999 step=1 class="biomeHabitability hide" value=${b.habitability[i]}>
      <span data-tip="Cells count" class="icon-check-empty hide"></span>
      <div data-tip="Cells count" class="biomeCells hide">${b.cells![i]}</div>
      <span data-tip="Biome area" style="padding-right: 4px" class="icon-map-o hide"></span>
      <div data-tip="Biome area" class="biomeArea hide">0 ${unit}</div>
      <span data-tip="Total population: 0" class="icon-male hide"></span>
      <div data-tip="Total population: 0" class="biomePopulation hide">0</div>
      <span data-tip="Remove the custom biome" class="icon-trash-empty hide"></span>
    </div>`;

    body.insertAdjacentHTML("beforeend", line);
    (document.getElementById("biomesFooterBiomes") as HTMLElement).innerHTML = String(
      body.querySelectorAll(":scope > div").length
    );
    $("#biomesEditor").dialog({ width: fitContent() });
  }

  function removeCustomBiome(el: HTMLElement): void {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    (el.parentNode as HTMLElement).remove();
    biomesData.name[biome] = "removed";
    const footer = document.getElementById("biomesFooterBiomes") as HTMLElement;
    footer.innerHTML = String(+footer.innerHTML - 1);
  }

  function regenerateIcons(): void {
    drawReliefIcons(worldContext, viewContext, appServices);
    if (!layerIsOn("toggleRelief")) toggleRelief();
  }

  function downloadBiomesData(): void {
    const areaUnitEl = document.getElementById("areaUnit") as HTMLSelectElement;
    const distanceUnitEl = document.getElementById("distanceUnitInput") as HTMLInputElement;
    const unit = areaUnitEl.value === "square" ? `${distanceUnitEl.value}2` : areaUnitEl.value;
    let data = `Id,Biome,Color,Habitability,Cells,Area ${unit},Population\n`;

    body.querySelectorAll(":scope > div").forEach(el => {
      const div = el as HTMLElement;
      data += `${div.dataset.id},`;
      data += `${div.dataset.name},`;
      data += `${div.dataset.color},`;
      data += `${div.dataset.habitability}%,`;
      data += `${div.dataset.cells},`;
      data += `${div.dataset.area},`;
      data += `${div.dataset.population}\n`;
    });

    const name = `${getFileName("Biomes")}.csv`;
    downloadFile(data, name);
  }

  function enterBiomesCustomizationMode(): void {
    if (!layerIsOn("toggleBiomes")) toggleBiomes();
    customization = 6;
    (biomes as Selection<SVGGElement, unknown, null, undefined>).append("g").attr("id", "temp");

    document.querySelectorAll("#biomesBottom > button").forEach(el => {
      (el as HTMLElement).style.display = "none";
    });
    document.querySelectorAll("#biomesBottom > div").forEach(el => {
      (el as HTMLElement).style.display = "block";
    });
    body.querySelector("div.biomes")!.classList.add("selected");

    document
      .getElementById("biomesEditor")!
      .querySelectorAll(".hide")
      .forEach(el => {
        el.classList.add("hidden");
      });
    body.querySelectorAll("div > input, select, span, svg").forEach(e => {
      (e as HTMLElement).style.pointerEvents = "none";
    });
    (document.getElementById("biomesFooter") as HTMLElement).style.display = "none";
    $("#biomesEditor").dialog({ position: { my: "right top", at: "right-10 top+10", of: "svg" } });

    tip("Click on biome to select, drag the circle to change biome", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", selectBiomeOnMapClick)
      .call(drag<SVGElement, unknown>().on("drag", dragBiomeBrush))
      .on("touchmove mousemove", moveBiomeBrush);
  }

  function selectBiomeOnLineClick(line: HTMLElement): void {
    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
    line.classList.add("selected");
  }

  function selectBiomeOnMapClick(event: MouseEvent): void {
    const [px, py] = pointer(event);
    const i = findCell(px, py);
    if (pack.cells.h[i] < 20) {
      tip("You cannot reassign water via biomes. Please edit the Heightmap to change water", false, "error");
      return;
    }

    const assigned = (biomes as Selection<SVGGElement, unknown, null, undefined>)
      .select("#temp")
      .select(`polygon[data-cell='${i}']`);
    const biome = assigned.size() ? +assigned.attr("data-biome") : pack.cells.biome[i];

    body.querySelector("div.selected")!.classList.remove("selected");
    body.querySelector(`div[data-id='${biome}']`)!.classList.add("selected");
  }

  function dragBiomeBrush(this: SVGElement, event: import("d3").D3DragEvent<SVGElement, unknown, unknown>): void {
    if (!event.dx && !event.dy) return;
    const r = +(document.getElementById("biomesBrush") as HTMLInputElement).value;
    const [px, py] = pointer(event, this);
    moveCircle(px, py, r);
    const found = r > 5 ? findAll(px, py, r) : [findCell(px, py)];
    const selection = found.filter(isLand);
    if (selection) changeBiomeForSelection(selection);
  }

  function changeBiomeForSelection(selection: number[]): void {
    const temp = (biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp");
    const selected = body.querySelector("div.selected") as HTMLElement;

    const biomeNew = selected.dataset.id!;
    const color = biomesData.color[+biomeNew];

    selection.forEach(i => {
      const exists = temp.select(`polygon[data-cell='${i}']`);
      const biomeOld = exists.size() ? +exists.attr("data-biome") : pack.cells.biome[i];
      if (+biomeNew === biomeOld) return;

      if (exists.size()) exists.attr("data-biome", biomeNew).attr("fill", color).attr("stroke", color);
      else
        temp
          .append("polygon")
          .attr("data-cell", i)
          .attr("data-biome", biomeNew)
          .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
          .attr("fill", color)
          .attr("stroke", color);
    });
  }

  function moveBiomeBrush(event: MouseEvent): void {
    showMainTip();
    const [px, py] = pointer(event);
    const radius = +(document.getElementById("biomesBrush") as HTMLInputElement).value;
    moveCircle(px, py, radius);
  }

  function applyBiomesChange(): void {
    const changed = (biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp").selectAll("polygon");
    changed.each(function () {
      const el = this as SVGPolygonElement;
      const i = +el.dataset.cell!;
      const b = +el.dataset.biome!;
      pack.cells.biome[i] = b;
    });

    if (changed.size()) {
      drawBiomes(worldContext, viewContext, appServices);
      refreshBiomesEditor();
    }
    exitBiomesCustomizationMode();
  }

  function exitBiomesCustomizationMode(close?: string): void {
    customization = 0;
    (biomes as Selection<SVGGElement, unknown, null, undefined>).select("#temp").remove();
    removeCircle();

    document.querySelectorAll("#biomesBottom > button").forEach(el => {
      (el as HTMLElement).style.display = "inline-block";
    });
    document.querySelectorAll("#biomesBottom > div").forEach(el => {
      (el as HTMLElement).style.display = "none";
    });

    body.querySelectorAll("div > input, select, span, svg").forEach(e => {
      (e as HTMLElement).style.pointerEvents = "all";
    });
    document
      .getElementById("biomesEditor")!
      .querySelectorAll(".hide")
      .forEach(el => {
        el.classList.remove("hidden");
      });
    (document.getElementById("biomesFooter") as HTMLElement).style.display = "block";
    if (!close) $("#biomesEditor").dialog({ position: { my: "right top", at: "right-10 top+10", of: "svg" } });

    restoreDefaultEvents?.();
    clearMainTip();
    const selected = document.querySelector("#biomesBody > div.selected");
    if (selected) selected.classList.remove("selected");
  }

  function restoreInitialBiomes(): void {
    biomesData = Biomes.getDefault();
    Biomes.define(getWorldState());
    drawBiomes(worldContext, viewContext, appServices);
    recalculatePopulation();
    refreshBiomesEditor();
  }

  function closeBiomesEditor(): void {
    exitBiomesCustomizationMode("close");
  }
}

export function initBiomesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
