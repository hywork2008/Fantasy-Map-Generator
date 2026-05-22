type DefineMapSizeDeps = {
  ensureEl: (id: string) => any;
  grid: any;
  gauss: (...args: number[]) => number;
  P: (probability: number) => boolean;
  locked: (settingId: string) => boolean;
  locationHref: string;
  mapSizeOutput: HTMLInputElement;
  mapSizeInput: HTMLInputElement;
  latitudeOutput: HTMLInputElement;
  latitudeInput: HTMLInputElement;
  longitudeOutput: HTMLInputElement;
  longitudeInput: HTMLInputElement;
};

export function defineMapSizeFlow({
  ensureEl,
  grid,
  gauss,
  P,
  locked,
  locationHref,
  mapSizeOutput,
  mapSizeInput,
  latitudeOutput,
  latitudeInput,
  longitudeOutput,
  longitudeInput
}: DefineMapSizeDeps) {
  const [size, latitude, longitude] = getSizeAndLatitude();
  const randomize = new URL(locationHref).searchParams.get("options") === "default";
  if (randomize || !locked("mapSize")) mapSizeOutput.value = mapSizeInput.value = String(size);
  if (randomize || !locked("latitude")) latitudeOutput.value = latitudeInput.value = String(latitude);
  if (randomize || !locked("longitude")) longitudeOutput.value = longitudeInput.value = String(longitude);

  function getSizeAndLatitude(): [number, number, number] {
    const template = ensureEl("templateInput").value;

    if (template === "africa-centric") return [45, 53, 38];
    if (template === "arabia") return [20, 35, 35];
    if (template === "atlantics") return [42, 23, 65];
    if (template === "britain") return [7, 20, 51.3];
    if (template === "caribbean") return [15, 40, 74.8];
    if (template === "east-asia") return [11, 28, 9.4];
    if (template === "eurasia") return [38, 19, 27];
    if (template === "europe") return [20, 16, 44.8];
    if (template === "europe-accented") return [14, 22, 44.8];
    if (template === "europe-and-central-asia") return [25, 10, 39.5];
    if (template === "europe-central") return [11, 22, 46.4];
    if (template === "europe-north") return [7, 18, 48.9];
    if (template === "greenland") return [22, 7, 55.8];
    if (template === "hellenica") return [8, 27, 43.5];
    if (template === "iceland") return [2, 15, 55.3];
    if (template === "indian-ocean") return [45, 55, 14];
    if (template === "mediterranean-sea") return [10, 29, 45.8];
    if (template === "middle-east") return [8, 31, 34.4];
    if (template === "north-america") return [37, 17, 87];
    if (template === "us-centric") return [66, 27, 100];
    if (template === "us-mainland") return [16, 30, 77.5];
    if (template === "world") return [78, 27, 40];
    if (template === "world-from-pacific") return [75, 32, 30];

    const part = grid.features.some((f: any) => f.land && f.border);
    const max = part ? 80 : 100;
    const lat = () => gauss(P(0.5) ? 40 : 60, 20, 25, 75);

    if (!part) {
      if (template === "pangea") return [100, 50, 50];
      if (template === "shattered" && P(0.7)) return [100, 50, 50];
      if (template === "continents" && P(0.5)) return [100, 50, 50];
      if (template === "archipelago" && P(0.35)) return [100, 50, 50];
      if (template === "highIsland" && P(0.25)) return [100, 50, 50];
      if (template === "lowIsland" && P(0.1)) return [100, 50, 50];
    }

    if (template === "pangea") return [gauss(70, 20, 30, max), lat(), 50];
    if (template === "volcano") return [gauss(20, 20, 10, max), lat(), 50];
    if (template === "mediterranean") return [gauss(25, 30, 15, 80), lat(), 50];
    if (template === "peninsula") return [gauss(15, 15, 5, 80), lat(), 50];
    if (template === "isthmus") return [gauss(15, 20, 3, 80), lat(), 50];
    if (template === "atoll") return [gauss(3, 2, 1, 5, 1), lat(), 50];

    return [gauss(30, 20, 15, max), lat(), 50];
  }
}

type MapCoordinates = { latT: number; latN: number; latS: number; lonT: number; lonW: number; lonE: number };

type CalculateCoordinatesDeps = {
  ensureEl: (id: string) => any;
  rn: (value: number, digits?: number) => number;
  graphWidth: number;
  graphHeight: number;
};

