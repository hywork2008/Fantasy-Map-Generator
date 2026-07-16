import { create } from "zustand";

interface ThreeDOptions {
  scale: number;
  lightness: number;
  shadow: number;
  sun: { x: number; y: number; z: number };
  rotateMesh: number;
  rotateGlobe: number;
  skyColor: string;
  waterColor: string;
  sunColor: string;
  extendedWater: number;
  labels3d: number;
  wireframe: number;
  resolution: number;
  resolutionScale: number;
  subdivide: number;
  erosion: boolean;
  erosionDetail: number;
  erosionStrength: number;
  erosionRiverDepth: number;
  erosionOctaves: number;
  satellite: boolean;
  sceneOnly: boolean;
  nightscapeBeamEnabled: boolean;
  nightscapeBeamReversed: boolean;
  nightscapeRouteGlowEnabled: boolean;
  isOn?: boolean;
  isGlobe?: boolean;
}

interface Options3DState {
  // Scale and lightness
  scale: number;
  lightness: number;

  // Sun position and color
  sunX: number;
  sunY: number;
  sunColor: string;

  // Rotation
  rotateMesh: number;
  rotateGlobe: number;

  // Resolution and quality
  resolutionScale: number;
  resolution: number;
  subdivide: number;
  labels3d: number;

  // Water and sky
  extendedWater: boolean;
  skyColor: string;
  waterColor: string;

  // Erosion
  satellite: boolean;
  sceneOnly: boolean;
  nightscapeBeamEnabled: boolean;
  nightscapeBeamReversed: boolean;
  nightscapeRouteGlowEnabled: boolean;
  erosion: boolean;
  erosionDetail: number;
  erosionStrength: number;
  erosionRiverDepth: number;
  erosionOctaves: number;

  // Actions
  syncFromThreeDRenderer: (options: Partial<ThreeDOptions>) => void;
  updateValue: (key: string, value: unknown) => void;
  getValues: () => Record<string, unknown>;
}

export const use3DOptionsStore = create<Options3DState>((set, get) => ({
  scale: 1,
  lightness: 0.5,
  sunX: 0,
  sunY: 0,
  sunColor: "#ffffff",
  rotateMesh: 0,
  rotateGlobe: 0,
  resolutionScale: 1,
  resolution: 1,
  subdivide: 0,
  labels3d: 1,
  extendedWater: false,
  skyColor: "#87ceeb",
  waterColor: "#1e90ff",
  satellite: false,
  sceneOnly: false,
  nightscapeBeamEnabled: true,
  nightscapeBeamReversed: false,
  nightscapeRouteGlowEnabled: false,
  erosion: false,
  erosionDetail: 0,
  erosionStrength: 0.5,
  erosionRiverDepth: 0.5,
  erosionOctaves: 3,

  syncFromThreeDRenderer: (options: Partial<ThreeDOptions>) => {
    set({
      scale: options.scale ?? 1,
      lightness: (options.lightness ?? 0.5) * 100,
      sunX: options.sun?.x ?? 0,
      sunY: options.sun?.y ?? 0,
      sunColor: options.sunColor ?? "#ffffff",
      rotateMesh: options.rotateMesh ?? 0,
      rotateGlobe: options.rotateGlobe ?? 0,
      resolutionScale: options.resolutionScale ?? 1,
      resolution: options.resolution ?? 1,
      subdivide: options.subdivide ?? 0,
      labels3d: options.labels3d ?? 1,
      extendedWater: Boolean(options.extendedWater),
      skyColor: options.skyColor ?? "#87ceeb",
      waterColor: options.waterColor ?? "#1e90ff",
      satellite: options.satellite ?? false,
      sceneOnly: options.sceneOnly ?? false,
      nightscapeBeamEnabled: options.nightscapeBeamEnabled ?? true,
      nightscapeBeamReversed: options.nightscapeBeamReversed ?? false,
      nightscapeRouteGlowEnabled: options.nightscapeRouteGlowEnabled ?? false,
      erosion: options.erosion ?? false,
      erosionDetail: options.erosionDetail ?? 0,
      erosionStrength: options.erosionStrength ?? 0.5,
      erosionRiverDepth: options.erosionRiverDepth ?? 0.5,
      erosionOctaves: options.erosionOctaves ?? 3
    });
  },

  updateValue: (key: string, value: unknown) => {
    set({
      [key]: value
    } as Partial<Options3DState>);
  },

  getValues: () => {
    const state = get();
    return {
      scale: state.scale,
      lightness: state.lightness,
      sunX: state.sunX,
      sunY: state.sunY,
      sunColor: state.sunColor,
      rotateMesh: state.rotateMesh,
      rotateGlobe: state.rotateGlobe,
      resolutionScale: state.resolutionScale,
      resolution: state.resolution,
      subdivide: state.subdivide,
      labels3d: state.labels3d,
      extendedWater: state.extendedWater,
      skyColor: state.skyColor,
      waterColor: state.waterColor,
      satellite: state.satellite,
      sceneOnly: state.sceneOnly,
      nightscapeBeamEnabled: state.nightscapeBeamEnabled,
      nightscapeBeamReversed: state.nightscapeBeamReversed,
      nightscapeRouteGlowEnabled: state.nightscapeRouteGlowEnabled,
      erosion: state.erosion,
      erosionDetail: state.erosionDetail,
      erosionStrength: state.erosionStrength,
      erosionRiverDepth: state.erosionRiverDepth,
      erosionOctaves: state.erosionOctaves
    };
  }
}));
