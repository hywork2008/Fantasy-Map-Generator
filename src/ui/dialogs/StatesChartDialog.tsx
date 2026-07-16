import * as d3 from "d3";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { stateHighlightById, stateHighlightOff } from "../../controllers/states-editor";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import type { State } from "../../types/models";
import { rn, si } from "../../utils";
import { getArea, getAreaUnit } from "../../utils/domUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

type ChartType = "area" | "population" | "rural" | "urban" | "burgs";

const DIALOG_ID = "statesChart";

export const StatesChartDialog: React.FC = () => {
  const isOpen = useDialogState(s => s.openDialogs.has(DIALOG_ID));
  const [chartType, setChartType] = useState<ChartType>("area");
  const containerRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const statesData = (worldContext.pack.states as State[]).filter(s => !s.removed);
    if (statesData.length < 2) return;

    const uiSize = useOptionsState.getState().uiSize;
    const size = 150 + 200 * uiSize;
    const margin = { right: -50, left: -50 };
    const w = size - margin.left - margin.right;
    const h = size;

    const getAccessor =
      (type: ChartType) =>
      (d: State): number => {
        if (type === "area") return d.area ?? 0;
        if (type === "rural") return d.rural ?? 0;
        if (type === "urban") return d.urban ?? 0;
        if (type === "burgs") return d.burgs ?? 0;
        return (d.rural ?? 0) + (d.urban ?? 0);
      };

    const root = d3
      .stratify<State>()
      .id(d => String(d.i))
      .parentId(d => (d.i ? "0" : null))(statesData)
      .sum(getAccessor(chartType))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const treeLayout = d3.pack<State>().size([w, h]).padding(3);
    treeLayout(root);

    const container = containerRef.current;
    container.innerHTML = "";

    const svg = d3
      .select(container)
      .append("svg")
      .attr("id", "statesTree")
      .attr("width", size)
      .attr("height", size)
      .style("font-family", "Almendra SC")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central");
    const graph = svg.append("g").attr("transform", `translate(-50, 0)`);

    const exp = /(?=[A-Z][^A-Z])/g;
    const lp = (n: string) => (d3.max(n.split(exp).map(p => p.length)) ?? 1) + 1;

    type HPNode = d3.HierarchyCircularNode<State>;
    const leaves = root.leaves() as HPNode[];

    const node = graph
      .selectAll<SVGGElement, HPNode>("g")
      .data(leaves)
      .enter()
      .append("g")
      .attr("transform", (d: HPNode) => `translate(${d.x},${d.y})`)
      .attr("data-id", (d: HPNode) => d.data.i)
      .on("mouseenter", (_event: MouseEvent, d: HPNode) => {
        const state = d.data.fullName;
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
                : chartType === "burgs"
                  ? `Burgs number: ${d.data.burgs}`
                  : `Population: ${si(rural + urban)}`;
        if (infoRef.current) infoRef.current.textContent = `${state}. ${value}`;
        stateHighlightById(d.data.i);
      })
      .on("mouseleave", () => {
        if (infoRef.current) infoRef.current.textContent = "​";
        stateHighlightOff();
      });

    node
      .append("circle")
      .attr("fill", (d: HPNode) => d.data.color ?? "")
      .attr("r", (d: HPNode) => d.r);

    node
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .style("font-size", (d: HPNode) => `${rn((d.r ** 0.97 * 4) / lp(d.data.name), 2)}px`)
      .selectAll<SVGTSpanElement, string>("tspan")
      .data((d: HPNode) => d.data.name.split(exp))
      .join("tspan")
      .attr("x", 0)
      .text(d => String(d))
      .attr("dy", (_d, i, n) => `${i ? 1 : (n.length - 1) / -2}em`);

    return () => {
      container.innerHTML = "";
    };
  }, [isOpen, chartType]);

  const handleClose = () => {
    stateHighlightOff();
    closeDialog(DIALOG_ID);
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={true}
      title="States bubble chart"
      onClose={handleClose}
      buttons={[{ label: "Close", onClick: handleClose }]}
    >
      <div>
        <select value={chartType} onChange={e => setChartType(e.target.value as ChartType)} className="d-block">
          <option value="area">Area</option>
          <option value="population">Total population</option>
          <option value="rural">Rural population</option>
          <option value="urban">Urban population</option>
          <option value="burgs">Burgs number</option>
        </select>
        <div ref={infoRef} className="chartInfo">
          &#8205;
        </div>
        <div ref={containerRef} />
      </div>
    </Dialog>
  );
};
