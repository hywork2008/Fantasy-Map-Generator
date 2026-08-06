/**
 * Sphere-local person-name variation for long-lived races.
 *
 * Mythic/ancient CC0 lists are small for some spheres (e.g. Mesopotamian).
 * Without variation, courts collapse onto a few stems (e.g. many "Inanna").
 *
 * Rules (applied only within one cultural sphere — never cross-sphere):
 * 1. Prefer an unused exact catalog form when the pool is large enough.
 * 2. Otherwise derive a **local** form: sphere affix, light vowel/consonant
 *    mutation, or stem recombination with another pool stem.
 * 3. Avoid exact duplicates among living characters in the same world pack.
 */

export type PersonNameRandom = () => number;

/** Affixes that keep names sounding inside one cultural sphere. */
export interface SphereNameMorphology {
  prefixes: readonly string[];
  suffixes: readonly string[];
  /** Optional mid-name vowel swaps (from → to pairs). */
  vowelSwaps?: readonly [string, string][];
}

/**
 * Morphology keyed by FMG real-world name_base_id (person-name sphere).
 * Patterns are generic orthographic conventions, not copyrighted name lists.
 */
export const SPHERE_MORPHOLOGY: Readonly<Record<number, SphereNameMorphology>> = {
  // German heroic
  0: {
    prefixes: ["Ald", "Eber", "Ger", "Hel", "Ort", "Sig", "Wal", "Wolf"],
    suffixes: ["bert", "brand", "hard", "helm", "mund", "rich", "wald", "win"],
    vowelSwaps: [
      ["ie", "ei"],
      ["ei", "ai"],
      ["a", "ä"]
    ]
  },
  // English / Arthurian
  1: {
    prefixes: ["Ael", "Caer", "El", "Gwyn", "Mor", "Pen", "Tal", "Uth"],
    suffixes: ["an", "or", "eth", "iel", "wyn", "red", "vain", "dras"],
    vowelSwaps: [
      ["ai", "ae"],
      ["e", "ea"]
    ]
  },
  // Castillian
  4: {
    prefixes: ["Al", "Bel", "Don", "El", "San", "Val"],
    suffixes: ["án", "ez", "io", "ora", "iel", "dor"],
    vowelSwaps: [
      ["a", "á"],
      ["e", "é"]
    ]
  },
  // Nordic
  6: {
    prefixes: ["As", "Bry", "Ey", "Gud", "Ing", "Sig", "Thor", "Ul"],
    suffixes: ["dis", "hild", "mar", "mund", "rid", "stein", "ulf", "var"],
    vowelSwaps: [
      ["i", "y"],
      ["o", "ö"],
      ["a", "á"]
    ]
  },
  // Greek
  7: {
    prefixes: ["Calli", "Neo", "Poly", "Theo", "Lys", "Arch", "Men", "Phil"],
    suffixes: ["as", "os", "is", "ia", "eia", "ion", "ides", "ene"],
    vowelSwaps: [
      ["ae", "ai"],
      ["o", "ou"],
      ["e", "ei"]
    ]
  },
  // Roman
  8: {
    prefixes: ["Aure", "Claud", "Flav", "Jul", "Luc", "Max", "Oct", "Val"],
    suffixes: ["a", "ia", "ius", "ina", "illa", "anus", "ellus", "ina"],
    vowelSwaps: [
      ["i", "y"],
      ["u", "o"]
    ]
  },
  // Chinese (romanized syllable-friendly)
  11: {
    prefixes: ["Bai", "Chang", "Hong", "Jin", "Ling", "Qing", "Xuan", "Yun"],
    suffixes: ["feng", "hua", "jun", "lan", "long", "mei", "wei", "yun"],
    vowelSwaps: [
      ["a", "ao"],
      ["i", "ei"]
    ]
  },
  // Japanese (romanized)
  12: {
    prefixes: ["Aka", "Ama", "Hiko", "Kami", "Mika", "Nao", "Taka", "Yuki"],
    suffixes: ["hime", "ko", "maro", "nari", "ro", "shi", "to", "ya"],
    vowelSwaps: [
      ["o", "ou"],
      ["u", "uu"]
    ]
  },
  // Arabic
  18: {
    prefixes: ["Abu", "Ibn", "Nur", "Saif", "Abd", "Zayn", "Far", "Jal"],
    suffixes: ["a", "ah", "an", "din", "ullah", "iya", "un", "iyya"],
    vowelSwaps: [
      ["a", "aa"],
      ["i", "ee"]
    ]
  },
  // Celtic
  22: {
    prefixes: ["Aed", "Bran", "Caer", "Dun", "Fin", "Mor", "Nim", "Rhi"],
    suffixes: ["an", "wyn", "eth", "iel", "on", "ach", "wen", "yth"],
    vowelSwaps: [
      ["a", "ae"],
      ["i", "y"],
      ["o", "oe"]
    ]
  },
  // Mesopotamian (Dark Elf default sphere) — cuneiform-name romanization patterns
  23: {
    prefixes: ["Ab", "Bel", "E", "Lugal", "Na", "Nin", "Shu", "Ur", "Zab", "Ish"],
    suffixes: ["a", "anni", "bel", "esh", "ia", "kin", "shar", "tur", "um", "u", "utu", "il"],
    vowelSwaps: [
      ["a", "á"],
      ["i", "e"],
      ["u", "o"],
      ["nn", "n"],
      ["sh", "š"]
    ]
  },
  // Iranian
  24: {
    prefixes: ["Ar", "Far", "Mehr", "Rost", "Shah", "Zar", "Key", "Giv"],
    suffixes: ["an", "dad", "far", "man", "mir", "var", "zad", "ban"],
    vowelSwaps: [
      ["a", "aa"],
      ["o", "u"]
    ]
  },
  // Levantine
  42: {
    prefixes: ["Abi", "Ben", "El", "Mal", "Sar", "Zed", "Bar", "Yon"],
    suffixes: ["ah", "el", "iah", "iel", "on", "oth", "am", "im"],
    vowelSwaps: [
      ["a", "ah"],
      ["e", "ei"]
    ]
  }
};

