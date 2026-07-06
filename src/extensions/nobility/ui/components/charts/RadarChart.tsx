import * as d3 from "d3";
import type React from "react";
import { useEffect, useRef } from "react";

export interface RadarData {
  axis: string;
  value: number;
}

export interface RadarChartProps {
  data: RadarData[];
  width?: number;
  height?: number;
  maxValue?: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({ data, width = 320, height = 320, maxValue = 100 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const margin = { top: 50, right: 50, bottom: 50, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const radius = Math.min(w / 2, h / 2);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("transform", `translate(${width / 2}, ${height / 2})`);

    const total = data.length;
    const angleSlice = (Math.PI * 2) / total;

    const rScale = d3.scaleLinear().range([0, radius]).domain([0, maxValue]);

    const levels = 5;
    const axisGrid = g.append("g").attr("class", "axisWrapper");

    // Draw grid polygons
    for (let j = 1; j <= levels; j++) {
      const levelFactor = radius * (j / levels);

      axisGrid
        .selectAll(`.levels-${j}`)
        .data(data)
        .enter()
        .append("line")
        .attr("x1", (_d, i) => levelFactor * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y1", (_d, i) => levelFactor * Math.sin(angleSlice * i - Math.PI / 2))
        .attr("x2", (_d, i) => levelFactor * Math.cos(angleSlice * ((i + 1) % total) - Math.PI / 2))
        .attr("y2", (_d, i) => levelFactor * Math.sin(angleSlice * ((i + 1) % total) - Math.PI / 2))
        .style("stroke", "var(--text-color, #ccc)")
        .style("stroke-opacity", "0.3")
        .style("stroke-dasharray", "2,2");
    }

    // Value labels on the top axis
    axisGrid
      .selectAll(".axisLabel")
      .data(d3.range(1, levels + 1).reverse())
      .enter()
      .append("text")
      .attr("class", "axisLabel")
      .attr("x", 4)
      .attr("y", d => -radius * (d / levels))
      .attr("dy", "0.4em")
      .style("font-size", "10px")
      .style("fill", "var(--text-color, #ccc)")
      .style("opacity", 0.6)
      .text(d => Math.round((maxValue * d) / levels));

    // Axes lines
    const axis = axisGrid.selectAll(".axis").data(data).enter().append("g").attr("class", "axis");

    axis
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (_d, i) => rScale(maxValue) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y2", (_d, i) => rScale(maxValue) * Math.sin(angleSlice * i - Math.PI / 2))
      .style("stroke", "var(--text-color, #ccc)")
      .style("stroke-opacity", "0.3");

    // Labels
    axis
      .append("text")
      .attr("class", "legend")
      .style("font-size", "11px")
      .style("fill", "var(--text-color, #333)")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("x", (_d, i) => rScale(maxValue * 1.25) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("y", (_d, i) => rScale(maxValue * 1.25) * Math.sin(angleSlice * i - Math.PI / 2))
      .text(d => d.axis);

    // Radar chart polygon
    const radarLine = d3
      .lineRadial<RadarData>()
      .angle((_d, i) => i * angleSlice)
      .radius(d => rScale(d.value))
      .curve(d3.curveLinearClosed);

    const blobWrapper = g.append("g").attr("class", "radarWrapper");

    blobWrapper
      .append("path")
      .datum(data)
      .attr("class", "radarArea")
      .attr("d", radarLine)
      .style("fill", "none")
      .style("stroke", "var(--active-color, #007bff)")
      .style("stroke-width", 2);

    // Points
    blobWrapper
      .selectAll(".radarCircle")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "radarCircle")
      .attr("r", 4)
      .attr("cx", (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
      .attr("cy", (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
      .style("fill", "var(--active-color, #007bff)")
      .style("fill-opacity", 0.8)
      .append("title")
      .text(d => `${d.axis}: ${d.value}`);

    // Value Labels
    blobWrapper
      .selectAll(".radarValueLabel")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "radarValueLabel")
      .style("font-size", "10px")
      .style("fill", "var(--active-color, #007bff)")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("x", (d, i) => {
        // Position slightly outside the data point, but for high values (>=90) position inside to avoid overlapping with axis labels
        const offsetRadius = d.value >= 90 ? rScale(d.value) - 14 : rScale(d.value) + 14;
        return offsetRadius * Math.cos(angleSlice * i - Math.PI / 2);
      })
      .attr("y", (d, i) => {
        const offsetRadius = d.value >= 90 ? rScale(d.value) - 14 : rScale(d.value) + 14;
        return offsetRadius * Math.sin(angleSlice * i - Math.PI / 2);
      })
      .text(d => d.value);
  }, [data, width, height, maxValue]);

  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
      <svg ref={svgRef} width={width} height={height} style={{ overflow: "visible" }}>
        <title>Radar Chart</title>
      </svg>
    </div>
  );
};
