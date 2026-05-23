"use strict";

import { Biomes } from "@fmg/core/modules/biomes";
import { applySorting, getArea, getAreaUnit, fitContent } from "./editors";

declare let biomesData: any;
declare const areaUnit: HTMLSelectElement;

class BiomesEditor {
  public open() {
    if (customization) return;
    closeDialogs("#biomesEditor, .stable");
    if (!layerIsOn("toggleBiomes")) toggleBiomes();
    if (layerIsOn("toggleStates")) toggleStates();
    if (layerIsOn("toggleCultures")) toggleCultures();
    if (layerIsOn("toggleReligions")) toggleReligions();
    if (layerIsOn("toggleProvinces")) toggleProvinces();

    this.refreshBiomesEditor();

    if (modules.editBiomes) return;
    modules.editBiomes = true;

    $("#biomesEditor").dialog({
      title: "Biomes Editor",
      resizable: false,
      width: fitContent(),
      close: () => this.closeBiomesEditor(),
      position: {my: "right top", at: "right-10 top+10", of: "svg"}
    });

    document.getElementById("biomesEditorRefresh")!.addEventListener("click", () => this.refreshBiomesEditor());
    document.getElementById("biomesEditStyle")!.addEventListener("click", () => editStyle("biomes"));
    document.getElementById("biomesLegend")!.addEventListener("click", () => this.toggleLegend());
    document.getElementById("biomesPercentage")!.addEventListener("click", () => this.togglePercentageMode());
    document.getElementById("biomesManually")!.addEventListener("click", () => this.enterBiomesCustomizationMode());
    document.getElementById("biomesManuallyApply")!.addEventListener("click", () => this.applyBiomesChange());
    document.getElementById("biomesManuallyCancel")!.addEventListener("click", () => this.exitBiomesCustomizationMode());
    document.getElementById("biomesRestore")!.addEventListener("click", () => this.restoreInitialBiomes());
    document.getElementById("biomesAdd")!.addEventListener("click", () => this.addCustomBiome());
    document.getElementById("biomesRegenerateReliefIcons")!.addEventListener("click", () => this.regenerateIcons());
    document.getElementById("biomesExport")!.addEventListener("click", () => this.downloadBiomesData());

    const body = document.getElementById("biomesBody")!;
    body.addEventListener("click", (ev) => {
      const el = ev.target as HTMLElement;
      const cl = el.classList;
      if (el.tagName === "FILL-BOX") this.biomeChangeColor(el);
      else if (cl.contains("icon-info-circled")) this.openWiki(el);
      else if (cl.contains("icon-trash-empty")) this.removeCustomBiome(el);
      if (customization === 6) this.selectBiomeOnLineClick(el);
    });

    body.addEventListener("change", (ev) => {
      const el = ev.target as HTMLInputElement;
      const cl = el.classList;
      if (cl.contains("biomeName")) this.biomeChangeName(el);
      else if (cl.contains("biomeHabitability")) this.biomeChangeHabitability(el);
    });
  }

  private refreshBiomesEditor() {
    this.biomesCollectStatistics();
    this.biomesEditorAddLines();
  }

  private biomesCollectStatistics() {
    const cells = pack.cells;
    const array = new Uint8Array(biomesData.i.length);
    biomesData.cells = Array.from(array);
    biomesData.area = Array.from(array);
    biomesData.rural = Array.from(array);
    biomesData.urban = Array.from(array);

    for (const i of cells.i) {
      if (cells.h[i] < 20) continue;
      const b = cells.biome[i];
      biomesData.cells[b] += 1;
      biomesData.area[b] += cells.area[i];
      biomesData.rural[b] += cells.pop[i];
      if (cells.burg[i]) biomesData.urban[b] += pack.burgs[cells.burg[i]].population;
    }
  }

