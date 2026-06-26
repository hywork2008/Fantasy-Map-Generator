import type * as d3 from "d3";

export const modules: Record<string, unknown> = {};
// biome-ignore lint/suspicious/noExplicitAny: D3 types are complex
export let elSelected: d3.Selection<any, any, any, any> | null = null;
// biome-ignore lint/suspicious/noExplicitAny: Rulers is defined in another module
export let rulers: any = null;

// biome-ignore lint/suspicious/noExplicitAny: D3 types are complex
export function setElSelected<T extends d3.Selection<any, any, any, any> | null>(el: T): T {
  elSelected = el;
  return el;
}

// biome-ignore lint/suspicious/noExplicitAny: Rulers is defined in another module
export function setRulers(r: any) {
  rulers = r;
}
