import type { DistrictFabric } from "../generators/blockInfill.types";
import { applyRuralFields } from "../generators/ruralFields";
import type { CityDocument } from "../types/document";

const scope = globalThis as unknown as {
  onmessage(event: MessageEvent<{ document: CityDocument; fabric: DistrictFabric }>): void;
  postMessage(value: unknown): void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = applyRuralFields(data.document, data.fabric);
    scope.postMessage({ overlay: { farms: result.farms, lanes: result.lanes, ruralFields: result.ruralFields } });
  } catch {
    scope.postMessage({ error: true });
  }
};
