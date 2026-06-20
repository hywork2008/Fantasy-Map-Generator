declare module "alea" {
  interface AleaRandom {
    (): number;
    uint32(): number;
    fract53(): number;
    exportState(): [number, number, number, number];
    importState(state: [number, number, number, number]): void;
  }
  interface AleaConstructor {
    (...args: unknown[]): AleaRandom;
    importState(state: [number, number, number, number]): AleaRandom;
  }
  const Alea: AleaConstructor;
  export = Alea;
}

declare module "jquery-ui-dist/jquery-ui.js";
declare module "jquery-ui-touch-punch";

declare module "rgbquant" {
  interface RgbQuantOptions {
    colors?: number;
    method?: number;
    initColors?: number;
    minHueCols?: number;
    dithKern?: string | null;
    dithDelta?: number;
    dithSerp?: boolean;
    palette?: [number, number, number][];
    reIndex?: boolean;
    useCache?: boolean;
    cacheFreq?: number;
    colorDist?: string;
  }
  class RgbQuant {
    constructor(options?: RgbQuantOptions);
    sample(image: HTMLCanvasElement | HTMLImageElement): void;
    reduce(image: HTMLCanvasElement | HTMLImageElement): Uint8Array;
    palette(flat?: boolean): [number, number, number][];
  }
  export = RgbQuant;
}