export function calculateMapCoordinatesFlow({ ensureEl, rn, graphWidth, graphHeight }: CalculateCoordinatesDeps): MapCoordinates {
  const sizeFraction = +ensureEl("mapSizeOutput").value / 100;
  const latShift = +ensureEl("latitudeOutput").value / 100;
  const lonShift = +ensureEl("longitudeOutput").value / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((graphWidth / graphHeight) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);
  return { latT, latN, latS, lonT, lonW, lonE };
}

type CalculateTemperaturesDeps = {
  TIME: boolean;
  grid: any;
  options: { temperatureEquator: number; temperatureNorthPole: number; temperatureSouthPole: number };
  heightExponentInput: HTMLInputElement;
  mapCoordinates: MapCoordinates;
  graphHeight: number;
  rn: (value: number, digits?: number) => number;
  minmax: (value: number, min: number, max: number) => number;
  DEBUG: any;
};

export function calculateTemperaturesFlow({
  TIME,
  grid,
  options,
  heightExponentInput,
  mapCoordinates,
  graphHeight,
  rn,
  minmax,
  DEBUG
}: CalculateTemperaturesDeps) {
  TIME && console.time("calculateTemperatures");
  const cells = grid.cells;
  cells.temp = new Int8Array(cells.i.length);

  const { temperatureEquator, temperatureNorthPole, temperatureSouthPole } = options;
  const tropics = [16, -20];
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  const exponent = +heightExponentInput.value;

  for (let rowCellId = 0; rowCellId < cells.i.length; rowCellId += grid.cellsX) {
    const [, y] = grid.points[rowCellId];
    const rowLatitude = mapCoordinates.latN - (y / graphHeight) * mapCoordinates.latT;
    const tempSeaLevel = calculateSeaLevelTemp(rowLatitude);
    DEBUG.temperature && console.info(`${rn(rowLatitude)}° sea temperature: ${rn(tempSeaLevel)}°C`);

    for (let cellId = rowCellId; cellId < rowCellId + grid.cellsX; cellId++) {
      const tempAltitudeDrop = getAltitudeTemperatureDrop(cells.h[cellId]);
      cells.temp[cellId] = minmax(tempSeaLevel - tempAltitudeDrop, -128, 127);
    }
  }

  function calculateSeaLevelTemp(latitude: number) {
    const isTropical = latitude <= 16 && latitude >= -20;
    if (isTropical) return temperatureEquator - Math.abs(latitude) * tropicalGradient;

    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  }

  function getAltitudeTemperatureDrop(h: number) {
    if (h < 20) return 0;
    const height = (h - 18) ** exponent;
    return rn((height / 1000) * 6.5);
  }

  TIME && console.timeEnd("calculateTemperatures");
}

type GeneratePrecipitationDeps = {
  TIME: boolean;
  prec: any;
  grid: any;
  pointsInput: HTMLInputElement;
  precInput: HTMLInputElement;
  mapCoordinates: MapCoordinates;
  graphHeight: number;
  graphWidth: number;
  options: { winds: number[] };
  rand: (min?: number, max?: number) => number;
  minmax: (value: number, min: number, max: number) => number;
  d3: any;
};

