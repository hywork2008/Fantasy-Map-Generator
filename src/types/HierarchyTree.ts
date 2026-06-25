import type * as d3 from "d3";

export interface HierarchyElement {
  i: number;
  name: string;
  code?: string;
  color?: string;
  cells?: number;
  origins: (number | null)[];
  removed?: boolean;
  [key: string]: unknown;
}

export interface HierarchyProps {
  type: string;
  data: HierarchyElement[];
  onNodeEnter: (d: d3.HierarchyPointNode<HierarchyElement>) => void;
  onNodeLeave: (d: d3.HierarchyPointNode<HierarchyElement>) => void;
  getDescription: (element: HierarchyElement) => string;
  getShape: (element: HierarchyElement) => string | undefined;
}
