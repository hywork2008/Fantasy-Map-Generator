import RBush from "rbush";
import { type PlanBox, planBoxCorners } from "../../../buildings/placementContract";

export interface PlotRecord {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  box: PlanBox;
}

export function plotBounds(box: PlanBox): Pick<PlotRecord, "minX" | "minY" | "maxX" | "maxY"> {
  const corners = planBoxCorners(box);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of corners) {
    if (point[0] < minX) minX = point[0];
    if (point[1] < minY) minY = point[1];
    if (point[0] > maxX) maxX = point[0];
    if (point[1] > maxY) maxY = point[1];
  }
  return { minX, minY, maxX, maxY };
}

export function plotRecord(id: string, box: PlanBox): PlotRecord {
  return { id, box, ...plotBounds(box) };
}

export function createPlotIndex() {
  const tree = new RBush<PlotRecord>();
  const byId = new Map<string, PlotRecord>();
  const forget = (record: PlotRecord) => {
    tree.remove(record, (left, right) => left.id === right.id);
    byId.delete(record.id);
  };
  return {
    load(records: readonly PlotRecord[]) {
      const fresh: PlotRecord[] = [];
      for (const record of records) {
        const previous = byId.get(record.id);
        if (previous) forget(previous);
        byId.set(record.id, record);
        fresh.push(record);
      }
      tree.load(fresh);
    },
    insert(record: PlotRecord) {
      const previous = byId.get(record.id);
      if (previous) forget(previous);
      byId.set(record.id, record);
      tree.insert(record);
    },
    remove(id: string) {
      const previous = byId.get(id);
      if (previous) forget(previous);
    },
    /** Plots whose bounds meet `box`. The caller still tests the oriented shape. */
    search(box: PlanBox): PlotRecord[] {
      return tree.search(plotBounds(box));
    },
    get(id: string) {
      return byId.get(id);
    },
    get size() {
      return byId.size;
    }
  };
}

export type PlotIndex = ReturnType<typeof createPlotIndex>;
