# Medieval town house footprints

Research checked on 2026-10-19 for CE's shared SVG / 3D building geometry.

## Evidence collected

| Source | Observed form and relevance |
| --- | --- |
| [Bernhard Flüge, *Domus solaratae*, houses of 1090–1136 in Cluny, Max Planck Research Library](https://www.mprl-series.mpg.de/studies/6/5/index.html) | Measured plans and reconstructions describe compact rectangular town-house cores, practical setting-out of right angles, and a roughly 2:1 house clipped to a trapezoid by the street. A mildly skewed four-wall house is plausible; an exact rectangle is not mandatory. |
| [English Heritage, Medieval Merchant's House, Southampton](https://www.english-heritage.org.uk/visit/places/medieval-merchants-house/) | Begun around 1290 and restored to its mid-fourteenth-century appearance. Home, workplace and shop share a building. Ordinary street housing should support a substantial built volume rather than equating the whole property with a garden plot. |
| [Historic England, Moorhouse Farm, Boxted, 1485365](https://historicengland.org.uk/listing/the-list/list-entry/1485365) | A late-fifteenth-century cross-wing about 5 × 15 m and a later hall about 7 × 13.7 m form an L. This is a high-status, multi-period example, not a universal urban house model. It illustrates that complex plans can be assemblies of simple rectangular roofed ranges. |
| [Historic Coventry Trust, Burges and Hales Street](https://www.historiccoventrytrust.org.uk/visit/burges-and-hales-street/) | Medieval street-front shops and houses have narrow strips of outbuildings and gardens behind. This historical burgage pattern is real, but intentionally excluded from this task's dense urban-block treatment. |
| [*Framework and form: burgage plots, street lines and domestic architecture in early urban Scotland*, Urban History](https://www.cambridge.org/core/journals/urban-history/article/framework-and-form-burgage-plots-street-lines-and-domestic-architecture-in-early-urban-scotland/4FC18665945BC7A9144C4C9165838A5A) | Plot boundaries and buildings evolve independently; subdivision, backland buildings, courtyard access and changes to street lines produce more than one settlement pattern. The Linlithgow example includes a passage and courtyard behind its street frontage. |

These examples support rectangular cores, modest trapezoids, and separate roofed
ranges around small shared spaces. They do not establish a universal footprint
for all medieval Europe, nor a historical numerical angle or aspect-ratio rule.

## CE implementation choices

- Ordinary dense perimeter houses keep rectangles and modestly skewed four-wall
  plans, including trapezoids along angled block boundaries. Corner angles must
  remain within 60–120 degrees, and opposite wall lengths must retain at least
  40% of each other. Narrow wedge tips still fall back to a fitted rectangle.
  These numerical limits are generation heuristics, not historical rules.
- The supplied aerial photograph `temp/000.savdata/circulade-de-bram-960x640.jpg`
  shows adjoining houses adapting to curved blocks with slightly skewed corners.
  Retaining these usable four-sided parcels fills the long-side gaps left by
  forcing every house into a rectangle.
- Four-wall pitched roofs use the same two ridge endpoints for both slopes.
  The ridge joins the midpoints of opposing end walls and is shortened for hips.
  This closes trapezoidal gables without independently projected, mismatched
  ridge subdivisions. Roof rise remains capped at 4 m for ordinary houses.
- Shallow kinks on a five-or-more-sided parcel are replaced by internal chords
  before deciding whether it is a usable quadrilateral. Boundary movement is
  limited to 0.25 m, the direction change to 20 degrees, and total area loss to
  2%. Shared row cuts remain unchanged. This avoids rotating one house because
  a street bend introduces a tiny fifth edge (the shared city cell f48 case).
- Rectangle fallback also receives the row axis and favours matching wall
  directions when choosing between usable street-aligned candidates.
- A bevelled, acute or excessively elongated parcel is fitted with a rectangle
  on one of its actual street edges. Independent end trims maximize usable
  floor area. The search is bounded and deterministic, independent of occupancy.
- Minimum sides are 2.5 m, with 3.5 m retained for a fitted primary-street facade;
  maximum wall-length ratio is 5:1. These are generation heuristics, not claims
  about historical construction limits.
- Row partition quality measures the usable house. A triangular remainder no
  longer forces repeated merges into a huge distorted corner house. Unusable
  tips remain open, while useful adjoining parcels are still occupied.
- Coverage continues to allocate the shared central space for the complete
  block. This does not introduce repeated long residential plots with their
  rear halves reserved as gardens. Vacant plots still follow occupancy settings.
- Organic subdivision scores prefer more nearly perpendicular street junctions,
  reducing awkward residual blocks before building placement. Streets remain
  connected cuts through their parent parcel.
- The fitted polygon is generated before SVG rendering, residential capacity
  allocation and massing. SVG and 3D therefore use the same footprint; no 3D-only
  silhouette replacement or roof fallback is added.

## Validation

Geometry regressions cover retained rectangles and skewed plans, bevels, acute
triangular blocks, rotation, both vertex orders, containment, non-overlap, dense
coverage and open tips. The triangular-block case also checks pitched roof
assignment and finite, closed 3D wall/roof meshes. Existing block and medieval
fabric tests cover the street and parcel integration.

The oblique-block regression checks that both formerly empty long-side corners
are occupied, while the triangular-block regression still leaves its pointed tip
open. Skewed gable, hip and pyramid meshes are checked with rotated/reversed
footprints and jettied upper floors.

The three kinked parcels around shared city cell f48 are regression fixtures.
They retain their shared row cuts and more than 98% of their area, remain inside
their original parcels, and produce closed roofs with reversed/rotated input.
