export interface AleaState {
  s0: number;
  s1: number;
  s2: number;
  c: number;
}

export class AleaPRNG {
  private s0: number = 0;
  private s1: number = 0;
  private s2: number = 0;
  private c: number = 1;

  constructor(seed?: any) {
    this.init(seed !== undefined ? seed : Date.now());
  }

  private init(seed: any): void {
    let n = 0xefc8249d;
    const mash = (data: string) => {
      for (let i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        let h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 0x100000000; // 2^32
      }
      return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
    };

    const seedStr = String(seed);
    this.s0 = mash(" ");
    this.s1 = mash(" ");
    this.s2 = mash(" ");

    this.s0 -= mash(seedStr);
    if (this.s0 < 0) this.s0 += 1;
    this.s1 -= mash(seedStr);
    if (this.s1 < 0) this.s1 += 1;
    this.s2 -= mash(seedStr);
    if (this.s2 < 0) this.s2 += 1;

    this.c = 1;
  }

  public fract32(): number {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10; // 2^-32
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.c = t | 0;
    this.s2 = t - this.c;
    return this.s2;
  }

  public int32(): number {
    return (this.fract32() * 0x100000000) >>> 0;
  }

  public double(): number {
    return this.fract32() + this.fract32() * 0x200000 * 1.1102230246251565e-16; // 2^-53
  }

  public exportState(): AleaState {
    return {
      s0: this.s0,
      s1: this.s1,
      s2: this.s2,
      c: this.c
    };
  }

  public importState(state: AleaState): void {
    this.s0 = state.s0;
    this.s1 = state.s1;
    this.s2 = state.s2;
    this.c = state.c;
  }
}

export function aleaPRNG(seed: any): () => number {
  const prng = new AleaPRNG(seed);
  return () => prng.fract32();
}