export function generatePrecipitationFlow({
  TIME,
  prec,
  grid,
  pointsInput,
  precInput,
  mapCoordinates,
  graphHeight,
  graphWidth,
  options,
  rand,
  minmax,
  d3
}: GeneratePrecipitationDeps) {
  TIME && console.time("generatePrecipitation");
  prec.selectAll("*").remove();
  const { cells, cellsX, cellsY } = grid;
  cells.prec = new Uint8Array(cells.i.length);

  const cellsNumberModifier = (Number(pointsInput.dataset.cells) / 10000) ** 0.25;
  const precInputModifier = Number(precInput.value) / 100;
  const modifier = cellsNumberModifier * precInputModifier;

  const westerly: any[] = [];
  const easterly: any[] = [];
  let southerly = 0;
  let northerly = 0;

  const latitudeModifier = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];
  const MAX_PASSABLE_ELEVATION = 85;

  d3.range(0, cells.i.length, cellsX).forEach((c: number, i: number) => {
    const lat = mapCoordinates.latN - (i / cellsY) * mapCoordinates.latT;
    const latBand = ((Math.abs(lat) - 1) / 5) | 0;
    const latMod = latitudeModifier[latBand];
    const windTier = (Math.abs(lat - 89) / 30) | 0;
    const { isWest, isEast, isNorth, isSouth } = getWindDirections(windTier);

    if (isWest) westerly.push([c, latMod, windTier]);
    if (isEast) easterly.push([c + cellsX - 1, latMod, windTier]);
    if (isNorth) northerly++;
    if (isSouth) southerly++;
  });

  if (westerly.length) passWind(westerly, 120 * modifier, 1, cellsX);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, cellsX);

  const vertT = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(mapCoordinates.latN) - 1) / 5) | 0;
    const latModN = mapCoordinates.latT > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandN];
    const maxPrecN = (northerly / vertT) * 60 * modifier * latModN;
    passWind(d3.range(0, cellsX, 1), maxPrecN, cellsX, cellsY);
  }

  if (southerly) {
    const bandS = ((Math.abs(mapCoordinates.latS) - 1) / 5) | 0;
    const latModS = mapCoordinates.latT > 60 ? d3.mean(latitudeModifier) : latitudeModifier[bandS];
    const maxPrecS = (southerly / vertT) * 60 * modifier * latModS;
    passWind(d3.range(cells.i.length - cellsX, cells.i.length, 1), maxPrecS, -cellsX, cellsY);
  }

  function getWindDirections(tier: number) {
    const angle = options.winds[tier];
    const isWest = angle > 40 && angle < 140;
    const isEast = angle > 220 && angle < 320;
    const isNorth = angle > 100 && angle < 260;
    const isSouth = angle > 280 || angle < 80;
    return { isWest, isEast, isNorth, isSouth };
  }

  function passWind(source: any[], maxPrec: number, next: number, steps: number) {
    const maxPrecInit = maxPrec;

    for (let first of source) {
      if (first[0]) {
        maxPrec = Math.min(maxPrecInit * first[1], 255);
        first = first[0];
      }

      let humidity = maxPrec - cells.h[first];
      if (humidity <= 0) continue;

      for (let s = 0, current = first; s < steps; s++, current += next) {
        if (cells.temp[current] < -5) continue;

        if (cells.h[current] < 20) {
          if (cells.h[current + next] >= 20) {
            cells.prec[current + next] += Math.max(humidity / rand(10, 20), 1);
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec);
            cells.prec[current] += 5 * modifier;
          }
          continue;
        }

        const isPassable = cells.h[current + next] <= MAX_PASSABLE_ELEVATION;
        const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
        cells.prec[current] += precipitation;
        const evaporation = precipitation > 1.5 ? 1 : 0;
        humidity = isPassable ? minmax(humidity - precipitation + evaporation, 0, maxPrec) : 0;
      }
    }
  }

  function getPrecipitation(humidity: number, i: number, n: number) {
    const normalLoss = Math.max(humidity / (10 * modifier), 1);
    const diff = Math.max(cells.h[i + n] - cells.h[i], 0);
    const mod = (cells.h[i + n] / 70) ** 2;
    return minmax(normalLoss + diff * mod, 1, humidity);
  }

  (function drawWindDirection() {
    const wind = prec.append("g").attr("id", "wind");

    d3.range(0, 6).forEach((t: number) => {
      if (westerly.length > 1) {
        const west = westerly.filter(w => w[2] === t);
        if (west && west.length > 3) {
          const from = west[0][0];
          const to = west[west.length - 1][0];
          const y = (grid.points[from][1] + grid.points[to][1]) / 2;
          wind.append("text").attr("text-rendering", "optimizeSpeed").attr("x", 20).attr("y", y).text("⇉");
        }
      }
      if (easterly.length > 1) {
        const east = easterly.filter(w => w[2] === t);
        if (east && east.length > 3) {
          const from = east[0][0];
          const to = east[east.length - 1][0];
          const y = (grid.points[from][1] + grid.points[to][1]) / 2;
          wind.append("text").attr("text-rendering", "optimizeSpeed").attr("x", graphWidth - 52).attr("y", y).text("⇇");
        }
      }
    });

    if (northerly) wind.append("text").attr("text-rendering", "optimizeSpeed").attr("x", graphWidth / 2).attr("y", 42).text("⇊");
    if (southerly)
      wind
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("x", graphWidth / 2)
        .attr("y", graphHeight - 20)
        .text("⇈");
  })();

  TIME && console.timeEnd("generatePrecipitation");
}
