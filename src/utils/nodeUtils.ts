import { useLayerState } from "../store/layerState";

export const getElementById = <T extends Element = HTMLElement>(id: string): T | null => {
  return document.getElementById(id) as T | null;
};

export const getElementBySelector = <T extends Element = Element>(selector: string): T | null => {
  return document.querySelector(selector) as T | null;
};

export const getElementsBySelector = <T extends Element = Element>(selector: string): NodeListOf<T> => {
  return document.querySelectorAll(selector) as NodeListOf<T>;
};

export const layerIsOn = (layer: string): boolean => {
  return useLayerState.getState().activeLayers[layer] === true;
};

/**
 * Get the composed path of a node (including shadow DOM and window)
 * @param {Node | Window} node - The starting node or window
 * @returns {Array<Node>} - The composed path as an array
 */
type NodeLike = { parentNode?: Node | null; host?: Element; defaultView?: Window | null };
export const getComposedPath = (node: Node | Window): Array<Node | Window> => {
  const n = node as NodeLike;
  let parent: Node | Window | undefined;
  if (n.parentNode) parent = n.parentNode;
  else if (n.host) parent = n.host;
  else if (n.defaultView) parent = n.defaultView;
  if (parent !== undefined) return [node].concat(getComposedPath(parent));
  return [node];
};

/**
 * Generate a unique ID for a given core string
 * @param {string} core - The core string for the ID
 * @param {number} [i=1] - The starting index
 * @returns {string} - The unique ID
 */
export const getNextId = (core: string, i: number = 1): string => {
  while (getElementById(core + i)) i++;
  return core + i;
};

declare global {
  interface Window {
    getComposedPath: typeof getComposedPath;
    getNextId: typeof getNextId;
  }
}
