import { create } from "zustand";
import { EARTH_AXIAL_TILT_DEG, EARTH_DEFAULT_MAP_SIZE, EARTH_TEMPERATURE_PRESET } from "../data/earthConfig";

interface WorldConfiguratorFormState {
  // Temperature settings
  temperatureEquator: number;
  temperatureNorthPole: number;
  temperatureSouthPole: number;
  axialTilt: number;

  // Map configuration
  mapSize: number;
  latitude: number;
  longitude: number;
  prec: number;

  // Actions - Temperature
  setTemperatureEquator: (value: number) => void;
  setTemperatureNorthPole: (value: number) => void;
  setTemperatureSouthPole: (value: number) => void;
  setAxialTilt: (value: number) => void;

  // Actions - Map Configuration
  setMapSize: (value: number) => void;
  setLatitude: (value: number) => void;
  setLongitude: (value: number) => void;
  setPrec: (value: number) => void;

  /** Sync from worldContext on dialog open */
  syncFromWorldContext: (
    equator: number,
    northPole: number,
    southPole: number,
    axialTilt: number,
    mapSize: number,
    latitude: number,
    longitude: number,
    prec: number
  ) => void;

  /** Get all values for worldContext update */
  getValues: () => {
    temperatureEquator: number;
    temperatureNorthPole: number;
    temperatureSouthPole: number;
    axialTilt: number;
    mapSize: number;
    latitude: number;
    longitude: number;
    prec: number;
  };
}

export const useWorldConfiguratorFormStore = create<WorldConfiguratorFormState>((set, get) => ({
  temperatureEquator: EARTH_TEMPERATURE_PRESET.equator,
  temperatureNorthPole: EARTH_TEMPERATURE_PRESET.northPole,
  temperatureSouthPole: EARTH_TEMPERATURE_PRESET.southPole,
  axialTilt: EARTH_AXIAL_TILT_DEG,
  mapSize: EARTH_DEFAULT_MAP_SIZE,
  latitude: 0,
  longitude: 0,
  prec: 0.5,

  setTemperatureEquator: (value: number) => {
    set({ temperatureEquator: value });
  },

  setTemperatureNorthPole: (value: number) => {
    set({ temperatureNorthPole: value });
  },

  setTemperatureSouthPole: (value: number) => {
    set({ temperatureSouthPole: value });
  },

  setAxialTilt: (value: number) => {
    set({ axialTilt: value });
  },

  setMapSize: (value: number) => {
    set({ mapSize: value });
  },

  setLatitude: (value: number) => {
    set({ latitude: value });
  },

  setLongitude: (value: number) => {
    set({ longitude: value });
  },

  setPrec: (value: number) => {
    set({ prec: value });
  },

  syncFromWorldContext: (equator, northPole, southPole, axialTilt, mapSize, latitude, longitude, prec) => {
    set({
      temperatureEquator: equator,
      temperatureNorthPole: northPole,
      temperatureSouthPole: southPole,
      axialTilt,
      mapSize,
      latitude,
      longitude,
      prec
    });
  },

  getValues: () => {
    const state = get();
    return {
      temperatureEquator: state.temperatureEquator,
      temperatureNorthPole: state.temperatureNorthPole,
      temperatureSouthPole: state.temperatureSouthPole,
      axialTilt: state.axialTilt,
      mapSize: state.mapSize,
      latitude: state.latitude,
      longitude: state.longitude,
      prec: state.prec
    };
  }
}));
