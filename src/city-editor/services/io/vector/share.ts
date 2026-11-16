import { Gunzip, gzipSync, strFromU8, strToU8 } from "fflate";
import { isDetachedFabricHouse } from "../../../generators/vector/editing/fabricHouses";
import { isDetachedFabricLinePath } from "../../../generators/vector/editing/fabricLines";
import { removeVectorPath } from "../../../generators/vector/editing/paths";
import { generationFingerprint } from "../../../generators/vector/generation/pipeline";
import {
  matchesVectorUrbanFingerprint,
  VECTOR_URBAN_ALGORITHM
} from "../../../generators/vector/generation/urbanState";
import { vectorWallSettings } from "../../../generators/vector/generation/wallShape";
import { vectorUrbanStages } from "../../../generators/vector/validation/urban";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorGenerationSettings } from "../../../types/vector/generation";
import type { VectorStage, VectorUrbanSettings } from "../../../types/vector/urban";
import { parseVectorDocument, serializeVectorDocument } from "./documentCodec";
export interface VectorRecipe {
  input: VectorCityDocument;
  skeleton: VectorGenerationSettings;
  urban?: VectorUrbanSettings;
}
export type VectorShare =
  | { kind: "fmg-vector-city-share"; version: 1; mode: "document"; document: VectorCityDocument; stage: VectorStage }
  | { kind: "fmg-vector-city-share"; version: 1; mode: "recipe"; recipe: VectorRecipe };
const LIMIT = 8 * 1024 * 1024,
  TOKEN_LIMIT = 1500000;
