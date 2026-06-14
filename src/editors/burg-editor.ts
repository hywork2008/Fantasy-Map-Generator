import { drag, pointer } from "d3";
import { interactionManager } from "../controllers/interactionManager";
import type { Burg } from "../modules/burgs-generator";
import { Burgs } from "../modules/burgs-generator";
import type { Culture } from "../modules/cultures-generator";
import { COArenderer } from "../modules/emblem/renderer";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { convertTemperature, ensureEl, findCell, openURL, parseTransform, rand, rn, showPrompt } from "../utils";
import { editBurgGroups } from "./burg-group-editor";
import { editEmblem } from "./emblems-editor";
import { editNotes } from "./notes-editor";

export function editBurg(id?: number): void {
  if (customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleBurgIcons")) toggleBurgIcons();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  const burg = id;
  elSelected = burgLabels.select(`[data-id='${burg}']`);
  let _bdx = 0,
    _bdy = 0;
  burgLabels
    .selectAll<SVGTextElement, unknown>("text")
    .call(
      drag<SVGTextElement, unknown>()
        .on(
          "start",
          function (this: SVGTextElement, event: import("d3").D3DragEvent<SVGTextElement, unknown, unknown>) {
            const tr = parseTransform(this.getAttribute("transform") || "");
            _bdx = +tr[0] - event.x;
            _bdy = +tr[1] - event.y;
          }
        )
        .on("drag", function (this: SVGTextElement, event: import("d3").D3DragEvent<SVGTextElement, unknown, unknown>) {
          this.setAttribute("transform", `translate(${_bdx + event.x},${_bdy + event.y})`);
          tip('Use dragging for fine-tuning only, to actually move burg use "Relocate" button', false, "warn");
        })
    )
    .classed("draggable", true);
  updateGroupsList();
  updateBurgValues();

  openDialog("burgEditor", {
    title: "Edit Burg",
    resizable: false,
    close: closeBurgEditor,
    position: { my: "left top", at: "left+10 top+10", of: "svg", collision: "fit" }
  });

  if (modules.editBurg) return;
  modules.editBurg = true;

  // add listeners
  ensureEl("burgName").addEventListener("input", changeName);
  ensureEl("burgNameReRandom").addEventListener("click", generateNameRandom);
  ensureEl("burgGroup").addEventListener("change", changeGroup);
  ensureEl("burgGroupConfigure").addEventListener("click", editBurgGroups);
  ensureEl("burgType").addEventListener("change", changeType);
  ensureEl("burgCulture").addEventListener("change", changeCulture);
  ensureEl("burgNameReCulture").addEventListener("click", generateNameCulture);
  ensureEl("burgPopulation").addEventListener("change", changePopulation);
  burgBody.querySelectorAll(".burgFeature").forEach(el => {
    el.addEventListener("click", toggleFeature);
  });
  ensureEl("burgLinkOpen").addEventListener("click", openBurgLink);

  ensureEl("burgStyleShow").addEventListener("click", showStyleSection);
  ensureEl("burgStyleHide").addEventListener("click", hideStyleSection);
  ensureEl("burgEditLabelStyle").addEventListener("click", editGroupLabelStyle);
  ensureEl("burgEditIconStyle").addEventListener("click", editGroupIconStyle);
  ensureEl("burgEditAnchorStyle").addEventListener("click", editGroupAnchorStyle);

  ensureEl("burgEmblem").addEventListener("click", openEmblemEdit);
  ensureEl("burgSetPreviewLink").addEventListener("click", setCustomPreview);
  ensureEl("burgEditEmblem").addEventListener("click", openEmblemEdit);
  ensureEl("burgLocate").addEventListener("click", zoomIntoBurg);
  ensureEl("burgRelocate").addEventListener("click", toggleRelocateBurg);
  ensureEl("burglLegend").addEventListener("click", editBurgLegend);
  ensureEl("burgLock").addEventListener("click", toggleBurgLockButton);
  ensureEl("burgRemove").addEventListener("click", removeSelectedBurg);
  ensureEl("burgTemperatureGraph").addEventListener("click", showTemperatureGraph);

  function updateGroupsList(): void {
    const burgGroupSelect = ensureEl("burgGroup") as HTMLSelectElement;
    burgGroupSelect.options.length = 0;
    for (const { name } of options.burgs.groups) {
      burgGroupSelect.options.add(new Option(name, name));
    }
  }

  function updateBurgValues(): void {
    const burgId = +elSelected!.attr("data-id");
    const b = pack.burgs[burgId];
    const province = pack.cells.province[b.cell];
    const provinceName = province ? `${pack.provinces[province].fullName}, ` : "";
    const stateName = pack.states[b.state!].fullName || pack.states[b.state!].name;
    (ensureEl("burgProvinceAndState") as HTMLElement).innerHTML = provinceName + stateName;

    (ensureEl("burgName") as HTMLInputElement).value = b.name ?? "";
    (ensureEl("burgGroup") as HTMLSelectElement).value = b.group ?? "";
    (ensureEl("burgType") as HTMLSelectElement).value = b.type || "Generic";
    (ensureEl("burgPopulation") as HTMLInputElement).value = String(
      rn((b.population ?? 0) * populationRate * urbanization)
    );
    (ensureEl("burgEditAnchorStyle") as HTMLElement).style.display = +(b.port ?? 0) ? "inline-block" : "none";

    // update list and select culture
    const cultureSelect = ensureEl("burgCulture") as HTMLSelectElement;
    cultureSelect.options.length = 0;
    const cultures = pack.cultures.filter((c: Culture) => !c.removed);
    cultures.forEach((c: Culture) => {
      cultureSelect.options.add(new Option(c.name, String(c.i), false, c.i === b.culture));
    });

    const temperature = grid.cells.temp[pack.cells.g[b.cell]];
    (ensureEl("burgTemperature") as HTMLElement).innerHTML = convertTemperature(temperature);
    (ensureEl("burgTemperatureLikeIn") as HTMLElement).dataset.tip =
      `Average yearly temperature is like in ${getTemperatureLikeness(temperature)}`;
    (ensureEl("burgElevation") as HTMLElement).innerHTML = getHeight(pack.cells.h[b.cell]);

    // toggle features
    (ensureEl("burgCapital") as HTMLElement).classList.toggle("inactive", !b.capital);
    (ensureEl("burgPort") as HTMLElement).classList.toggle("inactive", !b.port);
    (ensureEl("burgCitadel") as HTMLElement).classList.toggle("inactive", !b.citadel);
    (ensureEl("burgWalls") as HTMLElement).classList.toggle("inactive", !b.walls);
    (ensureEl("burgPlaza") as HTMLElement).classList.toggle("inactive", !b.plaza);
    (ensureEl("burgTemple") as HTMLElement).classList.toggle("inactive", !b.temple);
    (ensureEl("burgShanty") as HTMLElement).classList.toggle("inactive", !b.shanty);

    updateBurgLockIcon();

    // set emblem image
    const coaID = `burgCOA${burgId}`;
    COArenderer.trigger(coaID, b.coa!);
    ensureEl<SVGUseElement>("burgEmblem").setAttribute("href", `#${coaID}`);

    updateBurgPreview(b);
  }

  function changeName(this: HTMLInputElement): void {
    const burgId = +elSelected!.attr("data-id");
    pack.burgs[burgId].name = this.value;
    elSelected!.text(this.value);
  }

  function generateNameRandom(): void {
    const base = rand(nameBases.length - 1);
    const nameInput = ensureEl("burgName") as HTMLInputElement;
    nameInput.value = Names.getBase(base);
    changeName.call(nameInput);
  }

  function changeGroup(this: HTMLSelectElement): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];
    Burgs.changeGroup(burg, this.value);
  }

  function changeType(this: HTMLSelectElement): void {
    const burgId = +elSelected!.attr("data-id");
    pack.burgs[burgId].type = this.value;
  }

  function changeCulture(this: HTMLSelectElement): void {
    const burgId = +elSelected!.attr("data-id");
    pack.burgs[burgId].culture = +this.value;
  }

  function generateNameCulture(): void {
    const burgId = +elSelected!.attr("data-id");
    const culture = pack.burgs[burgId].culture;
    const nameInput = ensureEl("burgName") as HTMLInputElement;
    nameInput.value = Names.getCulture(culture ?? 0);
    changeName.call(nameInput);
  }

  function changePopulation(this: HTMLInputElement): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];

    pack.burgs[burgId].population = rn(+this.value / populationRate / urbanization, 4);
    updateBurgPreview(burg);
  }

  function toggleFeature(this: HTMLElement): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];

    const feature = this.dataset.feature!;
    const value = Number(this.classList.contains("inactive"));

    if (feature === "port") togglePort(burgId);
    else if (feature === "capital") toggleCapital(burgId);
    else (burg as unknown as Record<string, number | undefined>)[feature] = value;

    this.classList.toggle("inactive", !(burg as unknown as Record<string, number | undefined>)[feature]);

    (ensureEl("burgEditAnchorStyle") as HTMLElement).style.display = burg.port ? "inline-block" : "none";
    updateBurgPreview(burg);
  }

  function togglePort(burgId: number): void {
    const burg = pack.burgs[burgId];
    if (burg.port) {
      burg.port = 0;

      const anchor = document.querySelector(`#anchors [data-id='${burgId}']`);
      if (anchor) anchor.remove();
    } else {
      const haven = pack.cells.haven[burg.cell];
      if (!haven) tip("Port haven is not found, system won't be able to make a searoute", false, "warn");
      const portFeature = haven ? pack.cells.f[haven] : -1;
      burg.port = portFeature;

      anchors
        .select(`#${burg.group}`)
        .append("use")
        .attr("href", "#icon-anchor")
        .attr("id", `anchor${burg.i}`)
        .attr("data-id", burg.i ?? 0)
        .attr("x", burg.x)
        .attr("y", burg.y);
    }
  }

  function toggleCapital(burgId: number): void {
    const { burgs, states } = pack;

    if (burgs[burgId].capital) {
      tip("To change capital please assign a capital status to another burg of this state", false, "error");
      return;
    }

    const stateId = burgs[burgId].state;
    if (!stateId) {
      tip("Neutral lands cannot have a capital", false, "error");
      return;
    }

    const oldCapitalId = states[stateId].capital;
    states[stateId].capital = burgId;
    states[stateId].center = burgs[burgId].cell;

    const capital = burgs[burgId];
    capital.capital = 1;
    Burgs.changeGroup(capital);

    const oldCapital = burgs[oldCapitalId];
    oldCapital.capital = 0;
    Burgs.changeGroup(oldCapital);
  }

  function toggleBurgLockButton(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];
    burg.lock = !burg.lock;

    updateBurgLockIcon();
  }

  function updateBurgLockIcon(): void {
    const burgId = +elSelected!.attr("data-id");
    const b = pack.burgs[burgId];
    const lockBtn = ensureEl("burgLock") as HTMLElement;
    if (b.lock) {
      lockBtn.classList.remove("icon-lock-open");
      lockBtn.classList.add("icon-lock");
    } else {
      lockBtn.classList.remove("icon-lock");
      lockBtn.classList.add("icon-lock-open");
    }
  }

  function showStyleSection(): void {
    document.querySelectorAll<HTMLElement>("#burgBottom > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("burgStyleSection") as HTMLElement).style.display = "inline-block";
  }

  function hideStyleSection(): void {
    document.querySelectorAll<HTMLElement>("#burgBottom > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("burgStyleSection") as HTMLElement).style.display = "none";
  }

  function editGroupLabelStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    closeDialogs(".stable");
    editStyle("labels", g);
  }

  function editGroupIconStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    closeDialogs(".stable");
    editStyle("burgIcons", g);
  }

  function editGroupAnchorStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    closeDialogs(".stable");
    editStyle("anchors", g);
  }

  function updateBurgPreview(burg: Burg): void {
    const preview = Burgs.getPreview(burg).preview;
    if (!preview) {
      (ensureEl("burgPreviewSection") as HTMLElement).style.display = "none";
      return;
    }

    (ensureEl("burgPreviewSection") as HTMLElement).style.display = "block";

    // recreate object to force reload (Chrome bug)
    const container = ensureEl("burgPreviewObject") as HTMLElement;
    container.innerHTML = "";
    const object = document.createElement("object");
    object.style.width = "100%";
    object.style.maxWidth = "60vw";
    object.style.maxHeight = "60vh";
    object.data = preview;
    container.insertBefore(object, null);
  }

  function openBurgLink(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];
    const link = Burgs.getPreview(burg).link;
    if (link) openURL(link);
  }

  function setCustomPreview(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];

    showPrompt(
      "Provide custom URL to the burg map. It can be a link to a generator or just an image. Leave empty to use the default map preview",
      { default: Burgs.getPreview(burg).link ?? "", required: false },
      link => {
        const url = String(link);
        if (url) burg.link = url;
        else delete burg.link;
        updateBurgPreview(burg);
      }
    );
  }

  function openEmblemEdit(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];
    editEmblem!("burg", `burgCOA${burgId}`, burg);
  }

  function zoomIntoBurg(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];
    const x = burg.x;
    const y = burg.y;
    zoomTo(x, y, 8, 2000);
  }

  function toggleRelocateBurg(): void {
    const toggler = ensureEl("toggleCells") as HTMLElement;
    (ensureEl("burgRelocate") as HTMLElement).classList.toggle("pressed");
    if ((ensureEl("burgRelocate") as HTMLElement).classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(relocateBurgOnClick);
      tip("Click on map to relocate burg. Hold Shift for continuous move", true);
      if (!layerIsOn("toggleCells")) {
        toggleCells();
        toggler.dataset.forced = "true";
      }
    } else {
      clearMainTip();
      interactionManager.resetClickHandler();
      viewbox.style("cursor", "default");
      if (layerIsOn("toggleCells") && toggler.dataset.forced) {
        toggleCells();
        toggler.dataset.forced = "false";
      }
    }
  }

  function relocateBurgOnClick(this: SVGElement, event: MouseEvent): void {
    const cells = pack.cells;
    const pt = pointer(event, this) as [number, number];
    const cellId = findCell(pt[0], pt[1]);
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];

    if (cells.h[cellId] < 20) {
      tip("Cannot place burg into the water! Select a land cell", false, "error");
      return;
    }
    if (cells.burg[cellId] && cells.burg[cellId] !== burgId) {
      tip("There is already a burg in this cell. Please select a free cell", false, "error");
      return;
    }

    const newState = cells.state[cellId];
    const oldState = burg.state;
    if (newState !== oldState && burg.capital) {
      tip("Capital cannot be relocated into another state!", false, "error");
      return;
    }

    // change UI
    const x = rn(pt[0], 2);
    const y = rn(pt[1], 2);

    burgIcons.select(`#burg${burgId}`).attr("x", x).attr("y", y);
    burgLabels.select(`#burgLabel${burgId}`).attr("transform", null).attr("x", x).attr("y", y);

    const anchor = anchors.select(`use[data-id='${burgId}']`);
    if (anchor.size()) {
      const size = anchor.attr("width");
      const xa = rn(x - +size * 0.47, 2);
      const ya = rn(y - +size * 0.47, 2);
      anchor.attr("transform", null).attr("x", xa).attr("y", ya);
    }

    // change data
    cells.burg[burg.cell] = 0;
    cells.burg[cellId] = burgId;
    burg.cell = cellId;
    burg.state = newState;
    burg.x = x;
    burg.y = y;
    if (burg.capital) pack.states[newState].center = burg.cell;

    if (event.shiftKey === false) toggleRelocateBurg();
  }

  function editBurgLegend(): void {
    const burgId = elSelected!.attr("data-id");
    const name = elSelected!.text();
    editNotes(`burg${burgId}`, name);
  }

  function showTemperatureGraph(): void {
    const burgId = +elSelected!.attr("data-id");
    showBurgTemperatureGraph(burgId);
  }

  function removeSelectedBurg(): void {
    const burgId = +elSelected!.attr("data-id");
    const burg = pack.burgs[burgId];

    if (burg.capital) {
      alertMessage.innerHTML = /* html */ `You cannot remove the capital. You must change the state capital first`;
      openRichDialog({
        content: window.alertMessage.innerHTML,
        resizable: false,
        title: "Remove burg",
        buttons: {
          Ok: () => {
            /* $(this).dialog("close") removed */
          }
        }
      });
    } else {
      confirmationDialog({
        title: "Remove burg",
        message: "Are you sure you want to remove the burg? <br>This action cannot be reverted",
        confirm: "Remove",
        onConfirm: () => {
          Burgs.remove(burgId);
          closeDialog("burgEditor");
        }
      });
    }
  }

  function closeBurgEditor(): void {
    (ensureEl("burgRelocate") as HTMLElement).classList.remove("pressed");
    burgLabels
      .selectAll("text")
      .call(
        drag().on("drag", null) as unknown as (
          selection: import("d3").Selection<import("d3").BaseType, unknown, SVGGElement, unknown>
        ) => void
      )
      .classed("draggable", false);
    unselect();
  }
}

