import type { WebglPickCandidatesDetail, WebglPickDetail } from "./webglPicking";

declare global {
  interface DocumentEventMap {
    "react-tool-action": CustomEvent<{ action: string }>;
    "fmg:webgl-map-hover": CustomEvent<WebglPickDetail | null>;
    "fmg:webgl-map-pick": CustomEvent<WebglPickDetail | null>;
    "fmg:webgl-map-pick-candidates": CustomEvent<WebglPickCandidatesDetail>;
    "fmg:webgl-map-pick-candidate-selected": CustomEvent<WebglPickDetail>;
  }
}