  private biomesEditorAddLines() {
    const body = document.getElementById("biomesBody")!;
    const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
    const unit = " " + getAreaUnit();
    const b = biomesData;
    let lines = "",
      totalArea = 0,
      totalPopulation = 0;

    for (const i of b.i) {
      if (!i || biomesData.name[i] === "removed") continue;
      const area = getArea(b.area[i]);
      const rural = b.rural[i] * populationRate;
      const urban = b.urban[i] * populationRate * urbanization;
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
          data-cells=${b.cells[i]}
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
          <div data-tip="Cells count" class="biomeCells hide">${b.cells[i]}</div>
          <span data-tip="Biome area" style="padding-right: 4px" class="icon-map-o hide"></span>
          <div data-tip="Biome area" class="biomeArea hide">${si(area) + unit}</div>
          <span data-tip="${populationTip}" class="icon-male hide"></span>
          <div data-tip="${populationTip}" class="biomePopulation hide">${si(population)}</div>
          <span data-tip="Open Wikipedia article about the biome" class="icon-info-circled pointer hide"></span>
          ${
            i > 12 && !b.cells[i]
              ? '<span data-tip="Remove the custom biome" class="icon-trash-empty hide"></span>'
              : ""
          }
        </div>
      `;
    }
    body.innerHTML = lines;

    const totalMapArea = getArea(d3.sum(pack.cells.area));
    biomesFooterBiomes.innerHTML = body.querySelectorAll(":scope > div").length;
    biomesFooterCells.innerHTML = pack.cells.h.filter((h: number) => h >= 20).length;
    biomesFooterArea.innerHTML = si(totalArea) + unit;
    biomesFooterPopulation.innerHTML = si(totalPopulation);
    biomesFooterArea.dataset.area = String(totalArea);
    biomesFooterArea.dataset.mapArea = String(totalMapArea);
    biomesFooterPopulation.dataset.population = String(totalPopulation);

    body.querySelectorAll("div.biomes").forEach(el =>
      el.addEventListener("mouseenter", ev => this.biomeHighlightOn(ev as MouseEvent, animate))
    );
    body.querySelectorAll("div.biomes").forEach(el =>
      el.addEventListener("mouseleave", ev => this.biomeHighlightOff(ev as MouseEvent, animate))
    );

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      this.togglePercentageMode();
    }
    applySorting(biomesHeader);
    $("#biomesEditor").dialog({width: fitContent()});
  }

  private biomeHighlightOn(event: MouseEvent, animate: any) {
    if (customization === 6) return;
    const biome = +(event.target as HTMLElement).dataset.id!;
    biomes
      .select("#biome" + biome)
      .raise()
      .transition(animate)
      .attr("stroke-width", 2)
      .attr("stroke", "#cd4c11");
  }

  private biomeHighlightOff(event: MouseEvent, animate: any) {
    if (customization === 6) return;
    const biome = +(event.target as HTMLElement).dataset.id!;
    const color = biomesData.color[biome];
    biomes
      .select("#biome" + biome)
      .transition()
      .attr("stroke-width", 0.7)
      .attr("stroke", color);
  }

  private biomeChangeColor(el: HTMLElement) {
    const currentFill = el.getAttribute("fill");
    const biome = +(el.parentNode as HTMLElement).dataset.id!;

    const callback = (newFill: string) => {
      (el as any).fill = newFill;
      biomesData.color[biome] = newFill;
      biomes
        .select("#biome" + biome)
        .attr("fill", newFill)
        .attr("stroke", newFill);
    };

    openPicker(currentFill, callback);
  }

  private biomeChangeName(el: HTMLInputElement) {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    (el.parentNode as HTMLElement).dataset.name = el.value;
    biomesData.name[biome] = el.value;
  }

  private biomeChangeHabitability(el: HTMLInputElement) {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    const failed = isNaN(+el.value) || +el.value < 0 || +el.value > 9999;
    if (failed) {
      el.value = String(biomesData.habitability[biome]);
      tip("Please provide a valid number in range 0-9999", false, "error");
      return;
    }
    biomesData.habitability[biome] = +el.value;
    (el.parentNode as HTMLElement).dataset.habitability = el.value;
    recalculatePopulation();
    this.refreshBiomesEditor();
  }

  private openWiki(el: HTMLElement) {
    const biomeName = (el.parentNode as HTMLElement).dataset.name;
    if (biomeName === "Custom" || !biomeName) return tip("Please fill in the biome name", false, "error");

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

  private toggleLegend() {
    if (legend.selectAll("*").size()) {
      clearLegend();
      return;
    }
    const d = biomesData;
    const data = Array.from(d.i)
      .filter((i: number) => d.cells[i])
      .sort((a: number, b: number) => d.area[b] - d.area[a])
      .map((i: number) => [i, d.color[i], d.name[i]]);
    drawLegend("Biomes", data);
  }

  private togglePercentageMode() {
    const body = document.getElementById("biomesBody")!;
    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalCells = +biomesFooterCells.innerHTML;
      const totalArea = +biomesFooterArea.dataset.area!;
      const totalMapArea = +biomesFooterArea.dataset.mapArea!;
      const totalPopulation = +biomesFooterPopulation.dataset.population!;

      body.querySelectorAll(":scope > div").forEach(function (el) {
        (el.querySelector(".biomeCells") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.cells! / totalCells) * 100) + "%";
        (el.querySelector(".biomeArea") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.area! / totalArea) * 100) + "%";
        (el.querySelector(".biomePopulation") as HTMLElement).innerHTML = rn((+(el as HTMLElement).dataset.population! / totalPopulation) * 100) + "%";
      });

      biomesFooterArea.innerHTML = rn((totalArea / totalMapArea) * 100) + "%";
    } else {
      body.dataset.type = "absolute";
      this.biomesEditorAddLines();
    }
  }

  private addCustomBiome() {
    const body = document.getElementById("biomesBody")!;
    const b = biomesData,
      i = biomesData.i.length;
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

    b.rural.push(0);
    b.urban.push(0);
    b.cells.push(0);
    b.area.push(0);

    const unit = getAreaUnit();
    const line = `<div class="states biomes" data-id="${i}" data-name="${b.name[i]}" data-habitability=${b.habitability[i]} data-cells=0 data-area=0 data-population=0 data-color=${b.color[i]}>
      <fill-box fill="${b.color[i]}"></fill-box>
      <input data-tip="Biome name. Click and type to change" class="biomeName" value="${b.name[i]}" autocorrect="off" spellcheck="false">
      <span data-tip="Biome habitability percent" class="hide">%</span>
      <input data-tip="Biome habitability percent. Click and set new value to change" type="number" min=0 max=9999 step=1 class="biomeHabitability hide" value=${b.habitability[i]}>
      <span data-tip="Cells count" class="icon-check-empty hide"></span>
      <div data-tip="Cells count" class="biomeCells hide">${b.cells[i]}</div>
      <span data-tip="Biome area" style="padding-right: 4px" class="icon-map-o hide"></span>
      <div data-tip="Biome area" class="biomeArea hide">0 ${unit}</div>
      <span data-tip="Total population: 0" class="icon-male hide"></span>
      <div data-tip="Total population: 0" class="biomePopulation hide">0</div>
      <span data-tip="Remove the custom biome" class="icon-trash-empty hide"></span>
    </div>`;

    body.insertAdjacentHTML("beforeend", line);
    biomesFooterBiomes.innerHTML = body.querySelectorAll(":scope > div").length;
    $("#biomesEditor").dialog({width: fitContent()});
  }

  private removeCustomBiome(el: HTMLElement) {
    const biome = +(el.parentNode as HTMLElement).dataset.id!;
    (el.parentNode as Element).remove();
    biomesData.name[biome] = "removed";
    biomesFooterBiomes.innerHTML = +biomesFooterBiomes.innerHTML - 1;
  }

  private regenerateIcons() {
    drawReliefIcons();
    if (!layerIsOn("toggleRelief")) toggleRelief();
  }

  private downloadBiomesData() {
    const body = document.getElementById("biomesBody")!;
    const unit = areaUnit.value === "square" ? distanceUnitInput.value + "2" : areaUnit.value;
    let data = "Id,Biome,Color,Habitability,Cells,Area " + unit + ",Population\n";

    body.querySelectorAll(":scope > div").forEach(function (el) {
      const d = (el as HTMLElement).dataset;
      data += d.id + ",";
      data += d.name + ",";
      data += d.color + ",";
      data += d.habitability + "%,";
      data += d.cells + ",";
      data += d.area + ",";
      data += d.population + "\n";
    });

    const name = getFileName("Biomes") + ".csv";
    downloadFile(data, name);
  }

  private enterBiomesCustomizationMode() {
    if (!layerIsOn("toggleBiomes")) toggleBiomes();
    customization = 6;
    biomes.append("g").attr("id", "temp");

    document.querySelectorAll("#biomesBottom > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    document.querySelectorAll("#biomesBottom > div").forEach((el: Element) => ((el as HTMLElement).style.display = "block"));
    document.querySelector("#biomesBody div.biomes")!.classList.add("selected");

    biomesEditor.querySelectorAll(".hide").forEach((el: Element) => el.classList.add("hidden"));
    document.querySelectorAll("#biomesBody div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "none"));
    biomesFooter.style.display = "none";
    $("#biomesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg"}});

    tip("Click on biome to select, drag the circle to change biome", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", () => this.selectBiomeOnMapClick())
      .call(d3.drag().on("start", () => this.dragBiomeBrush()))
      .on("touchmove mousemove", () => this.moveBiomeBrush());
  }

  private selectBiomeOnLineClick(line: HTMLElement) {
    const body = document.getElementById("biomesBody")!;
    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
    line.classList.add("selected");
  }

  private selectBiomeOnMapClick() {
    const point = d3.mouse(viewbox.node());
    const i = findCell(point[0], point[1]);
    if (pack.cells.h[i] < 20) {
      tip("You cannot reassign water via biomes. Please edit the Heightmap to change water", false, "error");
      return;
    }

    const assigned = biomes.select("#temp").select("polygon[data-cell='" + i + "']");
    const biome = assigned.size() ? +assigned.attr("data-biome") : pack.cells.biome[i];

    const body = document.getElementById("biomesBody")!;
    body.querySelector("div.selected")!.classList.remove("selected");
    (body.querySelector("div[data-id='" + biome + "']") as HTMLElement).classList.add("selected");
  }

  private dragBiomeBrush() {
    const r = +biomesBrush.value;

    d3.event.on("drag", () => {
      if (!d3.event.dx && !d3.event.dy) return;
      const p = d3.mouse(viewbox.node());
      moveCircle(p[0], p[1], r);

      const found = r > 5 ? findAll(p[0], p[1], r) : [findCell(p[0], p[1])];
      const selection = found.filter(isLand);
      if (selection) this.changeBiomeForSelection(selection);
    });
  }

  private changeBiomeForSelection(selection: number[]) {
    const body = document.getElementById("biomesBody")!;
    const temp = biomes.select("#temp");
    const selected = body.querySelector("div.selected") as HTMLElement;

    const biomeNew = +selected.dataset.id!;
    const color = biomesData.color[biomeNew];

    selection.forEach(function (i) {
      const exists = temp.select("polygon[data-cell='" + i + "']");
      const biomeOld = exists.size() ? +exists.attr("data-biome") : pack.cells.biome[i];
      if (biomeNew === biomeOld) return;

      if (exists.size()) exists.attr("data-biome", biomeNew).attr("fill", color).attr("stroke", color);
      else
        temp
          .append("polygon")
          .attr("data-cell", i)
          .attr("data-biome", biomeNew)
          .attr("points", getPackPolygon(i))
          .attr("fill", color)
          .attr("stroke", color);
    });
  }

  private moveBiomeBrush() {
    showMainTip();
    const point = d3.mouse(viewbox.node());
    const radius = +biomesBrush.value;
    moveCircle(point[0], point[1], radius);
  }

  private applyBiomesChange() {
    const changed = biomes.select("#temp").selectAll("polygon");
    changed.each(function (this: SVGPolygonElement) {
      const i = +(this as any).dataset.cell;
      const b = +(this as any).dataset.biome;
      pack.cells.biome[i] = b;
    });

    if (changed.size()) {
      drawBiomes();
      this.refreshBiomesEditor();
    }
    this.exitBiomesCustomizationMode();
  }

  private exitBiomesCustomizationMode(close = false) {
    customization = 0;
    biomes.select("#temp").remove();
    removeCircle();

    document.querySelectorAll("#biomesBottom > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    document.querySelectorAll("#biomesBottom > div").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));

    document.querySelectorAll("#biomesBody div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "all"));
    biomesEditor.querySelectorAll(".hide").forEach((el: Element) => el.classList.remove("hidden"));
    biomesFooter.style.display = "block";
    if (!close) $("#biomesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg"}});

    restoreDefaultEvents();
    clearMainTip();
    const selected = document.querySelector("#biomesBody > div.selected");
    if (selected) selected.classList.remove("selected");
  }

  private restoreInitialBiomes() {
    biomesData = Biomes.getDefault();
    Biomes.define();
    drawBiomes();
    recalculatePopulation();
    this.refreshBiomesEditor();
  }

  private closeBiomesEditor() {
    this.exitBiomesCustomizationMode(true);
  }
}

const biomesEditorController = new BiomesEditor();

export function editBiomes() {
  biomesEditorController.open();
}
