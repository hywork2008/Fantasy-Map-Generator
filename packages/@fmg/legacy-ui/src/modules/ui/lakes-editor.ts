import { getArea, getAreaUnit } from "./editors";
"use strict";

declare function getHeight(value: number, mode?: string): string;

class LakesEditor {
  public open() {
    if (customization) return;
    closeDialogs(".stable");
    if (layerIsOn("toggleCells")) toggleCells();

    $("#lakeEditor").dialog({
      title: "Edit Lake",
      resizable: false,
      position: {my: "center top+20", at: "top", of: d3.event, collision: "fit"},
      close: () => this.closeLakesEditor()
    });

    const node = d3.event.target;
    debug.append("g").attr("id", "vertices");
    elSelected = d3.select(node);
    this.updateLakeValues();
    this.selectLakeGroup();
    this.drawLakeVertices();
    viewbox.on("touchmove mousemove", null);

    if (modules.editLake) return;
    modules.editLake = true;

    ensureEl("lakeName").on("input", () => this.changeName());
    ensureEl("lakeNameCulture").on("click", () => this.generateNameCulture());
    ensureEl("lakeNameRandom").on("click", () => this.generateNameRandom());
    ensureEl("lakeGroup").on("change", () => this.changeLakeGroup());
    ensureEl("lakeGroupAdd").on("click", () => this.toggleNewGroupInput());
    ensureEl("lakeGroupName").on("change", () => this.createNewGroup());
    ensureEl("lakeGroupRemove").on("click", () => this.removeLakeGroup());
    ensureEl("lakeEditStyle").on("click", () => this.editGroupStyle());
    ensureEl("lakeLegend").on("click", () => this.editLakeLegend());
  }

  private getLake() {
    const lakeId = +elSelected.attr("data-f");
    return pack.features.find(feature => feature.i === lakeId);
  }

  private updateLakeValues() {
    const {cells, vertices, rivers} = pack;

    const l = this.getLake();
    ensureEl("lakeName").value = l.name;
    ensureEl("lakeArea").value = si(getArea(l.area)) + " " + getAreaUnit();

    const length = d3.polygonLength(l.vertices.map(v => vertices.p[v]));
    ensureEl("lakeShoreLength").value = si(length * distanceScale) + " " + distanceUnitInput.value;

    const lakeCells = Array.from(cells.i.filter(i => cells.f[i] === l.i)) as number[];
    const heights = lakeCells.map(i => cells.h[i]);

    ensureEl("lakeElevation").value = getHeight(l.height);
    ensureEl("lakeAverageDepth").value = getHeight(d3.mean(heights), "abs");
    ensureEl("lakeMaxDepth").value = getHeight(d3.min(heights), "abs");

    ensureEl("lakeFlux").value = l.flux;
    ensureEl("lakeEvaporation").value = l.evaporation;

    const inlets = l.inlets && l.inlets.map(inlet => rivers.find(river => river.i === inlet)?.name);
    const outlet = l.outlet ? rivers.find(river => river.i === l.outlet)?.name : "no";
    ensureEl("lakeInlets").value = inlets ? inlets.length : "no";
    ensureEl("lakeInlets").title = inlets ? inlets.join(", ") : "";
    ensureEl("lakeOutlet").value = outlet;
  }

  private drawLakeVertices() {
    const vertices = this.getLake().vertices;

    const neibCells = unique(vertices.map(v => pack.vertices.c[v]).flat());
    debug
      .select("#vertices")
      .selectAll("polygon")
      .data(neibCells)
      .enter()
      .append("polygon")
      .attr("points", getPackPolygon)
      .attr("data-c", d => d);

    const editor = this;
    debug
      .select("#vertices")
      .selectAll("circle")
      .data(vertices)
      .enter()
      .append("circle")
      .attr("cx", d => pack.vertices.p[d][0])
      .attr("cy", d => pack.vertices.p[d][1])
      .attr("r", 0.4)
      .attr("data-v", d => d)
      .call(
        d3
          .drag()
          .on("drag", function () {
            editor.handleVertexDrag(this as SVGElement);
          })
          .on("end", () => editor.handleVertexDragEnd())
      )
      .on("mousemove", () =>
        tip("Drag to move the vertex. Please use for fine-tuning only! Edit heightmap to change actual cell heights")
      );
  }

