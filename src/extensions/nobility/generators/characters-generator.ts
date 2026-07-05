import Alea from "alea";
import { Names } from "../../hostCore";
import { P, rand, TIME } from "../../hostUtils";
import { CENTRAL_OFFICES, resolveRulerTitle } from "../data/titleTable";
import { getWorldContext } from "../nobilityContext";

export type Gender = "male" | "female";

export interface TitleHolding {
  /** Gender-resolved display title, e.g. "King", "Prime Minister", "Khan". */
  title: string;
  /** true = sovereign/territorial ruler; false = government office. */
  landed: boolean;
  /** Literal union today; extend with "province" | "burg" once those levels are generated. */
  entityType: "state";
  /** pack.states[] id. */
  entityId: number;
}

export interface Character {
  i: number;
  name: string;
  age: number;
  gender: Gender;
  /** pack.cultures id — drives name generation. */
  culture: number;
  /**
   * Array (not a single field) so a future personal union — one character
   * holding titles over multiple states — needs no schema change. Phase 1
   * always populates exactly one entry per character.
   */
  titles: TitleHolding[];
}

const MIN_RULER_AGE = 28;
const MAX_RULER_AGE = 65;

export class CharactersModule {
  private get worldContext() {
    return getWorldContext();
  }

  generate(options: { randomSeed?: number } = {}) {
    TIME && console.time("generateCharacters");
    Math.random = Alea(options.randomSeed ?? this.worldContext.seed);

    const { pack } = this.worldContext;
    const characters: Character[] = [];
    let nextId = 0;

    const states = pack.states.filter(s => s.i && !s.removed);
    for (const state of states) {
      const ruler = this.createPerson(nextId++, state.culture);
      ruler.titles.push({
        title: resolveRulerTitle(state, ruler.gender),
        landed: true,
        entityType: "state",
        entityId: state.i
      });
      characters.push(ruler);
      state.rulerId = ruler.i;

      for (const office of CENTRAL_OFFICES) {
        const officer = this.createPerson(nextId++, state.culture);
        officer.titles.push({ title: office, landed: false, entityType: "state", entityId: state.i });
        characters.push(officer);
      }
    }

    pack.characters = characters;
    TIME && console.timeEnd("generateCharacters");
  }

  clear() {
    const { pack } = this.worldContext;
    pack.characters = [];
    for (const state of pack.states) delete state.rulerId;
  }

  private createPerson(i: number, culture: number): Character {
    const gender: Gender = P(0.5) ? "male" : "female";
    return {
      i,
      name: Names.getCulture(culture),
      age: rand(MIN_RULER_AGE, MAX_RULER_AGE),
      gender,
      culture,
      titles: []
    };
  }
}

export const Characters = new CharactersModule();
