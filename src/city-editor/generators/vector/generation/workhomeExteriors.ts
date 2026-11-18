import { opusWorkhomeHeight } from "../../../../buildings/medieval/opusWorkhome";
import {
  OPUS_WORKHOME_FRONTS,
  OPUS_WORKHOME_PRESET_ENVELOPES,
  type OpusWorkhomeExterior,
  opusWorkhomeModel,
  opusWorkhomeSpecKey,
  opusWorkhomeSpecOf,
  opusWorkhomeStoreys
} from "../../../../buildings/medieval/opusWorkhomeProfiles";
import { growthRandom } from "../../../../utils/urbanMorphology";
import type { VectorCityDocument } from "../../../types/vector/document";
import { nearestOnPolyline } from "../../geom";
import { vectorTownCulture, vectorTownProfile } from "./housingCulture";

/** Shares of the drawn street fronts (provisional, plan §8): shutters open, a door left ajar, a signboard hung. */
const OPEN_SHOP = 0.7;
const AJAR_DOOR = 0.2;
const SIGNBOARD = 0.7;
/** Sites closer than this share a party wall. */
const TOUCH_METERS = 0.3;

const ring = (outer: readonly [number, number][]) => [...outer, outer[0]];
function touching(a: readonly [number, number][], b: readonly [number, number][]) {
  const box = (r: readonly [number, number][]) => [
    Math.min(...r.map(p => p[0])),
    Math.min(...r.map(p => p[1])),
    Math.max(...r.map(p => p[0])),
    Math.max(...r.map(p => p[1]))
  ];
  const [ax0, ay0, ax1, ay1] = box(a),
    [bx0, by0, bx1, by1] = box(b);
  if (ax0 > bx1 + TOUCH_METERS || bx0 > ax1 + TOUCH_METERS || ay0 > by1 + TOUCH_METERS || by0 > ay1 + TOUCH_METERS)
    return false;
  return (
    a.some(p => nearestOnPolyline(p, ring(b)).dist < TOUCH_METERS) ||
    b.some(p => nearestOnPolyline(p, ring(a)).dist < TOUCH_METERS)
  );
}

/**
 * Give each generated trade workhome its street front (docs/plan/bv-workhome-facade-variation.md §4.5, W3): the
 * town's culture, and per facility the street face, storeys, shutters, door, sign and shade from its own draw, so a
 * save draws the same town again. Two workhomes sharing a party wall never show the same front. The placement keeps
 * its envelope and door; only its saved height follows the model.
 */
export function dressWorkhomes(doc: VectorCityDocument, ids: readonly string[]) {
  const culture = vectorTownCulture(vectorTownProfile(doc)),
    period = doc.context.historicalPeriod,
    faceFixed = OPUS_WORKHOME_FRONTS[culture].face,
    dressed: { outer: [number, number][]; key: string }[] = [];
  for (const id of ids) {
    const p = doc.placements[id],
      model = p && opusWorkhomeModel(p.modelId);
    if (!model || p.origin !== "automatic" || p.building?.kind !== "facility") continue;
    // A workhome fitted to its burgage plot keeps the plot's envelope and its door side (W4).
    const fit = p.exterior?.widthMeters
        ? { widthMeters: p.exterior.widthMeters, depthMeters: p.exterior.depthMeters, mirror: p.exterior.mirror }
        : {},
      r = (k: string) => growthRandom(`workhome-exterior:${id}:${k}`),
      width = fit.widthMeters ?? OPUS_WORKHOME_PRESET_ENVELOPES[model.form][0];
    const exterior: OpusWorkhomeExterior = {
      ...fit,
      culture,
      entranceFace: faceFixed ?? (r("face") < 0.5 ? "gable" : "eave"),
      storeys: opusWorkhomeStoreys(period, width, r("storeys")),
      shop: r("shop") < OPEN_SHOP ? "open" : "closed",
      door: r("door") < AJAR_DOOR ? "ajar" : "closed",
      sign: r("sign") < SIGNBOARD ? "board" : "none",
      shade: Math.min(2, Math.floor(r("shade") * 3)) as 0 | 1 | 2
    };
    for (const k of ["widthMeters", "depthMeters", "mirror"] as const)
      if (exterior[k] === undefined) delete exterior[k];
    const neighbours = dressed.filter(d => touching(d.outer, p.site.outer)).map(d => d.key),
      keyOf = (e: OpusWorkhomeExterior) => opusWorkhomeSpecKey(opusWorkhomeSpecOf(p.modelId, e)!);
    // The next front in a fixed order: the street face, then the shade, then the shutters.
    for (let step = 0; step < 6 && neighbours.includes(keyOf(exterior)); step++)
      if (step === 0 && !faceFixed) exterior.entranceFace = exterior.entranceFace === "gable" ? "eave" : "gable";
      else if (step < 4) exterior.shade = ((exterior.shade + 1) % 3) as 0 | 1 | 2;
      else exterior.shop = exterior.shop === "open" ? "closed" : "open";
    p.exterior = exterior;
    const height = opusWorkhomeHeight(opusWorkhomeSpecOf(p.modelId, exterior)!);
    p.building.heightMeters = height;
    if (p.display) p.display.heightMeters = height;
    dressed.push({ outer: p.site.outer, key: keyOf(exterior) });
  }
}
