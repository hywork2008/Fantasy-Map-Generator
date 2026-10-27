# Modular river bridges in BV and CE

## Result

BV task 47 provides a 96 m masonry arch bridge, a 600 m masonry example, a 72 m timber trestle bridge, and a 96 m bridge with a central lifting span. CE uses the same procedural assembly directly. Bay count grows with crossing length; the complete model is not stretched. Regular bays and supports share geometry buffers through `InstancedMesh`.

The high model includes masonry arch rings, cutwaters, stone courses, parapets and deck joints, or timber planks, rails, piles and bracing. Low quality retains the overall structure with fewer details. Lifting spans have an unobstructed central navigation opening and are shown closed; there is no opening animation.

## Placement

- Prefer valid surveyed FMG fixed crossings, then frame-road bridge pieces, river connections, and local CE bridge decks. Merge duplicate spans and replace coarse bridge structures only after a detailed bridge is built.
- Preserve source endpoints and straight plan axes. Reject bent spans and skews beyond the shared period/material/technology policy, with an absolute maximum of 30 degrees.
- Choose masonry for main roads and timber for other land routes through the shared route-material policy.
- Set foundations below the rendered water, keep supports vertical, and grade the deck between bank heights. Raise the last portion of saved approach paths onto the deck without rerouting them.
- Rebuild on terrain, water, road and quality changes; release instance, geometry and material resources on replacement/disposal. Support picking individual repeated parts.
- BV orthographic drawings now project all `InstancedMesh` instances.

## Verification

- `MEDIEVAL_MODEL_TASK=47 npx vitest run src/buildings/bridges/modularBridge.test.ts src/buildings/medieval/modelContracts.test.ts`: 14 passed.
- `npx vitest run src/city3d/three/bridgeMeshes.test.ts`: 4 passed.
- `src/city-editor/renderers/cityViewRendering.test.ts` and `src/building-viewer/wikipedia.test.ts`: 4 passed.
- `npx tsc --noEmit --pretty false`: passed.
- Biome checks of all nine changed/new TypeScript files and `git diff --check`: passed.
- Chromium/WebGL: all four BV models and the FMG Fontaliano crossing render without page errors; CE reports high quality. Screenshots are local regeneration artifacts under `temp/modular-bridge-bv-*.png` and `temp/modular-bridge-ce-*.png`.
- Regression checks cover a 1 km bridge with 84 repeated bays and constant mesh/buffer counts, real arch openings, nonmultiple lengths and sloping banks, a clear movable opening, resource disposal, duplicate suppression, rejected surveyed data, skew limits and the approximately 635 m Fontaliano bridge over a 632.8 m river.

## Existing input limitation

The legacy Fontaliano fixture has a bridge endpoint outside its CE frame and surveyed water coverage. The full bridge now renders, but part of it extends beyond the existing ground/water rendering domain. This implementation preserves the supplied river footprint and does not invent surveyed water outside its coverage. A source export covering both banks is required for a continuous surrounding landscape in that legacy case. The fixed-crossing regression uses a 604 m deck with both banks inside the validated coverage and confirms deck/approach continuity.
