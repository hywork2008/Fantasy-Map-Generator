import {
  axisBottom,
  axisLeft,
  curveBasis,
  line as d3Line,
  type NumberValue,
  pointer,
  scaleLinear,
  scaleTime,
  select,
  timeFormat
} from "d3";
import type React from "react";
import { useEffect, useRef } from "react";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { convertTemperature, round } from "../../utils";
import { rn } from "../../utils/numberUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface TemperatureGraphConfig {
  [key: string]: unknown;
  burgName: string;
  chartWidth: number;
  chartHeight: number;
  xOffset: number;
  yOffset: number;
  tempMean: [number, number][];
  tempMin: [number, number][];
  tempMax: [number, number][];
  minT: number;
  maxT: number;
  months: string[];
  burgTemp: number;
}

const DIALOG_ID = "temperatureGraph";

export const TemperatureGraphDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as TemperatureGraphConfig | undefined;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config || !containerRef.current) return;

    const { chartWidth, chartHeight, xOffset, yOffset, tempMean, tempMin, tempMax, minT, maxT, months } = config;

    const year = new Date().getFullYear();
    const xscale = scaleTime()
      .domain([new Date(year, 0, 1), new Date(year, 11, 31)])
      .range([0, chartWidth]);
    const yscale = scaleLinear().domain([minT, maxT]).range([chartHeight, 0]);

    const getCurve = (data: [number, number][]) => round(d3Line<[number, number]>().curve(curveBasis)(data) ?? "", 2);

    const legendSize = 60;
    const container = containerRef.current;
    container.innerHTML = "";

    const chart = select(container)
      .append("svg")
      .attr("width", chartWidth + 120)
      .attr("height", chartHeight + yOffset + legendSize);

    const legend = chart.append("g");
    const legendY = chartHeight + yOffset + legendSize * 0.8;
    const legendX = (n: number) => (chartWidth * n) / 4;
    const legendTextX = (n: number) => legendX(n) + 10;
    legend.append("circle").attr("cx", legendX(1)).attr("cy", legendY).attr("r", 4).style("fill", "red");
    legend
      .append("text")
      .attr("x", legendTextX(1))
      .attr("y", legendY)
      .attr("alignment-baseline", "central")
      .text("Day temperature");
    legend.append("circle").attr("cx", legendX(2)).attr("cy", legendY).attr("r", 4).style("fill", "orange");
    legend
      .append("text")
      .attr("x", legendTextX(2))
      .attr("y", legendY)
      .attr("alignment-baseline", "central")
      .text("Mean temperature");
    legend.append("circle").attr("cx", legendX(3)).attr("cy", legendY).attr("r", 4).style("fill", "blue");
    legend
      .append("text")
      .attr("x", legendTextX(3))
      .attr("y", legendY)
      .attr("alignment-baseline", "central")
      .text("Night temperature");

    const xGrid = axisBottom(xscale).ticks(undefined).tickSize(-chartHeight);
    const yGrid = axisLeft(yscale).ticks(5).tickSize(-chartWidth);

    const gridEl = chart.append("g").attr("class", "epgrid").attr("stroke-dasharray", "4 1");
    gridEl
      .append("g")
      .attr("transform", `translate(${xOffset}, ${chartHeight + yOffset})`)
      .call(xGrid);
    gridEl.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`).call(yGrid);
    gridEl.selectAll("text").remove();

    if (minT < 0 && maxT > 0) {
      gridEl
        .append("line")
        .attr("x1", xOffset)
        .attr("y1", yscale(0) + yOffset)
        .attr("x2", chartWidth + xOffset)
        .attr("y2", yscale(0) + yOffset)
        .attr("stroke", "gray");
    }

    const xAxis = axisBottom(xscale)
      .ticks(undefined)
      .tickFormat((d: Date | NumberValue) => timeFormat("%B")(d as Date));
    const yAxis = axisLeft(yscale)
      .ticks(5)
      .tickFormat((v: NumberValue) => convertTemperature(+v));

    const axisEl = chart.append("g");
    axisEl
      .append("g")
      .attr("transform", `translate(${xOffset}, ${chartHeight + yOffset})`)
      .call(xAxis);
    axisEl.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`).call(yAxis);
    axisEl.select("path.domain").attr("d", `M0.5,0.5 H${chartWidth + 0.5}`);

    const curves = chart.append("g").attr("fill", "none").style("stroke-width", 2.5);

    function printVal(this: SVGPathElement, event: MouseEvent): void {
      const [x, y] = pointer(event, this);
      const type = this.getAttribute("data-type");
      const temp = convertTemperature(yscale.invert(y - yOffset));
      const month = months[rn(((x - xOffset) / chartWidth) * 12)] || months[0];
      tip(`Average ${type} temperature in ${month}: ${temp}`);
    }

    curves
      .append("path")
      .attr("d", getCurve(tempMean))
      .attr("data-type", "daily")
      .attr("stroke", "orange")
      .on("mousemove", printVal);
    curves
      .append("path")
      .attr("d", getCurve(tempMin))
      .attr("data-type", "night")
      .attr("stroke", "blue")
      .on("mousemove", printVal);
    curves
      .append("path")
      .attr("d", getCurve(tempMax))
      .attr("data-type", "day")
      .attr("stroke", "red")
      .on("mousemove", printVal);
  }, [config]);

  const handleClose = () => closeDialog(DIALOG_ID);

  if (!config) return null;

  return (
    <Dialog
      isOpen={true}
      title={`Average temperature in ${config.burgName}`}
      onClose={handleClose}
      buttons={[{ label: "Close", onClick: handleClose }]}
    >
      <div ref={containerRef} />
    </Dialog>
  );
};
