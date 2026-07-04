import { color, easeSinInOut, transition } from "d3";
import type { AppServices } from "../context/appServices";
import type { FocusFields, SettlementLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Military } from "../generators/military-generator";
import type { MilitaryRegiment } from "../types/models";
import { rn } from "../utils";
import { TIME } from "../utils/debug";
import type { IRenderer } from "./core/IRenderer";

export const MilitaryRenderer = {
  id: "military",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<SettlementLayers & FocusFields>,
    appServices: AppServices
  ): void {
    TIME && console.time("MilitaryRenderer");
    const { pack } = worldContext;
    const { armies, focusScope } = viewContext;

    armies.selectAll("g").remove();
    pack.states
      .filter(s => s.i && !s.removed && (!focusScope || s.i === focusScope.stateId))
      .forEach(s => {
        drawRegiments(worldContext, viewContext, appServices, s.military || [], s.i);
      });

    TIME && console.timeEnd("MilitaryRenderer");
  },

  clear(viewContext: Readonly<SettlementLayers>): void {
    viewContext.armies.selectAll("g").remove();
  },

  updateArmyColor(
    viewContext: Readonly<SettlementLayers>,
    stateId: number,
    solidColor: string,
    darkerColor: string
  ): void {
    const army = viewContext.armies.select(`#army${stateId}`);
    if (army.empty()) return;
    army.attr("fill", solidColor);
    army.selectAll("g > rect:nth-of-type(2)").attr("fill", darkerColor);
  },

  removeStateArmy(viewContext: Readonly<SettlementLayers>, stateId: number): void {
    viewContext.armies.select(`#army${stateId}`).remove();
  }
} satisfies IRenderer;

export const drawRegiments = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<SettlementLayers>,
  _appServices: AppServices,
  regiments: MilitaryRegiment[],
  s: number
): void => {
  const { pack } = worldContext;
  const { armies } = viewContext;
  const size = +armies.attr("box-size");
  const w = (d: MilitaryRegiment) => (d.n ? size * 4 : size * 6);
  const h = size * 2;
  const x = (d: MilitaryRegiment) => rn(d.x - w(d) / 2, 2);
  const y = (d: MilitaryRegiment) => rn(d.y - size, 2);

  const stateColor = pack.states[s]?.color;
  const baseColor = stateColor && stateColor[0] === "#" ? stateColor : "#999";
  const darkerColor = color(baseColor)!.darker().formatHex();
  const army = armies.append("g").attr("id", `army${s}`).attr("fill", baseColor).attr("color", darkerColor);

  const g = army
    .selectAll("g")
    .data(regiments)
    .enter()
    .append("g")
    .attr("id", d => `regiment${s}-${d.i}`)
    .attr("data-name", d => d.name)
    .attr("data-state", s)
    .attr("data-id", d => d.i)
    .attr("transform", d => (d.angle ? `rotate(${d.angle})` : null))
    .attr("transform-origin", d => `${d.x}px ${d.y}px`);
  g.append("rect")
    .attr("x", d => x(d))
    .attr("y", d => y(d))
    .attr("width", d => w(d))
    .attr("height", h);
  g.append("text")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .attr("text-rendering", "optimizeSpeed")
    .text(d => Military.getTotal(d));
  g.append("rect")
    .attr("fill", "currentColor")
    .attr("x", d => x(d) - h)
    .attr("y", d => y(d))
    .attr("width", h)
    .attr("height", h);
  g.append("text")
    .attr("class", "regimentIcon")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", d => x(d) - size)
    .attr("y", d => d.y)
    .text(d => (d.icon!.startsWith("http") || d.icon!.startsWith("data:image") ? "" : d.icon!));
  g.append("image")
    .attr("class", "regimentImage")
    .attr("x", d => x(d) - h)
    .attr("y", d => y(d))
    .attr("height", h)
    .attr("width", h)
    .attr("href", d => (d.icon!.startsWith("http") || d.icon!.startsWith("data:image") ? d.icon! : ""));
};