  private handleVertexDrag(vertexCircle: SVGElement) {
    const x = rn(d3.event.x, 2);
    const y = rn(d3.event.y, 2);
    vertexCircle.setAttribute("cx", String(x));
    vertexCircle.setAttribute("cy", String(y));

    const vertexId = d3.select(vertexCircle).datum();
    pack.vertices.p[vertexId] = [x, y];

    const feature = this.getLake();

    defs.select("#featurePaths > path#feature_" + feature.i).attr("d", getFeaturePath(feature));

    const points = feature.vertices.map(vertex => pack.vertices.p[vertex]);
    feature.area = Math.abs(d3.polygonArea(points));
    ensureEl("lakeArea").value = si(getArea(feature.area)) + " " + getAreaUnit();

    debug.select("#vertices").selectAll("polygon").attr("points", getPackPolygon);
  }

  private handleVertexDragEnd() {
    if (layerIsOn("toggleStates")) drawStates();
    if (layerIsOn("toggleProvinces")) drawProvinces();
    if (layerIsOn("toggleBorders")) drawBorders();
    if (layerIsOn("toggleBiomes")) drawBiomes();
    if (layerIsOn("toggleReligions")) drawReligions();
    if (layerIsOn("toggleCultures")) drawCultures();
  }

  private changeName() {
    this.getLake().name = (ensureEl("lakeName") as HTMLInputElement).value;
  }

  private generateNameCulture() {
    const lake = this.getLake();
    lake.name = lakeName.value = Lakes.getName(lake);
  }

  private generateNameRandom() {
    const lake = this.getLake();
    lake.name = lakeName.value = Names.getBase(rand(nameBases.length - 1));
  }

  private selectLakeGroup() {
    const lake = this.getLake();

    const select = ensureEl("lakeGroup");
    select.options.length = 0;
    lakes.selectAll("g").each(function () {
      const group = this as HTMLElement;
      select.options.add(new Option(group.id, group.id, false, group.id === lake.group));
    });
  }

  private changeLakeGroup() {
    const group = (ensureEl("lakeGroup") as HTMLSelectElement).value;
    ensureEl(group).appendChild(elSelected.node());
    this.getLake().group = group;
  }

  private toggleNewGroupInput() {
    if (lakeGroupName.style.display === "none") {
      lakeGroupName.style.display = "inline-block";
      lakeGroupName.focus();
      lakeGroup.style.display = "none";
    } else {
      lakeGroupName.style.display = "none";
      lakeGroup.style.display = "inline-block";
    }
  }

  private createNewGroup() {
    const input = ensureEl("lakeGroupName") as HTMLInputElement;
    if (!input.value) {
      tip("Please provide a valid group name");
      return;
    }
    const group = input.value
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^\w\s]/gi, "");

    if (ensureEl(group)) {
      tip("Element with this id already exists. Please provide a unique name", false, "error");
      return;
    }

    if (Number.isFinite(+group.charAt(0))) {
      tip("Group name should start with a letter", false, "error");
      return;
    }

    const oldGroup = elSelected.node().parentNode as HTMLElement;
    const basic = ["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"].includes(oldGroup.id);
    if (!basic && oldGroup.childElementCount === 1) {
      ensureEl("lakeGroup").selectedOptions[0].remove();
      ensureEl("lakeGroup").options.add(new Option(group, group, false, true));
      oldGroup.id = group;
      this.toggleNewGroupInput();
      input.value = "";
      return;
    }

    const newGroup = elSelected.node().parentNode.cloneNode(false) as Element;
    ensureEl("lakes").appendChild(newGroup);
    newGroup.id = group;
    ensureEl("lakeGroup").options.add(new Option(group, group, false, true));
    ensureEl(group).appendChild(elSelected.node());

    this.toggleNewGroupInput();
    input.value = "";
  }

  private removeLakeGroup() {
    const group = elSelected.node().parentNode.id;
    if (["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"].includes(group)) {
      tip("This is one of the default groups, it cannot be removed", false, "error");
      return;
    }

    const count = elSelected.node().parentNode.childElementCount;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the group? All lakes of the group (${count}) will be turned into Freshwater`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove lake group",
      width: "26em",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          const freshwater = ensureEl("freshwater");
          const groupEl = ensureEl(group);
          while (groupEl.childNodes.length) {
            freshwater.appendChild(groupEl.childNodes[0]);
          }
          groupEl.remove();
          ensureEl("lakeGroup").selectedOptions[0].remove();
          ensureEl("lakeGroup").value = "freshwater";
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private editGroupStyle() {
    const g = elSelected.node().parentNode.id;
    editStyle("lakes", g);
  }

  private editLakeLegend() {
    const id = elSelected.attr("id");
    editNotes(id, this.getLake().name + " " + lakeGroup.value + " lake");
  }

  private closeLakesEditor() {
    debug.select("#vertices").remove();
    unselect();
  }
}

const lakesEditor = new LakesEditor();

export function editLake() {
  lakesEditor.open();
}
