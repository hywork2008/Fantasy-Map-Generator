import { extent, polygonContains } from "d3";
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { getPackPolygon, minmax, poissonDiscSampler, rand, rn } from "../utils";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

interface ReliefIcon {
  i: string;
  x: number;
  y: number;
  s: number;
}

export const ReliefIconsRenderer: IRenderer = {
  id: "relief-icons",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & FocusFields>,
    _appServices: AppServices
  ): void {
    TIME && console.time("drawRelief");
    const { pack, biomesData } = worldContext;
    const { terrain, focusScope } = viewContext;

    terrain.selectAll("*").remove();

    const cells = pack.cells;
    const density = Number(terrain.attr("density")) || 0.4;
    const size = 2 * (Number(terrain.attr("size")) || 1);
    const mod = 0.2 * size;
    const relief: ReliefIcon[] = [];

    for (const i of cells.i) {
      if (!isCellInScope(focusScope, i)) continue;
      const height = cells.h[i];
      if (height < 20) continue; // no icons on water
      if (cells.r[i]) continue; // no icons on rivers
      const biome = cells.biome[i];
      if (height < 50 && biomesData.iconsDensity[biome] === 0) continue; // no icons for this biome

      const polygon = getPackPolygon(i, pack) as [number, number][];
      const [minX, maxX] = extent(polygon, p => p[0]) as [number, number];
      const [minY, maxY] = extent(polygon, p => p[1]) as [number, number];

      if (height < 50) placeBiomeIcons();
      else placeReliefIcons();

      function placeBiomeIcons(): void {
        const iconsDensity = biomesData.iconsDensity[biome] / 100;
        const radius = 2 / iconsDensity / density;
        if (Math.random() > iconsDensity * 10) return;

        for (const [cx, cy] of poissonDiscSampler(minX, minY, maxX, maxY, radius)) {
          if (!polygonContains(polygon, [cx, cy])) continue;
          let h = (4 + Math.random()) * size;
          const icon = getBiomeIcon(i, biomesData.icons[biome]);
          if (icon === "#relief-grass-1") h *= 1.2;
          relief.push({
            i: icon,
            x: rn(cx - h, 2),
            y: rn(cy - h, 2),
            s: rn(h * 2, 2)
          });
        }
      }

      function placeReliefIcons(): void {
        const radius = 2 / density;
        const [icon, h] = getReliefIcon(i, height);

        for (const [cx, cy] of poissonDiscSampler(minX, minY, maxX, maxY, radius)) {
          if (!polygonContains(polygon, [cx, cy])) continue;
          relief.push({
            i: icon,
            x: rn(cx - h, 2),
            y: rn(cy - h, 2),
            s: rn(h * 2, 2)
          });
        }
      }

      function getReliefIcon(cellIndex: number, h: number): [string, number] {
        const { pack, grid } = worldContext;
        const temp = grid.cells.temp[pack.cells.g[cellIndex]];
        const type = h > 70 && temp < 0 ? "mountSnow" : h > 70 ? "mount" : "hill";
        const iconSize = h > 70 ? (h - 45) * mod : minmax((h - 40) * mod, 3, 6);
        return [getIcon(type), iconSize];
      }
    }

    // sort relief icons by y+size
    relief.sort((a, b) => a.y + a.s - (b.y + b.s));

    const reliefHTML: string[] = [];
    for (const r of relief) {
      reliefHTML.push(`<use href="${r.i}" x="${r.x}" y="${r.y}" width="${r.s}" height="${r.s}"/>`);
    }
    terrain.html(reliefHTML.join(""));

    TIME && console.timeEnd("drawRelief");

    function getBiomeIcon(cellIndex: number, b: string[]): string {
      const { pack, grid } = worldContext;
      let type = b[Math.floor(Math.random() * b.length)];
      const temp = grid.cells.temp[pack.cells.g[cellIndex]];
      if (type === "conifer" && temp < 0) type = "coniferSnow";
      return getIcon(type);
    }

    function getVariant(type: string): number {
      switch (type) {
        case "mount":
          return rand(2, 7);
        case "mountSnow":
          return rand(1, 6);
        case "hill":
          return rand(2, 5);
        case "conifer":
          return 2;
        case "coniferSnow":
          return 1;
        case "swamp":
          return rand(2, 3);
        case "cactus":
          return rand(1, 3);
        case "deadTree":
          return rand(1, 2);
        default:
          return 2;
      }
    }

    function getOldIcon(type: string): string {
      switch (type) {
        case "mountSnow":
          return "mount";
        case "vulcan":
          return "mount";
        case "coniferSnow":
          return "conifer";
        case "cactus":
          return "dune";
        case "deadTree":
          return "dune";
        default:
          return type;
      }
    }

    function getIcon(type: string): string {
      const set = terrain.attr("set") || "simple";
      if (set === "simple") return `#relief-${getOldIcon(type)}-1`;
      if (set === "colored") return `#relief-${type}-${getVariant(type)}`;
      if (set === "gray") return `#relief-${type}-${getVariant(type)}-bw`;
      return `#relief-${getOldIcon(type)}-1`; // simple
    }
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.terrain.selectAll("*").remove();
  }
};
