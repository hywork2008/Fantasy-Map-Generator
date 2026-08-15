import * as d3 from "d3";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { zoomTo } from "../../actions";
import { worldContext } from "../../context/worldContext";
import { burgHighlightOff, burgHighlightOn } from "../../controllers/burg-highlight";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { si } from "../../utils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface ChartDatum {
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

export interface BurgsBubbleChartConfig {
  [key: string]: unknown;
  burgs: ChartDatum[];
  statesCount: number;
}

type GroupingType = "states" | "cultures" | "parent" | "provinces";

const DIALOG_ID = "burgsBubbleChart";

export const BurgsBubbleChartDialog: React.FC = () => {
  const { t } = useTranslation();
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as BurgsBubbleChartConfig | undefined;
  const [grouping, setGrouping] = useState<GroupingType>("states");
  const svgRef = useRef<d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown> | null>(null);
  const nodeRef = useRef<d3.Selection<
    SVGCircleElement,
    d3.HierarchyCircularNode<ChartDatum>,
    SVGGElement,
    unknown
  > | null>(null);
  const burgsRef = useRef<ChartDatum[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  const width = 150 + 200 * useOptionsState.getState().uiSize;
  const height = 150 + 200 * useOptionsState.getState().uiSize;
  const w = width - -50 - -50;
  const h = height - -10;

  const getBaseData = useCallback((type: GroupingType): ChartDatum[] => {
    const { states, cultures, provinces } = worldContext.pack;
    if (type === "states") {
      return states.map(s => ({
        id: s.i,
        state: s.i ? 0 : null,
        color: s.color ?? "#ccc",
        name: s.fullName ?? s.name
      }));
    }
    if (type === "cultures") {
      return cultures.map(c => ({
        id: c.i,
        culture: c.i ? 0 : null,
        color: c.color ?? "#ccc",
        name: c.name
      }));
    }
    if (type === "parent") {
      const statesData = states.map(s => ({
        id: s.i,
        parent: s.i ? 0 : null,
        color: s.color ?? "#ccc",
        name: s.fullName ?? s.name
      }));
      const provs = (provinces ?? [])
        .filter(p => p.i && !p.removed)
        .map(p => ({
          id: p.i + statesData.length - 1,
          parent: p.state,
          color: p.color,
          name: p.fullName
        }));
      return [...statesData, ...provs] as ChartDatum[];
    }
    return (provinces ?? []).map(p => ({
      id: p.i ? p.i : 0,
      province: p.i ? 0 : null,
      color: p.color ?? "#ccc",
      name: p.fullName ?? p.name
    }));
  }, []);

  const getValue = useCallback((d: ChartDatum, type: GroupingType) => {
    if (type === "states") return d.state;
    if (type === "cultures") return d.culture;
    if (type === "parent") return d.parent;
    return d.province;
  }, []);

  // Initial chart render
  useEffect(() => {
    if (!config || !containerRef.current) return;

    burgsRef.current = [...config.burgs];
    const treeLayout = d3.pack<ChartDatum>().size([w, h]).padding(3);

    const base = getBaseData("states");
    const data: ChartDatum[] = [...base, ...burgsRef.current];

    const root = d3
      .stratify<ChartDatum>()
      .id(d => String(d.id))
      .parentId(d => (d.state != null ? String(d.state) : null))(data)
      .sum(d => d.population ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    containerRef.current.innerHTML = "";
    const svg = d3
      .select(containerRef.current)
      .append("svg")
      .attr("id", "burgsTree")
      .attr("width", width)
      .attr("height", height - 10)
      .attr("stroke-width", 2) as unknown as d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;

    svgRef.current = svg;
    const graph = svg.append("g").attr("transform", `translate(-50, -10)`);
    treeLayout(root);

    type PackNode = d3.HierarchyCircularNode<ChartDatum>;

    nodeRef.current = graph
      .selectAll<SVGCircleElement, PackNode>("circle")
      .data(root.leaves() as PackNode[])
      .join("circle")
      .attr("data-id", d => d.data.i ?? "")
      .attr("r", d => d.r)
      .attr("fill", d => d.parent?.data.color ?? "#ccc")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .on("mouseenter", (event: MouseEvent, d) => {
        const el = event.target as HTMLElement;
        el.style.transition = "stroke 1.5s";
        el.setAttribute("stroke", "#c13119");
        const population = si((d.value ?? 0) * worldContext.populationRate * worldContext.urbanization);
        if (infoRef.current) {
          infoRef.current.textContent = `${d.data.name}. ${d.parent?.data.name}. Population: ${population}`;
        }
        if (d.data.i != null) burgHighlightOn(d.data.i);
        tip("Click to zoom into view");
      })
      .on("mouseleave", (event: MouseEvent) => {
        burgHighlightOff();
        if (infoRef.current) infoRef.current.textContent = "‍";
        const el = event.target as HTMLElement;
        el.style.transition = "";
        el.removeAttribute("stroke");
        tip("");
      })
      .on("click", (_event, d) => zoomTo(d.data.x ?? 0, d.data.y ?? 0, 8, 2000));

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
      svgRef.current = null;
      nodeRef.current = null;
    };
  }, [config, w, h, width, height, getBaseData]);

  // Update chart when grouping changes (after initial render)
  useEffect(() => {
    if (!nodeRef.current || !config) return;

    const base = getBaseData(grouping);
    burgsRef.current.forEach(b => {
      b.id = (b.i ?? 0) + base.length - 1;
    });

    const chartData: ChartDatum[] = [...base, ...burgsRef.current];
    const treeLayout = d3.pack<ChartDatum>().size([w, h]).padding(3);

    const newRoot = d3
      .stratify<ChartDatum>()
      .id(d => String(d.id))
      .parentId(d => (getValue(d, grouping) != null ? String(getValue(d, grouping)) : null))(chartData)
      .sum(d => d.population ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    type PackNode = d3.HierarchyCircularNode<ChartDatum>;
    nodeRef.current
      .data(treeLayout(newRoot).leaves() as PackNode[])
      .transition()
      .duration(2000)
      .attr("data-id", d => d.data.i ?? "")
      .attr("fill", d => d.parent?.data.color ?? "#ccc")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r);
  }, [grouping, config, w, h, getBaseData, getValue]);

  const handleClose = () => closeDialog(DIALOG_ID);

  if (!config) return null;

  return (
    <Dialog
      isOpen={true}
      title={t("dialogs.titles.burgsChart")}
      onClose={handleClose}
      buttons={[{ label: "Close", onClick: handleClose }]}
    >
      <div>
        <select value={grouping} onChange={e => setGrouping(e.target.value as GroupingType)} className="d-block">
          <option value="states">Group by state</option>
          <option value="cultures">Group by culture</option>
          <option value="parent">Group by province and state</option>
          <option value="provinces">Group by province</option>
        </select>
        <div ref={infoRef} className="chartInfo">
          &#8205;
        </div>
        <div ref={containerRef} />
      </div>
    </Dialog>
  );
};
