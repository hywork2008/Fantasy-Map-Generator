/** Browser adapter for the shared, read-only Directions calculator. */
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { computeDirectionsForWorld, type DirectionsOptions, resolveBurgInPack } from "./travelDirectionsCore";

export * from "./travelDirectionsCore";

export function resolveBurg(burgId: number | null | undefined) {
  return resolveBurgInPack(worldContext.pack, burgId);
}

export function computeDirections(
  fromBurgId: number,
  toBurgId: number,
  optionsOrAvoidSea: DirectionsOptions | boolean = false
) {
  return computeDirectionsForWorld(
    {
      pack: worldContext.pack,
      distanceScale: worldContext.distanceScale,
      heightExponent: useOptionsState.getState().heightExponent
    },
    fromBurgId,
    toBurgId,
    optionsOrAvoidSea
  );
}