const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
export function encodeVectorShare(share: VectorShare): string {
  const json = JSON.stringify(share);
  if (strToU8(json).length > LIMIT || !validateShare(share)) throw new Error("vector-share-budget");
  const token = `vector.${base64(gzipSync(strToU8(json)))}`;
  if (token.length > TOKEN_LIMIT) throw new Error("vector-share-budget");
  return token;
}
export function decodeVectorShare(hash: string): VectorShare | null {
  try {
    const token = hash.replace(/^#/, "");
    if (!token.startsWith("vector.") || token.length > TOKEN_LIMIT || !/^[A-Za-z0-9_-]+$/.test(token.slice(7)))
      return null;
    const binary = atob(token.slice(7).replaceAll("-", "+").replaceAll("_", "/")),
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0)),
      chunks: Uint8Array[] = [];
    let length = 0;
    const decoder = new Gunzip(data => {
      length += data.length;
      if (length > LIMIT) throw new Error("vector-share-budget");
      chunks.push(data);
    });
    for (let i = 0; i < bytes.length; i += 1024) decoder.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return validateShare(JSON.parse(strFromU8(result)));
  } catch {
    return null;
  }
}
function validateShare(value: unknown): VectorShare | null {
  if (!value || typeof value !== "object") return null;
  const v = value as VectorShare;
  if (v.kind !== "fmg-vector-city-share" || v.version !== 1) return null;
  if (v.mode === "document") {
    if (Object.keys(v).some(k => !["kind", "version", "mode", "document", "stage"].includes(k))) return null;
    const doc = parseVectorDocument(JSON.stringify(v.document));
    if (
      !doc ||
      !(doc.urban ? vectorUrbanStages(doc.urban.settings.mode) : ["inputs", "skeleton", "regions"]).includes(v.stage)
    )
      return null;
    return { ...v, document: doc };
  }
  if (v.mode !== "recipe" || Object.keys(v).some(k => !["kind", "version", "mode", "recipe"].includes(k))) return null;
  const r = v.recipe;
  if (!r || Object.keys(r).some(k => !["input", "skeleton", "urban"].includes(k))) return null;
  const input = parseVectorDocument(JSON.stringify(r.input)),
    s = r.skeleton,
    u = r.urban;
  if (
    !input?.site ||
    input.urban ||
    input.generation ||
    !s ||
    !["seed", "roadWidthMeters", "clearanceMeters", "branches", "wall"].every(k => Object.hasOwn(s, k)) ||
    Object.keys(s).some(
      k =>
        ![
          "seed",
          "roadWidthMeters",
          "clearanceMeters",
          "branches",
          "wall",
          "wallSides",
          "wallMaterial",
          "innerWall",
          "townMoat",
          "layout",
          "castle",
          "port",
          "wallCoast"
        ].includes(k)
    ) ||
    typeof s.seed !== "string" ||
    s.seed.length > 256 ||
    !Number.isFinite(s.roadWidthMeters) ||
    s.roadWidthMeters <= 0 ||
    s.roadWidthMeters > 50 ||
    !Number.isFinite(s.clearanceMeters) ||
    s.clearanceMeters < 0 ||
    s.clearanceMeters > 30 ||
    !Number.isInteger(s.branches) ||
    s.branches < 0 ||
    s.branches > 24 ||
    !vectorWallSettings(s)
  )
    return null;
  if (
    u &&
    (!["medieval", "medieval-facilities"].includes(u.mode) ||
      !Number.isSafeInteger(u.population) ||
      u.population < 0 ||
      u.population > 220000 ||
      u.houseModelId !== "house:mediterranean" ||
      ![u.laneWidthMeters, u.laneSpacingMeters, u.clearanceMeters].every(Number.isFinite) ||
      u.laneWidthMeters < 1.4 ||
      u.laneWidthMeters > 6 ||
      u.laneSpacingMeters < 15 ||
      u.laneSpacingMeters > 100 ||
      !Number.isInteger(u.maxLanes) ||
      u.maxLanes < 0 ||
      u.maxLanes > 64 ||
      u.clearanceMeters < 0.2 ||
      u.clearanceMeters > 5 ||
      typeof u.allowExpansion !== "boolean" ||
      (u.lotOccupancy !== undefined &&
        (!Number.isFinite(u.lotOccupancy) || u.lotOccupancy < 0.1 || u.lotOccupancy > 1)) ||
      Object.keys(u).some(
        k =>
          ![
            "mode",
            "population",
            "houseModelId",
            "laneWidthMeters",
            "laneSpacingMeters",
            "maxLanes",
            "clearanceMeters",
            "allowExpansion",
            "lotOccupancy"
          ].includes(k)
      ))
  )
    return null;
  return { kind: v.kind, version: 1, mode: "recipe", recipe: { input, skeleton: s, ...(u ? { urban: u } : {}) } };
}
/** Recipe links may discard only unedited engine-owned output. Document links always keep manual geometry. */
export function vectorRecipe(document: VectorCityDocument): VectorRecipe {
  serializeVectorDocument(document);
  const g = document.urban?.baseGeneration ?? document.generation,
    u = document.urban;
  if (!g) throw new Error("vector-recipe-unavailable");
  if (u && (u.inputRevision !== document.revision || !matchesVectorUrbanFingerprint(document, u.adoptedFingerprint)))
    throw new Error("vector-recipe-edited");
  // Replaying a recipe runs the current algorithm, so it would not reproduce older adopted output.
  if (u && u.algorithm !== VECTOR_URBAN_ALGORITHM) throw new Error("vector-recipe-outdated");
  if (
    !u &&
    (document.generation!.inputRevision !== document.revision ||
      generationFingerprint(document, new Set(Object.keys(g.pathRevisions))) !== g.connectionFingerprint)
  )
    throw new Error("vector-recipe-edited");
  const input = structuredClone(document),
    ids = new Set([...Object.keys(g.pathRevisions), ...(u?.ownedPaths ?? [])]);
  if (
    [...ids].some(id => input.paths[id]?.origin !== "automatic" || input.paths[id]?.editPolicy !== "editable") ||
    (u?.ownedPlacements ?? []).some(
      id => input.placements[id]?.origin !== "automatic" || input.placements[id]?.editPolicy !== "editable"
    )
  )
    throw new Error("vector-recipe-edited");
  // Detached, moved or cleared fabric items are user edits a fresh generation cannot replay.
  if (
    Object.values(document.fabric?.cells ?? {}).some(
      c => c.detached.length || c.cleared?.length || c.detachedLines?.length
    ) ||
    Object.values(document.fabric?.districts ?? {}).some(d => d.detachedLines?.length) ||
    Object.values(document.placements).some(isDetachedFabricHouse) ||
    Object.values(document.paths).some(isDetachedFabricLinePath)
  )
    throw new Error("vector-recipe-edited");
  // Fabric and the road nodes it joined are urban output; the recipe input is the graph before urban.
  if (input.fabric && u) {
    delete input.fabric;
    input.connections = structuredClone(u.baseConnections);
  }
  delete input.urban;
  delete input.generation;
  for (const id of u?.ownedPlacements ?? []) delete input.placements[id];
  for (const id of [...ids].sort(
    (a, b) => Number(input.paths[a].role === "wall") - Number(input.paths[b].role === "wall")
  ))
    Object.assign(input, removeVectorPath(input, id));
  serializeVectorDocument(input);
  return { input, skeleton: structuredClone(g.settings), ...(u ? { urban: structuredClone(u.settings) } : {}) };
}
export function vectorShareUrl(share: VectorShare): string {
  return `${location.href.split("#")[0]}#${encodeVectorShare(share)}`;
}
