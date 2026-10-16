import { useLayerState } from "../store/layerState";

/** Whether a map layer is currently shown. View state: the simulation core must not read it. */
export const layerIsOn = (layer: string): boolean => {
  return useLayerState.getState().activeLayers[layer] === true;
};
