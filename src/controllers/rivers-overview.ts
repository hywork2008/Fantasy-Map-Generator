import { mean } from "d3";
import { ensureEl, rn } from "../utils";

function overviewRivers(): void {
  if (customization) return;
  closeDialogs("#riversOverview, .stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  const body = ensureEl("riversBody");
  riversOverviewAddLines();
  $("#riversOverview").dialog();

  if (modules.overviewRivers) return;
  modules.overviewRivers = true;

  $("#riversOverview").dialog({
    title: "Rivers Overview",
    resizable: false,
    width: fitContent(),
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  ensureEl("riversOverviewRefresh").on("click", riversOverviewAddLines);
  ensureEl("addNewRiver").on("click", toggleAddRiver);
  ensureEl("riverCreateNew").on("click", createRiver);
  ensureEl("riversBasinHighlight").on("click", toggleBasinsHightlight);
  ensureEl("riversExport").on("click", downloadRiversData);
  ensureEl("riversRemoveAll").on("click", triggerAllRiversRemove);
  ensureEl("riversSearch").on("input", riversOverviewAddLines);

  function riversOverviewAddLines(): void {
    body.innerHTML = "";
    let lines = "";
    const unit = distanceUnitInput.value;

    const riversById = new Map(pack.rivers.map(river => [river.i, river]));

    let filteredRivers = pack.rivers;
    const searchText = (ensureEl("riversSearch") as HTMLInputElement).value.toLowerCase().trim();
    if (searchText) {
      filteredRivers = filteredRivers.filter(r => {
        const name = (r.name || "").toLowerCase();
        const type = (r.type || "").toLowerCase();
        const basin = riversById.get(r.basin);
        const basinName = basin ? (basin.name || "").toLowerCase() : "";
        return name.includes(searchText) || type.includes(searchText) || basinName.includes(searchText);
      });
    }

    for (const r of filteredRivers) {
      const discharge = `${r.discharge} m³/s`;
      const length = `${rn(r.length * distanceScale)} ${unit}`;
      const width = `${rn(r.width * distanceScale, 3)} ${unit}`;
      const basin = riversById.get(r.basin)?.name;

      lines += /* html */ `<div
        class="states"
        data-id=${r.i}
        data-name="${r.name}"
        data-type="${r.type}"
        data-discharge="${r.discharge}"
        data-length="${r.length}"
        data-width="${r.width}"
        data-basin="${basin}"
      >
        <span data-tip="Locate the river" class="icon-target"></span>
        <div data-tip="River name" style="margin-left: 0.4em;" class="riverName">${r.name}</div>
        <div data-tip="River type name" class="riverType">${r.type}</div>
        <div data-tip="River discharge (flux power)" class="biomeArea">${discharge}</div>
        <div data-tip="River length from source to mouth" class="biomeArea">${length}</div>
        <div data-tip="River mouth width" class="biomeArea">${width}</div>
        <input data-tip="River basin (name of the main stem)" class="stateName" value="${basin}" disabled />
        <span data-tip="Edit river" class="icon-pencil"></span>
        <span data-tip="Remove river" class="icon-trash-empty"></span>
      </div>`;
    }
    body.insertAdjacentHTML("beforeend", lines);

    ensureEl("riversFooterNumber").innerHTML = `${filteredRivers.length} of ${pack.rivers.length}`;
    const averageDischarge = rn(mean(filteredRivers.map(r => r.discharge)) ?? 0) || 0;
    ensureEl("riversFooterDischarge").innerHTML = `${averageDischarge} m³/s`;
    const averageLength = rn(mean(filteredRivers.map(r => r.length)) ?? 0) || 0;
    ensureEl("riversFooterLength").innerHTML = `${averageLength * distanceScale} ${unit}`;
    const averageWidth = rn(mean(filteredRivers.map(r => r.width)) ?? 0, 3) || 0;
    ensureEl("riversFooterWidth").innerHTML = `${rn(averageWidth * distanceScale, 3)} ${unit}`;

    for (const el of body.querySelectorAll("div.states"))
      el.on("mouseenter", (ev: Event) => riverHighlightOn(ev as MouseEvent));
    for (const el of body.querySelectorAll("div.states"))
      el.on("mouseleave", (ev: Event) => riverHighlightOff(ev as MouseEvent));
    for (const el of body.querySelectorAll("div > span.icon-target")) el.on("click", zoomToRiver);
    for (const el of body.querySelectorAll("div > span.icon-pencil")) el.on("click", openRiverEditor);
    for (const el of body.querySelectorAll("div > span.icon-trash-empty")) el.on("click", triggerRiverRemove);

    applySorting(ensureEl("riversHeader"));
  }

  function riverHighlightOn(event: MouseEvent): void {
    if (!layerIsOn("toggleRivers")) toggleRivers();
    const r = +(event.target as HTMLElement).dataset.id!;
    rivers.select(`#river${r}`).attr("stroke", "red").attr("stroke-width", 1);
  }

  function riverHighlightOff(e: MouseEvent): void {
    const r = +(e.target as HTMLElement).dataset.id!;
    rivers.select(`#river${r}`).attr("stroke", null).attr("stroke-width", null);
  }

  function zoomToRiver(this: HTMLElement): void {
    const r = +this.parentElement!.dataset.id!;
    const river = rivers.select(`#river${r}`).node() as Element;
    highlightElement(river, 3);
  }

  function toggleBasinsHightlight(): void {
    if (rivers.attr("data-basin") === "hightlighted") {
      rivers.selectAll("*").attr("fill", null);
      rivers.attr("data-basin", null);
    } else {
      rivers.attr("data-basin", "hightlighted");
      const basins = [...new Set(pack.rivers.map(r => r.basin))];
      const colors = [
        "#1f77b4",
        "#ff7f0e",
        "#2ca02c",
        "#d62728",
        "#9467bd",
        "#8c564b",
        "#e377c2",
        "#7f7f7f",
        "#bcbd22",
        "#17becf"
      ];

      basins.forEach((b, i) => {
        const color = colors[i % colors.length];
        pack.rivers
          .filter(r => r.basin === b)
          .forEach(r => {
            rivers.select(`#river${r.i}`).attr("fill", color);
          });
      });
    }
  }

  function downloadRiversData(): void {
    let data = "Id,River,Type,Discharge,Length,Width,Basin\n";

    body.querySelectorAll(":scope > div").forEach(el => {
      const d = (el as HTMLElement).dataset;
      const discharge = `${d.discharge} m³/s`;
      const length = `${rn(+(d.length || 0) * distanceScale)} ${distanceUnitInput.value}`;
      const width = `${rn(+(d.width || 0) * distanceScale, 3)} ${distanceUnitInput.value}`;
      data += `${[d.id, d.name, d.type, discharge, length, width, d.basin].join(",")}\n`;
    });

    const name = `${getFileName("Rivers")}.csv`;
    downloadFile(data, name);
  }

  function openRiverEditor(this: HTMLElement): void {
    const id = `river${this.parentElement!.dataset.id!}`;
    editRiver(id);
  }

  function triggerRiverRemove(this: HTMLElement): void {
    const river = +this.parentElement!.dataset.id!;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the river? All tributaries will be auto-removed`;

    $("#alert").dialog({
      resizable: false,
      width: "22em",
      title: "Remove river",
      buttons: {
        Remove: function () {
          Rivers.remove(river);
          riversOverviewAddLines();
          $(this).dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function triggerAllRiversRemove(): void {
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove all rivers?`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove all rivers",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          removeAllRivers();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function removeAllRivers(): void {
    pack.rivers = [];
    pack.cells.r = new Uint16Array(pack.cells.i.length);
    rivers.selectAll("*").remove();
    riversOverviewAddLines();
  }
}

window.overviewRivers = overviewRivers;
