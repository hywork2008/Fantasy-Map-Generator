import * as d3 from "d3";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { provincesEditorActions } from "../../controllers/provinces-editor";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import type { Province, State } from "../../types/models";
import { rn, si } from "../../utils";
import { getArea, getAreaUnit } from "../../utils/domUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

type ChartType = "area" | "rural" | "urban" | "population";

type ChartNode = {
  id: number;
  state: number | null;
  color: string;
  i?: number;
  name?: string;
  fullName?: string;
  area?: number;
  urban?: number;
  rural?: number;
};

const DIALOG_ID = "provincesChart";

export const ProvincesChartDialog: React.FC = () => {
  const isOpen = useDialogState(s => s.openDialogs.has(DIALOG_ID));
  const [chartType, setChartType] = useState<ChartType>("area");
  const containerRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const uiSize = useOptionsState.getState().uiSize;
    const width = 300 + 300 * uiSize;
    const height = 90 + 90 * uiSize;
    const margin = { top: 10, right: 10, bottom: 0, left: 10 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const color = d3.scaleOrdinal(d3.schemeTableau10);
    const getClr = (s: State) =>
      !s.i || (s as { removed?: boolean }).removed || !s.color || (s.color as string)[0] !== "#"
        ? "#666"
        : String(d3.color(s.color as string)?.darker() ?? "#666");

    const states = (worldContext.pack.states as State[]).map(
      s => ({ id: s.i, state: s.i ? 0 : null, color: getClr(s) }) as ChartNode
    );
    const provinces = (worldContext.pack.provinces as Province[])
      .filter(p => p.i && !(p as { removed?: boolean }).removed)
      .map(
        p =>
          ({
            id: (p.i ?? 0) + states.length - 1,
            i: p.i,
            state: (p as { state?: number }).state ?? null,
            color: String(color(String(p.i)) ?? "#ccc"),
            name: p.name,
            fullName: p.fullName,
            area: (p as { area?: number }).area,
            urban: (p as { urban?: number }).urban,
            rural: (p as { rural?: number }).rural
          }) as ChartNode
      );

    const data: ChartNode[] = [...states, ...provinces];

    const getAccessor =
      (type: ChartType) =>
      (d: ChartNode): number => {
        if (type === "area") return d.area ?? 0;
        if (type === "rural") return d.rural ?? 0;
        if (type === "urban") return d.urban ?? 0;
        return (d.rural ?? 0) + (d.urban ?? 0);
      };

    const root = d3
      .stratify<ChartNode>()
      .id(d => String(d.id))
      .parentId(d => (d.state !== null && d.state !== undefined ? String(d.state) : null))(data)
      .sum(getAccessor(chartType));

    const treeLayout = d3.treemap<ChartNode>().size([w, h]).padding(2);
    treeLayout(root);

    const container = containerRef.current;
    container.innerHTML = "";

    const svg = d3
      .select(container)
      .append("svg")
      .attr("id", "provincesTree")
      .attr("width", width)
      .attr("height", height)
      .attr("font-size", "10px");
    const graph = svg.append("g").attr("transform", "translate(10, 0)");

    type HRNode = d3.HierarchyRectangularNode<ChartNode>;
    const leaves = root.leaves() as HRNode[];

    const node = graph
      .selectAll<SVGGElement, HRNode>("g")
      .data(leaves)
      .enter()
      .append("g")
      .attr("data-id", (d: HRNode) => d.data.i ?? null)
      .on("mouseenter", (_event: MouseEvent, d: HRNode) => {
        const name = d.data.fullName ?? d.data.name ?? "";
        const state = (worldContext.pack.states as State[])[d.data.state!]?.fullName ?? "";
        const area = `${getArea(d.data.area ?? 0)} ${getAreaUnit()}`;
        const rural = rn((d.data.rural ?? 0) * worldContext.populationRate);
        const urban = rn((d.data.urban ?? 0) * worldContext.populationRate * worldContext.urbanization);
        const value =
          chartType === "area"
            ? `Area: ${area}`
            : chartType === "rural"
              ? `Rural population: ${si(rural)}`
              : chartType === "urban"
                ? `Urban population: ${si(urban)}`
                : `Population: ${si(rural + urban)}`;
        if (infoRef.current) infoRef.current.textContent = `${name}. ${state}. ${value}`;
        if (d.data.i != null) provincesEditorActions.provinceHighlightOn(d.data.i);
      })
      .on("mouseleave", (_event: MouseEvent, d: HRNode) => {
        if (infoRef.current) infoRef.current.textContent = "​";
        provincesEditorActions.provinceHighlightOff(d.data.i ?? null);
      });

    node
      .append("rect")
      .attr("stroke", (d: HRNode) => String(d.parent?.data.color ?? ""))
      .attr("stroke-width", 1)
      .attr("fill", (d: HRNode) => String(d.data.color ?? ""))
      .attr("x", (d: HRNode) => d.x0)
      .attr("y", (d: HRNode) => d.y0)
      .attr("width", (d: HRNode) => d.x1 - d.x0)
      .attr("height", (d: HRNode) => d.y1 - d.y0);

    node
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .attr("dx", ".2em")
      .attr("dy", "1em")
      .attr("x", (d: HRNode) => d.x0)
      .attr("y", (d: HRNode) => d.y0);

    // Hide text that doesn't fit
    node.select<SVGTextElement>("text").each(function (d: HRNode) {
      this.textContent = d.data.name ?? "";
      let b = this.getBBox();
      if (b.y + b.height > d.y1 + 1) {
        this.textContent = "";
        return;
      }
      for (let i = 0; i < 15 && b.width > 0 && b.x + b.width > d.x1; i++) {
        if ((this.textContent ?? "").length < 3) {
          this.textContent = "";
          break;
        }
        this.textContent = `${this.textContent!.slice(0, -2)}…`;
        b = this.getBBox();
      }
    });

    return () => {
      container.innerHTML = "";
    };
  }, [isOpen, chartType]);

  const handleClose = () => closeDialog(DIALOG_ID);

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={true}
      title="Provinces chart"
      onClose={handleClose}
      buttons={[{ label: "Close", onClick: handleClose }]}
    >
      <div>
        <select
          value={chartType}
          onChange={e => setChartType(e.target.value as ChartType)}
          className="-provinces-chart-dialog__display-block--margin-left-13--font-size-11"
        >
          <option value="area">Area</option>
          <option value="population">Total population</option>
          <option value="rural">Rural population</option>
          <option value="urban">Urban population</option>
        </select>
        <div ref={infoRef} className="chartInfo">
          &#8205;
        </div>
        <div ref={containerRef} />
      </div>
    </Dialog>
  );
};
