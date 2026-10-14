import type { CityDocument, Point } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import type { GenerationObserver } from "../../generationDiagnostics";
import { reportGenerationFailure } from "../../generationDiagnostics";
import { planSkeletonCore } from "./cityCore";
import { buildConformingMesh } from "./conformingMesh";
import { planSkeleton } from "./pipeline";
import { prepareSkeletonRun } from "./toPlan";

export function generateSkeletonPreview(
  source: CityDocument,
  settings: GenerationSettings,
  seed: string,
  step: number,
  observer?: GenerationObserver
): { document: CityDocument | null; overlayPaths: Point[][] } {
  const { inputs } = prepareSkeletonRun(source, settings, seed);
  const document = structuredClone(source);
  document.mesh = { vertices: {}, edges: {}, faces: {} };
  document.featureGroups = [];
  document.gates = [];
  document.elements = [];
  document.defenseCircuits = [];
  document.castles = [];
  document.gridKind = "evolution";
  document.generationSeed = seed;
  delete document.fabric;
  delete document.appearance;
  const closed = (p: Point[]) => [...p, p[0]];
  const overlayPaths: Point[][] = [
    ...inputs.water.map(w => closed(w.polygon)),
    ...inputs.rivers.map(r => r.centerline)
  ];
  if (step === 1) return { document, overlayPaths: [...overlayPaths, ...inputs.roads.map(r => r.path)] };
  const core = planSkeletonCore(inputs);
  if ("reason" in core) {
    reportGenerationFailure(observer, 1, "skeletonCore", core.reason, core.message);
    return { document: null, overlayPaths };
  }
  overlayPaths.push(closed(core.urban));
  if (step === 2) return { document, overlayPaths };
  const result = planSkeleton(inputs, settings, seed);
  const skeleton = result.skeleton ?? result.rejected;
  if (!skeleton) return { document: null, overlayPaths };
  if (skeleton.wall) overlayPaths.push(closed(skeleton.wall.polygon));
  if (step >= 4) overlayPaths.push(...skeleton.routes.filter(r => !r.dropped).map(r => r.path));
  if (step >= 5)
    for (const failure of result.failures)
      reportGenerationFailure(
        observer,
        1,
        "skeletonCheck",
        failure.reason,
        failure.message,
        { skeletonAttempt: failure.attempt + 1 },
        failure.details
      );
  if (step >= 6) {
    if (!result.skeleton) return { document: null, overlayPaths };
    document.mesh = buildConformingMesh(inputs, result.skeleton, seed).mesh;
    for (const face of Object.values(document.mesh.faces)) face.properties.buildable = false;
  }
  return { document, overlayPaths };
}