// in °C, array from -5 °C; source: https://en.wikipedia.org/wiki/List_of_city_by_average_temperature
const meanTempCityMap: Record<string, string> = {
  "-5": "Snag (Yukon)",
  "-4": "Yellowknife (Canada)",
  "-3": "Okhotsk (Russia)",
  "-2": "Fairbanks (Alaska)",
  "-1": "Nuuk (Greenland)",
  "0": "Murmansk (Russia)",
  "1": "Arkhangelsk (Russia)",
  "2": "Anchorage (Alaska)",
  "3": "Tromsø (Norway)",
  "4": "Reykjavik (Iceland)",
  "5": "Harbin (China)",
  "6": "Stockholm (Sweden)",
  "7": "Montreal (Canada)",
  "8": "Prague (Czechia)",
  "9": "Copenhagen (Denmark)",
  "10": "London (England)",
  "11": "Antwerp (Belgium)",
  "12": "Paris (France)",
  "13": "Milan (Italy)",
  "14": "Washington (D.C.)",
  "15": "Rome (Italy)",
  "16": "Dubrovnik (Croatia)",
  "17": "Lisbon (Portugal)",
  "18": "Barcelona (Spain)",
  "19": "Marrakesh (Morocco)",
  "20": "Alexandria (Egypt)",
  "21": "Tegucigalpa (Honduras)",
  "22": "Guangzhou (China)",
  "23": "Rio de Janeiro (Brazil)",
  "24": "Dakar (Senegal)",
  "25": "Miami (USA)",
  "26": "Jakarta (Indonesia)",
  "27": "Mogadishu (Somalia)",
  "28": "Bangkok (Thailand)",
  "29": "Niamey (Niger)",
  "30": "Khartoum (Sudan)"
};

export function getTemperatureLikeness(temperature: number): string | null {
  if (temperature < -5) return "Yakutsk (Russia)";
  if (temperature > 30) return "Mecca (Saudi Arabia)";
  return meanTempCityMap[String(temperature)] || null;
}