const DEFAULT_MORPHOLOGY: SphereNameMorphology = {
  prefixes: ["Ar", "El", "Mir", "Tor", "Val"],
  suffixes: ["an", "el", "ia", "or", "ith", "un"],
  vowelSwaps: [
    ["a", "e"],
    ["i", "y"]
  ]
};

export function morphologyForSphere(sphereId: number): SphereNameMorphology {
  return SPHERE_MORPHOLOGY[sphereId] ?? DEFAULT_MORPHOLOGY;
}

/** Normalize for uniqueness checks. */
export function normalizePersonNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function capitalizeName(name: string): string {
  if (!name) return name;
  // Preserve multi-part and apostrophes (Chang'e, King Arthur → title-case words)
  return name
    .split(/(\s+|-)/)
    .map(part => {
      if (!part || /^\s+$/.test(part) || part === "-") return part;
      if (part.includes("'")) {
        const [a, b] = part.split("'");
        return `${a.charAt(0).toUpperCase()}${a.slice(1).toLowerCase()}'${b ?? ""}`;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

/** Core stem: drop short parentheticals and take last token if multi-word title ("King Arthur" → Arthur). */
export function extractNameStem(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^(king|queen|saint|lord|lady)$/i.test(parts[0]!)) {
    return parts.slice(1).join(" ");
  }
  return cleaned;
}

function pick<T>(list: readonly T[], rnd: PersonNameRandom): T {
  return list[Math.floor(rnd() * list.length) % list.length]!;
}

/**
 * Apply one sphere-local transform to a catalog stem.
 * `attempt` rotates strategies so retries differ.
 */
export function applySphereVariation(baseName: string, sphereId: number, rnd: PersonNameRandom, attempt = 0): string {
  const morph = morphologyForSphere(sphereId);
  const stem = extractNameStem(baseName);
  const mode = (attempt + Math.floor(rnd() * 4)) % 5;

  let raw: string;
  switch (mode) {
    case 0: {
      // prefix + stem (avoid double-prefix if stem already long)
      const p = pick(morph.prefixes, rnd);
      raw =
        stem.length <= 8
          ? `${p}${stem.toLowerCase()}`
          : `${p}${stem.slice(0, Math.max(3, stem.length - 2)).toLowerCase()}`;
      break;
    }
    case 1: {
      // stem + suffix (trim trailing vowel clash)
      const s = pick(morph.suffixes, rnd);
      let core = stem;
      if (/[aeiouáéíóú]$/i.test(core) && /^[aeiou]/i.test(s)) {
        core = core.slice(0, -1);
      }
      raw = `${core}${s}`;
      break;
    }
    case 2: {
      // both ends, short stem
      const p = pick(morph.prefixes, rnd);
      const s = pick(morph.suffixes, rnd);
      const core = stem.length > 6 ? stem.slice(0, Math.ceil(stem.length * 0.6)) : stem;
      raw = `${p}${core.toLowerCase()}${s}`;
      break;
    }
    case 3: {
      // vowel / digraph swap inside stem
      const swaps = morph.vowelSwaps ?? DEFAULT_MORPHOLOGY.vowelSwaps!;
      const [from, to] = pick(swaps, rnd);
      if (stem.toLowerCase().includes(from)) {
        raw = stem.replace(new RegExp(from, "i"), to);
      } else {
        const s = pick(morph.suffixes, rnd);
        raw = `${stem}${s}`;
      }
      break;
    }
    default: {
      // soft consonant twinning on last consonant run
      raw = stem.replace(/([bcdfghjklmnpqrstvwxyz])\1?/i, (m, c: string) => `${c}${c}`);
      if (raw === stem) {
        const s = pick(morph.suffixes, rnd);
        raw = `${stem}${s}`;
      }
      break;
    }
  }

  // Keep single token preferred for UI; collapse internal spaces from bad merges
  raw = raw.replace(/\s+/g, "");
  // Length guard
  if (raw.length > 18) raw = raw.slice(0, 18);
  if (raw.length < 3) raw = `${stem}${pick(morph.suffixes, rnd)}`;

  return capitalizeName(raw);
}

/**
 * Recombine two catalog stems (same sphere only) into a hybrid personal name.
 */
export function recombineStems(a: string, b: string, sphereId: number, rnd: PersonNameRandom): string {
  const sa = extractNameStem(a);
  const sb = extractNameStem(b);
  const left = sa.slice(0, Math.max(2, Math.ceil(sa.length * (0.4 + rnd() * 0.3))));
  const right = sb.slice(Math.floor(sb.length * (0.3 + rnd() * 0.3)));
  const morph = morphologyForSphere(sphereId);
  let raw = `${left}${right}`;
  if (raw.length < 4) raw = `${left}${pick(morph.suffixes, rnd)}`;
  if (raw.length > 16) raw = raw.slice(0, 16);
  return capitalizeName(raw);
}

/**
 * Whether to keep an exact catalog form (no variation).
 * Small pools almost always vary; large pools keep exacts when still unique.
 */
export function shouldKeepExactCatalogForm(poolSize: number, isUnused: boolean, rnd: PersonNameRandom): boolean {
  if (!isUnused) return false;
  if (poolSize >= 40) return rnd() < 0.85;
  if (poolSize >= 20) return rnd() < 0.55;
  if (poolSize >= 10) return rnd() < 0.3;
  // Tiny pools (Mesopotamian, etc.): rarely use bare mythic forms
  return rnd() < 0.12;
}

/**
 * Produce a unique person name from a catalog base + optional second stem.
 */
export function uniquifyMythicPersonName(options: {
  baseName: string;
  sphereId: number;
  used: ReadonlySet<string>;
  poolSize: number;
  /** Other catalog names in the same sphere (for recombination). */
  peerNames?: readonly string[];
  random?: PersonNameRandom;
  maxAttempts?: number;
}): string {
  const rnd = options.random ?? Math.random;
  const used = options.used;
  const baseKey = normalizePersonNameKey(options.baseName);

  if (shouldKeepExactCatalogForm(options.poolSize, !used.has(baseKey), rnd)) {
    return options.baseName;
  }

  const max = options.maxAttempts ?? 16;
  for (let attempt = 0; attempt < max; attempt++) {
    let candidate: string;
    if (attempt > 0 && attempt % 4 === 3 && options.peerNames && options.peerNames.length > 1) {
      const peer = options.peerNames[Math.floor(rnd() * options.peerNames.length)]!;
      candidate = recombineStems(options.baseName, peer, options.sphereId, rnd);
    } else {
      candidate = applySphereVariation(options.baseName, options.sphereId, rnd, attempt);
    }
    const key = normalizePersonNameKey(candidate);
    if (!used.has(key) && key !== baseKey) return candidate;
    // Allow same as base only if base itself unused (already handled); otherwise continue
    if (!used.has(key)) return candidate;
  }

  // Last resort: base + sphere suffix index (still orthographic, not "Inanna 2")
  const morph = morphologyForSphere(options.sphereId);
  for (let i = 0; i < morph.suffixes.length; i++) {
    const candidate = capitalizeName(`${extractNameStem(options.baseName)}${morph.suffixes[i]}`);
    if (!used.has(normalizePersonNameKey(candidate))) return candidate;
  }
  for (let i = 0; i < morph.prefixes.length; i++) {
    const candidate = capitalizeName(`${morph.prefixes[i]}${extractNameStem(options.baseName).toLowerCase()}`);
    if (!used.has(normalizePersonNameKey(candidate))) return candidate;
  }

  // Extremely crowded: short orthographic salt from sphere consonants
  const salt = pick(morph.suffixes, rnd);
  return capitalizeName(`${extractNameStem(options.baseName).slice(0, 8)}${salt}`);
}
