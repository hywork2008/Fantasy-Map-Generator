import { closeDialogs, getArea, getAreaUnit, unselect } from "./editors";
import { drawStates, layerIsOn, toggleBiomes, toggleBorders, toggleCells, toggleCultures, toggleProvinces, toggleReligions, toggleStates } from "./layers";
import { bordersRenderer as drawBorders } from "#renderers/draw-borders";
import { editStyle } from "./style";
import { tip } from "./general";

"use strict";

class CoastlineEditor {
  public open() {
    if (customization) return;
    closeDialogs(".stable");
    if (layerIsOn("toggleCells")) toggleCells();

    $("#coastlineEditor").dialog({
      title: "Edit Coastline",
      resizable: false,
      position: {my: "center top+20", at: "top", of: d3.event, collision: "fit"},
      close: () => this.closeCoastlineEditor()
    });

    debug.append("g").attr("id", "vertices");
    const node = d3.event.target;
    elSelected = d3.select(node);
    this.selectCoastlineGroup(node);
    this.drawCoastlineVertices();
    viewbox.on("touchmove mousemove", null);

    if (modules.editCoastline) return;
    modules.editCoastline = true;

    ensureEl("coastlineGroupsShow").on("click", () => this.showGroupSection());
    ensureEl("coastlineGroup").on("change", () => this.changeCoastlineGroup());
    ensureEl("coastlineGroupAdd").on("click", () => this.toggleNewGroupInput());
    ensureEl("coastlineGroupName").on("change", () => this.createNewGroup());
    ensureEl("coastlineGroupRemove").on("click", () => this.removeCoastlineGroup());
    ensureEl("coastlineGroupsHide").on("click", () => this.hideGroupSection());
    ensureEl("coastlineEditStyle").on("click", () => this.editGroupStyle());
  }

  private drawCoastlineVertices() {
    const featureId = +elSelected.attr("data-f");
    const {vertices, area} = pack.features[featureId];

    const cellsNumber = pack.cells.i.length;
    const neibCells = unique(vertices.map(v => pack.vertices.c[v]).flat()).filter(cellId => cellId < cellsNumber);
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
        tip("Drag to move the vertex. Please use for fine-tuning only. Edit heightmap to change actual cell heights!")
      );

    coastlineArea.innerHTML = si(getArea(area)) + " " + getAreaUnit();
  }

  private handleVertexDrag(vertexCircle: SVGElement) {
    const {vertices, features} = pack;

    const x = rn(d3.event.x, 2);
    const y = rn(d3.event.y, 2);
    vertexCircle.setAttribute("cx", String(x));
    vertexCircle.setAttribute("cy", String(y));

    const vertexId = d3.select(vertexCircle).datum();
    vertices.p[vertexId] = [x, y];

    const featureId = +elSelected.attr("data-f");
    const feature = features[featureId];

    defs.select("#featurePaths > path#feature_" + featureId).attr("d", getFeaturePath(feature));

    const points = feature.vertices.map(vertex => vertices.p[vertex]);
    feature.area = Math.abs(d3.polygonArea(points));
    coastlineArea.innerHTML = si(getArea(feature.area)) + " " + getAreaUnit();

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

  private showGroupSection() {
    document.querySelectorAll("#coastlineEditor > button").forEach(el => (el.style.display = "none"));
    ensureEl("coastlineGroupsSelection").style.display = "inline-block";
  }

  private hideGroupSection() {
    document.querySelectorAll("#coastlineEditor > button").forEach(el => (el.style.display = "inline-block"));
    ensureEl("coastlineGroupsSelection").style.display = "none";
    ensureEl("coastlineGroupName").style.display = "none";
    ensureEl("coastlineGroupName").value = "";
    ensureEl("coastlineGroup").style.display = "inline-block";
  }

  private selectCoastlineGroup(node: Node) {
    const group = (node.parentNode as Element).id;
    const select = ensureEl("coastlineGroup");
    select.options.length = 0;

    coastline.selectAll("g").each(function () {
      const groupNode = this as SVGGElement;
      select.options.add(new Option(groupNode.id, groupNode.id, false, groupNode.id === group));
    });
  }

  private changeCoastlineGroup() {
    const group = (ensureEl("coastlineGroup") as HTMLSelectElement).value;
    ensureEl(group).appendChild(elSelected.node());
  }

  private toggleNewGroupInput() {
    if (coastlineGroupName.style.display === "none") {
      coastlineGroupName.style.display = "inline-block";
      coastlineGroupName.focus();
      coastlineGroup.style.display = "none";
    } else {
      coastlineGroupName.style.display = "none";
      coastlineGroup.style.display = "inline-block";
    }
  }

  private createNewGroup() {
    const input = ensureEl("coastlineGroupName") as HTMLInputElement;
    if (!input.value) return tip("Please provide a valid group name");

    const group = input.value
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^\w\s]/gi, "");

    if (ensureEl(group)) return tip("Element with this id already exists. Please provide a unique name", false, "error");

    if (Number.isFinite(+group.charAt(0))) return tip("Group name should start with a letter", false, "error");

    const oldGroup = elSelected.node().parentNode;
    const basic = ["sea_island", "lake_island"].includes(oldGroup.id);
    if (!basic && oldGroup.childElementCount === 1) {
      ensureEl("coastlineGroup").selectedOptions[0].remove();
      ensureEl("coastlineGroup").options.add(new Option(group, group, false, true));
      oldGroup.id = group;
      this.toggleNewGroupInput();
      input.value = "";
      return;
    }

    const newGroup = elSelected.node().parentNode.cloneNode(false) as Element;
    ensureEl("coastline").appendChild(newGroup);
    newGroup.id = group;
    ensureEl("coastlineGroup").options.add(new Option(group, group, false, true));
    ensureEl(group).appendChild(elSelected.node());

    this.toggleNewGroupInput();
    input.value = "";
  }

  private removeCoastlineGroup() {
    const group = elSelected.node().parentNode.id;
    if (["sea_island", "lake_island"].includes(group))
      return tip("This is one of the default groups, it cannot be removed", false, "error");

    const count = elSelected.node().parentNode.childElementCount;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the group? All coastline elements of the group (${count}) will be moved under
      <i>sea_island</i> group`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove coastline group",
      width: "26em",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          const sea = ensureEl("sea_island");
          const groupEl = ensureEl(group);
          while (groupEl.childNodes.length) {
            sea.appendChild(groupEl.childNodes[0]);
          }
          groupEl.remove();
          ensureEl("coastlineGroup").selectedOptions[0].remove();
          ensureEl("coastlineGroup").value = "sea_island";
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private editGroupStyle() {
    const g = elSelected.node().parentNode.id;
    editStyle("coastline", g);
  }

  private closeCoastlineEditor() {
    debug.select("#vertices").remove();
    unselect();
  }
}

const coastlineEditor = new CoastlineEditor();

export function editCoastline() {
  coastlineEditor.open();
}