export const drawRegiment = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<SettlementLayers>,
  _appServices: AppServices,
  reg: MilitaryRegiment,
  stateId: number
): void => {
  const { pack } = worldContext;
  const { armies } = viewContext;
  const size = +armies.attr("box-size");
  const w = reg.n ? size * 4 : size * 6;
  const h = size * 2;
  const x1 = rn(reg.x - w / 2, 2);
  const y1 = rn(reg.y - size, 2);

  let army = armies.select<SVGGElement>(`g#army${stateId}`);
  if (!army.size()) {
    const stateColor = pack.states[stateId]?.color;
    const baseColor = stateColor && stateColor[0] === "#" ? stateColor : "#999";
    const darkerColor = color(baseColor)!.darker().formatHex();
    army = armies.append("g").attr("id", `army${stateId}`).attr("fill", baseColor).attr("color", darkerColor);
  }

  const g = army
    .append("g")
    .attr("id", `regiment${stateId}-${reg.i}`)
    .attr("data-name", reg.name)
    .attr("data-state", stateId)
    .attr("data-id", reg.i)
    .attr("transform", `rotate(${reg.angle || 0})`)
    .attr("transform-origin", `${reg.x}px ${reg.y}px`);
  g.append("rect").attr("x", x1).attr("y", y1).attr("width", w).attr("height", h);
  g.append("text")
    .attr("x", reg.x)
    .attr("y", reg.y)
    .attr("text-rendering", "optimizeSpeed")
    .text(Military.getTotal(reg));
  g.append("rect")
    .attr("fill", "currentColor")
    .attr("x", x1 - h)
    .attr("y", y1)
    .attr("width", h)
    .attr("height", h);
  g.append("text")
    .attr("class", "regimentIcon")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", x1 - size)
    .attr("y", reg.y)
    .text(reg.icon!.startsWith("http") || reg.icon!.startsWith("data:image") ? "" : reg.icon!);
  g.append("image")
    .attr("class", "regimentImage")
    .attr("x", x1 - h)
    .attr("y", y1)
    .attr("height", h)
    .attr("width", h)
    .attr("href", reg.icon!.startsWith("http") || reg.icon!.startsWith("data:image") ? reg.icon! : "");
};

// move one regiment to another
export const moveRegiment = (
  _worldContext: Readonly<WorldContext>,
  viewContext: Readonly<SettlementLayers>,
  _appServices: AppServices,
  reg: MilitaryRegiment,
  x: number,
  y: number
): void => {
  const { armies } = viewContext;
  const el = armies.select(`g#army${reg.state}`).select(`g#regiment${reg.state}-${reg.i}`);
  if (!el.size()) return;

  const duration = Math.hypot(reg.x - x, reg.y - y) * 8;
  reg.x = x;
  reg.y = y;
  const size = +armies.attr("box-size");
  const w = reg.n ? size * 4 : size * 6;
  const h = size * 2;
  const x1 = (x: number) => rn(x - w / 2, 2);
  const y1 = (y: number) => rn(y - size, 2);

  const move = transition().duration(duration).ease(easeSinInOut);
  el.select("rect").transition(move).attr("x", x1(x)).attr("y", y1(y));
  el.select("text").transition(move).attr("x", x).attr("y", y);
  el.selectAll("rect:nth-of-type(2)")
    .transition(move)
    .attr("x", x1(x) - h)
    .attr("y", y1(y));
  el.select(".regimentIcon")
    .transition(move)
    .attr("x", x1(x) - size)
    .attr("y", y)
    .attr("height", "6")
    .attr("width", "6");
  el.select(".regimentImage")
    .transition(move)
    .attr("x", x1(x) - h)
    .attr("y", y1(y))
    .attr("height", "6")
    .attr("width", "6");
};
