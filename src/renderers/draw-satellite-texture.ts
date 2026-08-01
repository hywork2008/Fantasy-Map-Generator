import { color as parseColor } from "d3";
import * as THREE from "three";
import {
  abs,
  clamp,
  dot,
  Fn,
  float,
  floor,
  fract,
  If,
  Loop,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  screenUV,
  sin,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4
} from "three/tsl";
import { NodeMaterial, type WebGPURenderer } from "three/webgpu";
import { worldContext } from "../context/worldContext";
import { Biomes } from "../generators/biomes";
import { Rivers } from "../generators/river-generator";
import { type ErosionBakeResult, heightAt } from "./erosion-bake";

let renderTarget: THREE.RenderTarget | null = null;

// biome-ignore lint/suspicious/noExplicitAny: TSL node types are not exported from three/tsl; these helpers are pure GLSL-to-TSL ports always called with the same shapes GLSL used.
type TslNode = any;

// biome id -> satellite albedo and vegetation density
/** Default albedo by catalog code for the standard biomes (catalog definition order). */
const BIOME_SATELLITE: Array<{ color: [number, number, number]; density: number }> = [
  { color: [0.24, 0.58, 0.71], density: 0 }, // marine
  { color: [0.89, 0.78, 0.57], density: 0.02 }, // hotDesert
  { color: [0.75, 0.68, 0.54], density: 0.05 }, // coldDesert
  { color: [0.62, 0.61, 0.34], density: 0.35 }, // savanna
  { color: [0.45, 0.59, 0.25], density: 0.45 }, // grassland
  { color: [0.25, 0.48, 0.18], density: 0.85 }, // tropicalSeasonalForest
  { color: [0.17, 0.4, 0.15], density: 0.9 }, // temperateDeciduousForest
  { color: [0.11, 0.36, 0.13], density: 1 }, // tropicalRainforest
  { color: [0.13, 0.38, 0.15], density: 1 }, // temperateRainforest
  { color: [0.15, 0.3, 0.18], density: 0.85 }, // taiga
  { color: [0.6, 0.57, 0.46], density: 0.12 }, // tundra
  { color: [0.93, 0.95, 0.97], density: 0 }, // glacier
  { color: [0.26, 0.4, 0.23], density: 0.65 }, // wetland
  { color: [0.12, 0.35, 0.16], density: 0.95 }, // centralEuropeanGreatForest
  { color: [0.5, 0.55, 0.28], density: 0.55 }, // mediterraneanWoodlandScrub
  { color: [0.18, 0.32, 0.16], density: 0.88 }, // temperateConiferousForest
  { color: [0.2, 0.34, 0.22], density: 0.8 }, // montaneForest
  { color: [0.55, 0.52, 0.4], density: 0.15 }, // alpineTundra
  { color: [0.15, 0.38, 0.28], density: 0.9 }, // mangrove
  { color: [0.7, 0.62, 0.4], density: 0.2 }, // xericShrubland
  { color: [0.14, 0.36, 0.24], density: 0.95 }, // cloudForest
  { color: [0.42, 0.48, 0.28], density: 0.35 }, // heathMoorland
  { color: [0.18, 0.42, 0.28], density: 0.85 }, // floodedForest
  { color: [0.68, 0.68, 0.38], density: 0.25 }, // coldSteppe
  { color: [0.48, 0.5, 0.22], density: 0.65 }, // tropicalDryForest
  { color: [0.32, 0.38, 0.26], density: 0.4 } // borealPeatland
];

export function getSatelliteBiomeData(biomeId: number, fallbackBiomeId: number) {
  const fallback = BIOME_SATELLITE[fallbackBiomeId] || BIOME_SATELLITE[0];
  const builtIn = BIOME_SATELLITE[biomeId];
  if (builtIn) return builtIn;

  const customColor = parseColor(worldContext.biomesData.color[biomeId])?.rgb();
  if (!customColor) return fallback;

  return {
    color: [customColor.r / 255, customColor.g / 255, customColor.b / 255] as [number, number, number],
    density: fallback.density
  };
}

