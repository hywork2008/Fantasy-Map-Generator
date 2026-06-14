export interface RNGService {
  rand(min?: number, max?: number): number;
  P(probability: number): boolean;
  each(n: number): (i: number) => boolean;
  gauss(expected?: number, deviation?: number, min?: number, max?: number, round?: number): number;
  Pint(float: number): number;
  ra<T>(array: T[]): T;
  rw(object: { [key: string]: number }): string;
  biased(min: number, max: number, ex: number): number;
  getNumberInRange(r: string): number;
  generateSeed(): string;
}

export interface StorageService {
  get(key: string): Promise<Blob | null>;
  set(key: string, value: Blob): Promise<void>;
}

export interface AppServices {
  rng: RNGService;
  storage: StorageService;
  COArenderer: { trigger(id: string, coa: unknown): unknown; shieldPaths: Record<string, string> } | null;
}

/**
 * Mutable container for application-level services.
 * Populated by main.ts or respective service initialization.
 */
export const appServices: AppServices = {
  rng: {} as RNGService,
  storage: {} as StorageService,
  COArenderer: null
};