// R: temperature °C packed as t + 128
// G: moisture (precipitation) capped at 30
// B: grid height 0-100
function buildClimateTexture() {
  const { cellsX, cellsY } = worldContext.grid;
  const { temp, prec, h, c: neighbors } = worldContext.grid.cells;
  const n = temp.length;

  // grid depths are noisy cell-to-cell; smoothing passes over water cells
  let bathy = Float32Array.from(h);
  for (let pass = 0; pass < 3; pass++) {
    const next = Float32Array.from(bathy);
    for (let i = 0; i < n; i++) {
      if (h[i] >= 20) continue;
      let sum = bathy[i];
      let count = 1;
      for (const c of neighbors[i]) {
        if (h[c] < 20) {
          sum += bathy[c];
          count++;
        }
      }
      next[i] = sum / count;
    }
    bathy = next;
  }

  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.max(0, Math.min(255, temp[i] + 128));
    data[i * 4 + 1] = Math.min(prec[i] / 30, 1) * 255;
    data[i * 4 + 2] = Math.min(h[i] >= 20 ? h[i] : bathy[i], 100) * 2.55;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, cellsX, cellsY, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// RGB: satellite albedo of the cell's biome
function buildBiomeTexture() {
  const { cellsX, cellsY } = worldContext.grid;
  const { temp, prec, h } = worldContext.grid.cells;
  const n = temp.length;

  const biomeOfGrid = new Uint8Array(n);
  const assigned = new Uint8Array(n);
  const gridIds = worldContext.pack.cells.g;
  const biomes = worldContext.pack.cells.biomeCode;
  for (let p = 0; p < gridIds.length; p++) {
    const gridId = gridIds[p];
    if (!assigned[gridId]) {
      biomeOfGrid[gridId] = biomes[p];
      assigned[gridId] = 1;
    }
  }

  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const fallbackBiomeId = Biomes.getId(prec[i] + 4, temp[i], h[i], false);
    const biomeId = assigned[i] ? biomeOfGrid[i] : fallbackBiomeId;
    const { color, density } = getSatelliteBiomeData(biomeId, fallbackBiomeId);
    data[i * 4] = color[0] * 255;
    data[i * 4 + 1] = color[1] * 255;
    data[i * 4 + 2] = color[2] * 255;
    data[i * 4 + 3] = density * 255;
  }

  const texture = new THREE.DataTexture(data, cellsX, cellsY, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// accents over the biome albedo
const GOLD = vec3(0.72, 0.66, 0.35); // sun-dried grass patches
const SEDIMENT = vec3(0.45, 0.44, 0.38); // wet stream-bed soil

// material palette
const ROCK_COLOR = vec3(0.55, 0.5, 0.45); // brown-gray mountain rock
const ROCK_DRY = vec3(0.69, 0.52, 0.36); // sun-baked red-brown rock
const CLIFF_COLOR = vec3(0.37, 0.34, 0.32);
const DIRT_COLOR = vec3(0.58, 0.47, 0.34);
const GRAVEL = vec3(0.72, 0.7, 0.64); // cold-shore beaches
const SAND_COLOR = vec3(0.94, 0.87, 0.66);
const SNOW_COLOR = vec3(0.99, 1.0, 1.0);

// water palette: saturated teal ocean, bright turquoise shallows
const LAGOON_WARM = vec3(0.45, 0.86, 0.84); // tropical turquoise shallows
const LAGOON_COLD = vec3(0.42, 0.7, 0.72); // steel-green northern shallows
const SHELF_BLUE = vec3(0.24, 0.58, 0.71); // sunlit continental shelf
const OCEAN_BLUE = vec3(0.15, 0.44, 0.62); // open sea
const ABYSS_BLUE = vec3(0.1, 0.31, 0.48); // deepest ocean
const FOAM_COLOR = vec3(0.97, 1.0, 1.0); // breaking surf

// lake group palette (hues follow the 2D default style); freshwater reads LIGHTER than the ocean
// (the 2D style is a pale periwinkle), not a darker basin
const FRESH_DEEP = vec3(0.3, 0.58, 0.86); // freshwater basin
const FRESH_RIM = vec3(0.65, 0.76, 0.97); // #a6c1fd shallow rim
const SALT_WATER = vec3(0.27, 0.6, 0.54); // #409b8a mineral teal
const SALT_CRUST = vec3(0.93, 0.91, 0.85); // evaporite shore rim
const SINKHOLE_RIM = vec3(0.36, 0.79, 0.99); // #5bc9fd cenote cyan
const SINKHOLE_DEEP = vec3(0.12, 0.34, 0.6);
const DRY_BED = vec3(0.79, 0.75, 0.65); // #c9bfa7 clay pan
const DRY_RIM = vec3(0.61, 0.56, 0.47); // damp fringe
const LAVA_CRUST = vec3(0.14, 0.1, 0.09); // cooled basalt
const LAVA_RED = vec3(0.56, 0.15, 0.05); // #90270d dull crust red
const LAVA_GLOW = vec3(0.98, 0.36, 0.08); // #f93e0c crack glow
const ICE_COLOR = vec3(0.8, 0.83, 0.91); // #cdd4e7 frozen lid

const ROCK_SLOPE_LO = 0.65; // tan(slope) where bare rock starts breaking through
const ROCK_SLOPE_HI = 1.35; // tan(slope) of solid rock cover
const CLIFF_SLOPE = 2.2; // near-vertical faces darken further
const SAND_BAND = 0.022; // beach thickness above the water surface, height units

const hash12 = Fn(([p]: [TslNode]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

const vnoise = Fn(([pIn]: [TslNode]) => {
  const p = vec2(pIn).toVar();
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f
    .mul(f)
    .mul(float(3.0).sub(f.mul(2.0)))
    .toVar();
  const a = hash12(i);
  const b = hash12(i.add(vec2(1.0, 0.0)));
  const c = hash12(i.add(vec2(0.0, 1.0)));
  const d = hash12(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

// ~[-0.5, 0.5]
const fbm = Fn(([pIn]: [TslNode]) => {
  const p = vec2(pIn).toVar();
  const value = float(0.0).toVar();
  const amp = float(0.5).toVar();
  Loop(5, () => {
    value.addAssign(vnoise(p).sub(0.5).mul(amp));
    amp.mulAssign(0.55);
    p.assign(p.mul(2.13).add(17.7));
  });
  return value;
});

const decodeHeight = Fn(([t]: [TslNode]) => t.r.mul(65280.0).add(t.g.mul(255.0)).div(65535.0));

function buildSatelliteFragmentNode(
  textures: {
    field: THREE.DataTexture;
    coast: THREE.DataTexture;
    climate: THREE.DataTexture;
    biome: THREE.DataTexture;
  },
  fieldCols: number,
  fieldRows: number,
  uSlopeScaleX: number,
  uSlopeScaleY: number
): TslNode {
  const uFieldTex = texture(textures.field);
  const uCoastTex = texture(textures.coast);
  const uClimateTex = texture(textures.climate);
  const uBiomeTex = texture(textures.biome);
  const uFieldSize = vec2(fieldCols, fieldRows);
  const uGridSize = vec2(worldContext.grid.cellsX, worldContext.grid.cellsY);
  const uSlopeScale = vec2(uSlopeScaleX, uSlopeScaleY);
  const uAspect = worldContext.graphHeight / worldContext.graphWidth;
  const uSeed = float((Number.parseInt(worldContext.seed, 10) % 1e5 || 1) / 1e5 + 1);

  // uField is NearestFilter (the packed 16-bit height must not be hardware-interpolated), so when
  // the output is supersampled past the field size the four neighboring texels are decoded first
  // and mixed after. Returns (height, ridge/gully packed, drainage)
  const fieldAt = Fn(([uvIn]: [TslNode]) => {
    const uv = vec2(uvIn).toVar();
    const p = uv.mul(uFieldSize).sub(0.5).toVar();
    const base = floor(p).toVar();
    const f = p.sub(base).toVar();
    const t0 = base.add(0.5).div(uFieldSize).toVar();
    const t1 = base.add(1.5).div(uFieldSize).toVar();
    const s00 = uFieldTex.sample(t0);
    const s10 = uFieldTex.sample(vec2(t1.x, t0.y));
    const s01 = uFieldTex.sample(vec2(t0.x, t1.y));
    const s11 = uFieldTex.sample(t1);
    const d00 = vec3(decodeHeight(s00), s00.ba);
    const d10 = vec3(decodeHeight(s10), s10.ba);
    const d01 = vec3(decodeHeight(s01), s01.ba);
    const d11 = vec3(decodeHeight(s11), s11.ba);
    return mix(mix(d00, d10, f.x), mix(d01, d11, f.x), f.y);
  });

  const heightAtUv = Fn(([uv]: [TslNode]) => fieldAt(uv).x);

  // Output rows run bottom-up (map bottom at screenUV.y = 0) so the render-target texture drapes
  // onto the mesh uvs like a regular image texture; the baked fields store the map top in row 0,
  // hence the y flip
  const main = Fn(() => {
    const fragUv = screenUV.toVar();
    const uv = vec2(fragUv.x, float(1.0).sub(fragUv.y)).toVar(); // baked-field space: row 0 = map top
    const texel = vec2(1.0).div(uFieldSize);

    const fieldSample = fieldAt(uv).toVar();
    const h = fieldSample.x.toVar();
    const coast = uCoastTex.sample(uv);
    const landFactor = coast.r.toVar();
    const waterSurface = coast.g.mul(2.55).toVar();

    // ridge(+)/gully(-) signal: packed as detail / 0.4 + 0.5, typical |detail| well under 0.1, so
    // amplify into a usable 0..1 ridge/gully pair
    const relief = fieldSample.y.sub(0.5).mul(2.0);
    const ridge = clamp(relief.mul(4.0), 0.0, 1.0).toVar();
    const gully = clamp(relief.negate().mul(4.0), 0.0, 1.0).toVar();
    const drainage = fieldSample.z.toVar();

    // per-texel slope (tan of the steepest angle) from central differences; single FIELD-texel
    // taps on purpose: the baked gullies and ridge walls must register as steep so rock streaks
    // follow the erosion pattern, and sub-field-texel taps on bilinear data would stair-step
    const hL = heightAtUv(uv.sub(vec2(texel.x, 0.0)));
    const hR = heightAtUv(uv.add(vec2(texel.x, 0.0)));
    const hU = heightAtUv(uv.sub(vec2(0.0, texel.y)));
    const hD = heightAtUv(uv.add(vec2(0.0, texel.y)));
    const grad = vec2(hR.sub(hL).mul(0.5).mul(uSlopeScale.x), hD.sub(hU).mul(0.5).mul(uSlopeScale.y)).toVar();
    const slope = length(grad).toVar();

    // breakup noise dithers every material threshold so blend edges read as natural patchiness
    // instead of contour lines; macro adds large-scale tonal variation; patch clusters vegetation
    // into woods and clearings
    const np = vec2(uv.x, uv.y.mul(uAspect));
    const breakup = fbm(np.mul(220.0).add(uSeed.mul(37.0))).toVar();
    const macro = fbm(np.mul(9.0).add(uSeed.mul(53.0))).toVar();
    const patch = fbm(np.mul(38.0).add(uSeed.mul(71.0))).toVar();

    // climate, sampled at cell centers like the bake's heightmap
    const cuv = uv
      .mul(float(1.0).sub(float(1.0).div(uGridSize)))
      .add(float(0.5).div(uGridSize))
      .toVar();
    const climate = uClimateTex.sample(cuv).rgb.toVar();
    const tempC = climate.r.mul(255.0).sub(128.0).add(macro.mul(6.0)).add(breakup.mul(2.0)).toVar();
    const moisture = clamp(climate.g.add(macro.mul(0.08)).add(breakup.mul(0.05)), 0.0, 1.0);

    const warm = smoothstep(2.0, 14.0, tempC); // shore/lagoon character
    const scorch = smoothstep(20.0, 28.0, tempC); // hot rock bakes red

    // biome albedo, sampled with a noise-wobbled uv so zone borders wander off the cell lattice;
    // density = vegetation cover for clumping
    const wobble = vec2(macro, patch).mul(vec2(1.6).div(uGridSize));
    const biome = uBiomeTex.sample(cuv.add(wobble));
    const color = biome.rgb.toVar();
    const density = biome.a.toVar();

    // canopy clumping: dense cover breaks into sunlit and shadowed woods; sparse grassland gets
    // sun-dried golden patches
    const clump = patch.mul(0.6).add(breakup.mul(0.4));
    color.mulAssign(float(1.0).add(clump.mul(0.3).mul(density)));
    const grassy = smoothstep(0.05, 0.3, density).mul(float(1.0).sub(smoothstep(0.5, 0.8, density)));
    color.assign(
      mix(color, GOLD.mul(float(1.0).add(breakup.mul(0.2))), smoothstep(0.15, 0.4, patch).mul(grassy).mul(0.4))
    );
    color.mulAssign(float(1.0).add(macro.mul(0.12)).add(breakup.mul(0.1)));

    // drainage lines read as damp ground: a touch darker and greener, and only the strongest
    // streams pick up a hint of wet sediment; kept off steep walls so carved canyons still show rock
    const riparian = smoothstep(0.1, 0.7, drainage);
    const flatGround = float(1.0)
      .sub(smoothstep(ROCK_SLOPE_LO, ROCK_SLOPE_HI, slope))
      .toVar();
    color.assign(mix(color, color.mul(vec3(0.78, 0.95, 0.72)), riparian.mul(0.5).mul(flatGround)));
    const stream = smoothstep(0.8, 0.97, drainage);
    color.assign(mix(color, SEDIMENT.mul(float(1.0).add(breakup.mul(0.2))), stream.mul(0.25).mul(flatGround)));

    // dirt breaks through on moderate slopes and collects in eroded gullies
    const dirtBlend = smoothstep(ROCK_SLOPE_LO - 0.35, ROCK_SLOPE_LO + 0.15, slope.add(breakup.mul(0.5))).toVar();
    dirtBlend.assign(max(dirtBlend, gully.mul(smoothstep(0.25, 0.6, slope))));
    color.assign(mix(color, DIRT_COLOR.mul(float(1.0).add(breakup.mul(0.35))), dirtBlend));

    // bare rock on steep faces: strata bands keyed to elevation, crests bleached, near-vertical
    // walls darkening toward cliff, arid rock baked red-brown. The albedo is a top-down
    // projection, so high-frequency detail smears into streaks on steep walls; fade it out with slope
    const stretchFade = float(1.0).sub(smoothstep(1.2, 2.2, slope).mul(0.7));
    const strata = float(0.5).add(sin(h.mul(70.0).add(breakup.mul(9.0))).mul(0.5));
    const rockBase = mix(ROCK_COLOR, ROCK_DRY, scorch.mul(float(1.0).sub(moisture)));
    const rockColor = mix(
      rockBase,
      CLIFF_COLOR,
      smoothstep(ROCK_SLOPE_HI, CLIFF_SLOPE, slope.add(breakup.mul(0.3)))
    ).toVar();
    rockColor.mulAssign(
      float(1.0)
        .add(strata.sub(0.5).mul(0.22).mul(stretchFade))
        .mul(float(1.0).add(ridge.mul(0.15)))
        .mul(float(1.0).add(macro.mul(0.18)))
    );
    const rockBlend = smoothstep(ROCK_SLOPE_LO, ROCK_SLOPE_HI, slope.add(breakup.mul(0.45)));
    color.assign(mix(color, rockColor, rockBlend));

    // beaches on flat ground within a thin band above the water surface: warm shores get sand,
    // cold ones gravel; riparian floors stay green
    const beachColor = mix(GRAVEL, SAND_COLOR, warm).toVar();
    const sandBlend = smoothstep(SAND_BAND, SAND_BAND * 0.4, h.sub(waterSurface).add(breakup.mul(0.012)))
      .mul(float(1.0).sub(smoothstep(0.5, 1.0, slope)))
      .mul(float(1.0).sub(riparian));
    color.assign(mix(color, beachColor.mul(float(1.0).add(breakup.mul(0.2))), sandBlend));

    // permanent snow only where truly cold (FMG treats < -5 C as permafrost; grid temperature
    // already accounts for altitude). The band is narrow and dithered at two scales so the snow
    // limit is a patchy fringe, not fog; snow collects in gullies (white streaks down the
    // couloirs), near-vertical faces shed it and tree canopies poke through
    const snow = float(1.0)
      .sub(smoothstep(-5.5, -3.5, tempC.sub(gully.mul(2.5)).add(breakup.mul(3.0)).add(patch.mul(2.0))))
      .mul(float(1.0).sub(smoothstep(1.4, 2.4, slope)))
      .toVar();
    snow.mulAssign(float(1.0).sub(density.mul(0.45)));
    color.assign(mix(color, SNOW_COLOR, snow));

    // cavity shading baked into the albedo: gullies dim, crests catch light
    color.mulAssign(float(1.0).sub(gully.mul(0.28)).add(ridge.mul(0.16)));

    // baked hillshade, Swiss-relief style: warm afternoon sun from the north-west, cool blue
    // sky-light in the shade. The 3D scene light is monochrome, so this tint contrast is what
    // makes the relief glow
    const nrm = normalize(vec3(grad.x.negate(), grad.y.negate(), 1.0));
    const sunDir = normalize(vec3(-0.55, -0.55, 0.85));
    const shade = clamp(dot(nrm, sunDir).sub(sunDir.z).mul(2.0), -1.0, 1.0).mul(0.5).add(0.5);
    color.mulAssign(mix(vec3(0.84, 0.88, 1.03), vec3(1.16, 1.1, 0.97), shade));

    // aerial perspective: the high country pales toward the sky
    color.assign(mix(color, vec3(0.93, 0.96, 1.0), smoothstep(0.45, 0.95, h).mul(0.16)));

    // final grade: a restrained saturation and mid lift — keep the land closer to true aerial
    // color than to a postcard
    const lum = dot(color, vec3(0.299, 0.587, 0.114));
    color.assign(mix(vec3(lum), color, 1.1));
    color.assign(pow(clamp(color, 0.0, 1.0), vec3(0.94)));

    // water is fully procedural. Bathymetry from the grid heightmap drives a sunlit shelf-to-abyss
    // gradient; near the shore a sandy seabed glow, a climate-tinted lagoon and a frayed foam line
    // breaking on the true vector coastline
    const seabed = climate.b.mul(100.0);
    const bathy = clamp(float(20.0).sub(seabed).div(18.0).add(macro.mul(0.12)), 0.0, 1.0);
    const waterColor = mix(SHELF_BLUE, OCEAN_BLUE, smoothstep(0.05, 0.55, bathy)).toVar();
    waterColor.assign(mix(waterColor, ABYSS_BLUE, smoothstep(0.55, 1.0, bathy)));
    waterColor.mulAssign(float(1.0).add(macro.mul(0.08)).add(breakup.mul(0.03)));

    // shore: 0 at the true coastline, growing seaward over the mask taper
    const shore = clamp(float(0.5).sub(landFactor).mul(2.0), 0.0, 1.0).toVar();
    // baked river channel (true 2D widths); estuary water keeps the lagoon tint but sheds the sand
    // glow and the breaking surf line
    const riverMask = coast.b.toVar();
    const riverWater = smoothstep(0.2, 0.6, riverMask);
    const lagoonColor = mix(LAGOON_COLD, LAGOON_WARM, warm)
      .mul(float(1.0).add(breakup.mul(0.1)))
      .toVar();
    waterColor.assign(
      mix(
        waterColor,
        lagoonColor,
        float(1.0)
          .sub(smoothstep(0.02, 0.25, shore))
          .mul(0.95)
      )
    );
    waterColor.assign(
      mix(
        waterColor,
        beachColor.mul(1.05),
        float(1.0)
          .sub(smoothstep(0.0, 0.07, shore))
          .mul(0.45)
          .mul(float(1.0).sub(riverWater.mul(0.7)))
      )
    );
    const foam = float(1.0)
      .sub(smoothstep(0.008, 0.04, shore.sub(breakup.mul(0.02))))
      .mul(smoothstep(0.25, 0.85, float(0.5).add(breakup).add(patch.mul(0.3))))
      .mul(float(1.0).sub(riverWater));
    waterColor.assign(mix(waterColor, FOAM_COLOR, foam.mul(0.6)));

    // lake groups override the generic ocean recipe (code baked in coast.a, dilated past the shore
    // so the decode is stable wherever water shows). Fresh/salt/sinkhole stay water (calm-lake
    // animation band, no ocean surf), dry/lava/frozen turn into static beds via the alpha below
    const lakeCode = floor(coast.a.mul(6.375).add(0.5)).toVar(); // byte / 40
    const lakeRim = float(1.0)
      .sub(smoothstep(0.0, 0.14, shore.add(breakup.mul(0.06))))
      .toVar();
    If(lakeCode.greaterThan(0.5).and(lakeCode.lessThan(1.5)), () => {
      // freshwater: still periwinkle-blue water, paler over the shallow rim
      waterColor.assign(mix(FRESH_DEEP, FRESH_RIM, clamp(lakeRim.mul(0.85).add(breakup.mul(0.08)), 0.0, 1.0)));
      waterColor.mulAssign(float(1.0).add(macro.mul(0.06)).add(breakup.mul(0.04)));
    })
      .ElseIf(lakeCode.greaterThan(1.5).and(lakeCode.lessThan(2.5)), () => {
        // salt: milky mineral teal with an evaporite crust ring at the shore
        const saltWater = mix(SALT_WATER, vec3(1.0), float(0.12).add(breakup.mul(0.08)));
        waterColor.assign(mix(saltWater, SALT_CRUST.mul(float(1.0).add(breakup.mul(0.08))), lakeRim.mul(0.85)));
      })
      .ElseIf(lakeCode.greaterThan(2.5).and(lakeCode.lessThan(3.5)), () => {
        // sinkhole: bright cenote cyan rim dropping into a deep blue eye
        waterColor.assign(mix(SINKHOLE_DEEP, SINKHOLE_RIM, clamp(lakeRim.mul(0.9).add(breakup.mul(0.1)), 0.0, 1.0)));
      })
      .ElseIf(lakeCode.greaterThan(3.5).and(lakeCode.lessThan(4.5)), () => {
        // dry: cracked clay pan with a damp fringe
        waterColor.assign(DRY_BED.mul(float(1.0).add(breakup.mul(0.15)).add(macro.mul(0.08))));
        const cracks = float(1.0).sub(smoothstep(0.0, 0.05, abs(breakup)));
        waterColor.mulAssign(float(1.0).sub(cracks.mul(0.18)));
        waterColor.assign(mix(waterColor, DRY_RIM, lakeRim.mul(0.5)));
      })
      .ElseIf(lakeCode.greaterThan(4.5).and(lakeCode.lessThan(5.5)), () => {
        // lava: cooled basalt crust veined with glowing cracks
        const lava = mix(
          LAVA_CRUST.mul(float(1.0).add(breakup.mul(0.3))),
          LAVA_RED,
          smoothstep(0.1, 0.45, macro.add(patch.mul(0.3))).mul(0.5)
        );
        const veins = float(1.0).sub(smoothstep(0.0, 0.045, abs(breakup)));
        waterColor.assign(mix(lava, LAVA_GLOW, veins.mul(clamp(float(0.55).add(patch), 0.0, 1.0))));
      })
      .ElseIf(lakeCode.greaterThan(5.5), () => {
        // frozen: pale ice lid with brighter pressure-crack veins
        waterColor.assign(ICE_COLOR.mul(float(1.0).add(breakup.mul(0.06)).add(macro.mul(0.05))));
        const iceVeins = float(1.0).sub(smoothstep(0.0, 0.04, abs(breakup)));
        waterColor.assign(mix(waterColor, vec3(0.97, 0.98, 1.0), iceVeins.mul(0.5).add(lakeRim.mul(0.25))));
      });

    // the land ramp spans ~2 bake texels: soft enough to antialias the waterline, tight enough
    // that the beach still meets the water
    const land = smoothstep(0.5, 0.54, landFactor).toVar();
    const finalColor = mix(waterColor, color, land).toVar();

    // baked river courses are real water: a deep teal channel that reads against the land greens,
    // damp sediment banks on the flats. The mask carries the true 2D river widths (hairline at the
    // source, flux-widened downstream), so only antialias the bank line here and hand the channel
    // off to the ocean/lake water at the coastline, which the land-mask mouth cut bends around the
    // river entrance
    const river = smoothstep(0.35, 0.65, riverMask)
      .mul(smoothstep(0.42, 0.52, landFactor))
      .toVar();
    // rivers freeze over in extreme cold: same band as the permafrost snow line (tempC already
    // carries the breakup jitter, so the freeze edge is a dithered fringe, not a contour); frozen
    // courses also lose their sediment banks (buried with the rest of the snowed-in floodplain)
    // and their flow animation via the alpha below
    const riverIce = float(1.0)
      .sub(smoothstep(-5.5, -3.0, tempC.add(patch.mul(1.5))))
      .toVar();
    const bank = smoothstep(0.12, 0.32, riverMask)
      .mul(float(1.0).sub(river))
      .mul(smoothstep(0.45, 0.55, landFactor));
    finalColor.assign(
      mix(
        finalColor,
        SEDIMENT.mul(float(1.05).add(breakup.mul(0.2))),
        bank.mul(0.5).mul(flatGround).mul(float(1.0).sub(riverIce))
      )
    );
    const riverColor = mix(OCEAN_BLUE, lagoonColor, 0.25)
      .mul(float(0.88).add(breakup.mul(0.1)))
      .toVar();
    // white water: only genuinely steep runs aerate into rapids and falls (slope at the channel
    // centerline is the along-course gradient; the animated churn in the mesh material uses the
    // same steepness signal). The foam is clumpy — noise-textured white, not a flat wash
    const rapids = smoothstep(0.55, 1.5, slope.add(breakup.mul(0.2))).mul(float(1.0).sub(riverIce));
    const foamTex = FOAM_COLOR.mul(clamp(float(0.78).add(breakup.mul(0.55)).add(patch.mul(0.2)), 0.6, 1.05));
    riverColor.assign(mix(riverColor, foamTex, min(rapids.mul(0.95), 0.8)));
    riverColor.assign(mix(riverColor, ICE_COLOR.mul(float(1.02).add(breakup.mul(0.06))), riverIce));
    finalColor.assign(mix(finalColor, riverColor, river));

    // alpha packs land coverage for the mesh material's water animation: land 1, rivers 0.45
    // (course-flow band; frozen rivers read as land), enclosed lakes 0.7 (calm-ripple band), open
    // water 0 with a shore-proximity hint (up to 0.3 at the coastline) that drives the animated
    // surf; dry/lava/frozen lake beds read as static land
    const shoreHint = float(1.0)
      .sub(smoothstep(0.0, 0.25, shore))
      .mul(0.3);
    const alpha = mix(shoreHint, 1.0, land).toVar();
    If(lakeCode.greaterThan(0.5).and(lakeCode.lessThan(3.5)), () => {
      alpha.assign(mix(0.7, 1.0, land));
    });
    alpha.assign(mix(alpha, mix(0.45, 1.0, riverIce), river));
    If(lakeCode.greaterThan(3.5), () => {
      alpha.assign(1.0);
    });

    return vec4(finalColor, alpha);
  });

  return main();
}

// bakeResult = the cached object returned by erosion-bake's bake() (pixels,
// coast, cols, rows). Returns a THREE.Texture to use directly as
// material.map, or null on failure. The texture is regenerated on every
// mesh rebuild and on height-scale changes (slope thresholds depend on it)
export async function generateSatelliteTexture(
  renderer: WebGPURenderer,
  bakeResult: ErosionBakeResult,
  { scale, maxOutput }: { scale: number; maxOutput: number }
): Promise<THREE.Texture | null> {
  if (!bakeResult?.pixels || !bakeResult?.coast) return null;
  disposeSatelliteTexture();

  let fieldTexture!: THREE.DataTexture;
  let coastTexture!: THREE.DataTexture;
  let climateTexture!: THREE.DataTexture;
  let biomeTexture!: THREE.DataTexture;
  let material!: NodeMaterial;
  let geometry!: THREE.BufferGeometry;

  try {
    const { cols, rows } = bakeResult;

    fieldTexture = new THREE.DataTexture(bakeResult.pixels, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    fieldTexture.minFilter = fieldTexture.magFilter = THREE.NearestFilter; // packed 16-bit height must not be hardware-interpolated
    fieldTexture.needsUpdate = true;

    coastTexture = new THREE.DataTexture(bakeResult.coast, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    coastTexture.minFilter = coastTexture.magFilter = THREE.LinearFilter;
    coastTexture.needsUpdate = true;

    climateTexture = buildClimateTexture();
    biomeTexture = buildBiomeTexture();

    // supersample the output past the field size (up to 2x): the procedural
    // detail (breakup/dither noise, strata, biome edges) is generated per
    // fragment, so a larger render target genuinely sharpens it. Field-driven
    // signals interpolate via the shader's bilinear decode. Never downsample:
    // a 1x output stays bit-identical to rendering at field size.
    // WebGPURenderer exposes no public max-texture-size query (WebGLRenderer's
    // `capabilities.maxTextureSize` has no equivalent); 8192 is safely below the texture
    // dimension limit on both the WebGPU and WebGL2-fallback backends.
    const longSide = Math.max(cols, rows);
    const maxSide = Math.min(maxOutput, 8192, longSide * 2);
    const outputScale = Math.max(maxSide / longSide, 1);
    const outputW = Math.round(cols * outputScale);
    const outputH = Math.round(rows * outputScale);

    // WebGPURenderer's fallback backend is always WebGL2 (never legacy WebGL1), and WebGPU itself
    // has no restriction on non-power-of-two mipmapping, so this is unconditionally safe now
    // (unlike the old WebGLRenderer path, which had to check for a WebGL2 context first).
    const target = new THREE.RenderTarget(outputW, outputH, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    renderTarget = target;
    target.texture.anisotropy = renderer.getMaxAnisotropy();

    // normalized-height gradient per texel -> world-space tan(slope):
    // d(world y)/d(height) = scale * 100 / 82 (the LOWER_BY_WATER divider),
    // texel size in world units = map extent / bake size
    const worldPerHeight = (scale * 100) / 82;
    material = new NodeMaterial();
    material.fragmentNode = buildSatelliteFragmentNode(
      { field: fieldTexture, coast: coastTexture, climate: climateTexture, biome: biomeTexture },
      cols,
      rows,
      worldPerHeight / (worldContext.graphWidth / cols),
      worldPerHeight / (worldContext.graphHeight / rows)
    );
    material.depthTest = false;
    material.depthWrite = false;

    // fullscreen triangle
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    const bakeScene = new THREE.Scene();
    bakeScene.add(quad);
    const bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    await renderer.renderAsync(bakeScene, bakeCamera);
    renderer.setRenderTarget(previousTarget);

    return target.texture;
  } catch (error) {
    console.error("Satellite texture generation failed:", error);
    disposeSatelliteTexture();
    return null;
  } finally {
    material?.dispose();
    geometry?.dispose();
    fieldTexture?.dispose();
    coastTexture?.dispose();
    climateTexture?.dispose();
    biomeTexture?.dispose();
  }
}

export function disposeSatelliteTexture(): void {
  if (renderTarget) {
    renderTarget.dispose();
    renderTarget = null;
  }
}

const FLOW_WAVELENGTH = 10; // map units per flow animation cycle
let flowTexture: THREE.Texture | null = null;

// Flow phase field for the mesh material's river animation: each course is
// stroked with per-channel linear gradients encoding sin/cos of the arc
// length from the source in R/G (so the phase survives bilinear filtering
// with no sawtooth wrap). B packs coverage AND the along-course steepness
// (byte 40 = flat course .. 255 = sheer fall, 0 = no river), sampled from
// the baked height field: the animation speeds up and churns white with
// steepness so steep drops read as waterfalls. Strokes are wider than the
// rendered river — the satellite alpha band gates where the animation
// shows — so a low resolution is fine. CanvasTexture default flipY puts
// canvas row 0 (map top) at v=1, matching how the satellite render target
// drapes onto the mesh uvs
export function generateRiverFlowTexture(): THREE.Texture {
  disposeRiverFlowTexture();

  const scale = 1024 / Math.max(worldContext.graphWidth, worldContext.graphHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, Math.round(worldContext.graphWidth * scale));
  canvas.height = Math.max(64, Math.round(worldContext.graphHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = ctx.lineCap = "round";

  const k = (Math.PI * 2) / FLOW_WAVELENGTH;
  const minWidth = 4 / scale; // keep narrow courses covered at flow-texture resolution
  const encode = (d: number, steep: number) =>
    `rgb(${Math.round(127.5 + 127.5 * Math.sin(d * k))},${Math.round(127.5 + 127.5 * Math.cos(d * k))},${Math.round(
      40 + steep * 215
    )})`;
  // along-course drop (height units 0-100 per map unit) -> steepness 0..1:
  // rapids start around 0.6, a sheer fall saturates at 3.0 — deliberately
  // rare, only genuinely steep runs churn. heightAt with scale = DIVIDER
  // returns raw height units up to a constant offset that cancels in the
  // difference (0 without a bake cache -> flat, no falls)
  const steepness = (drop: number) => Math.min(Math.max((drop - 0.6) / 2.4, 0), 1);

  for (const river of worldContext.pack.rivers || []) {
    if (!river.cells || river.cells.length < 2) continue;
    const points = river.points && river.points.length === river.cells.length ? river.points : null;
    try {
      const meandered = Rivers.addMeandering(river.cells, points);
      let dist = 0;
      let flux = meandered[0][2];
      let steep = 0;
      for (let pointIndex = 1; pointIndex < meandered.length; pointIndex++) {
        const [x0, y0] = meandered[pointIndex - 1];
        const [x1, y1] = meandered[pointIndex];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (length < 0.01) continue;
        if (meandered[pointIndex][2] > flux) flux = meandered[pointIndex][2];
        const offset = Rivers.getOffset({
          flux,
          pointIndex,
          widthFactor: river.widthFactor,
          startingWidth: river.sourceWidth
        });
        ctx.lineWidth = Math.max(2 * offset, minWidth);
        // sub-segments short against the wavelength: the linear gradient
        // then tracks the circular sin/cos phase closely
        const subs = Math.max(1, Math.ceil(length / (FLOW_WAVELENGTH / 5)));
        const subLen = length / subs;
        for (let s = 0; s < subs; s++) {
          const t0 = s / subs;
          const t1 = (s + 1) / subs;
          const ax = x0 + (x1 - x0) * t0;
          const ay = y0 + (y1 - y0) * t0;
          const bx = x0 + (x1 - x0) * t1;
          const by = y0 + (y1 - y0) * t1;
          // steepness rises instantly at a drop but decays slowly while
          // walking downstream: the churn trails past the fall's base like
          // the foam apron under a real waterfall
          const drop = Math.max(0, heightAt(ax, ay, 82) - heightAt(bx, by, 82)) / subLen;
          steep = Math.max(steepness(drop), steep * 0.55);
          const gradient = ctx.createLinearGradient(ax, ay, bx, by);
          gradient.addColorStop(0, encode(dist + length * t0, steep));
          gradient.addColorStop(1, encode(dist + length * t1, steep));
          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        dist += length;
      }
    } catch {
      // a malformed river just goes missing from the animation
    }
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  flowTexture = texture;
  return texture;
}

export function disposeRiverFlowTexture(): void {
  if (flowTexture) {
    flowTexture.dispose();
    flowTexture = null;
  }
}
