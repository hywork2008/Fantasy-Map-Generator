import Alea from "alea";
import { Names } from "../../hostCore";
import { P, rand, TIME } from "../../hostUtils";
import { CENTRAL_OFFICES, resolveRulerTitle } from "../data/titleTable";
import { getWorldContext } from "../nobilityContext";
import type { Character, CharacterFamily, CharacterSkills, Gender } from "./characterTypes";

export type {
  Character,
  CharacterFamily,
  CharacterPersonality,
  CharacterSkills,
  Gender,
  TitleHolding
} from "./characterTypes";

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
      const ruler = this.createPerson(nextId++, state.culture, undefined, state);
      ruler.titles.push({
        title: resolveRulerTitle(state, ruler.gender),
        landed: true,
        entityType: "state",
        entityId: state.i
      });
      characters.push(ruler);
      state.rulerId = ruler.i;

      for (const office of CENTRAL_OFFICES) {
        const officer = this.createPerson(nextId++, state.culture, office.primarySkill, state);
        officer.titles.push({ title: office.title, landed: false, entityType: "state", entityId: state.i });
        characters.push(officer);
      }
    }

    this.calculateAffinities(characters);

    pack.characters = characters;
    TIME && console.timeEnd("generateCharacters");
  }

  private calculateAffinities(characters: Character[]) {
    const { pack } = this.worldContext;
    const states = pack.states.filter(s => s.i && !s.removed);

    for (const state of states) {
      if (state.rulerId === undefined) continue;
      const ruler = characters.find(c => c.i === state.rulerId);
      if (!ruler) continue;

      const diplomacy = state.diplomacy || [];

      for (const other of states) {
        if (state.i === other.i) continue;

        let affinity = 0;

        // Base affinity on history (core diplomacy)
        const rel = diplomacy[other.i];
        if (rel === "Enemy") affinity -= 50;
        else if (rel === "Rival") affinity -= 30;
        else if (rel === "Suspicion") affinity -= 15;
        else if (rel === "Ally") affinity += 30;
        else if (rel === "Suzerain" || rel === "Vassal") affinity += 15;

        // Additional hatred based on the number of past wars (blood feud)
        let warCount = 0;
        if (state.campaigns) {
          warCount = state.campaigns.filter(
            c =>
              (c.attacker === state.i && c.defender === other.i) || (c.attacker === other.i && c.defender === state.i)
          ).length;
        }
        if (warCount > 0) {
          affinity -= 20 * warCount; // The more wars they fought, the deeper the hatred
        }

        // Culture modifier (proxy for religion/cultural similarity)
        if (state.culture === other.culture && state.culture !== 0) {
          affinity += 10;
        } else if (state.culture !== other.culture) {
          affinity -= 10;
        }

        // Form/Marriage modifier
        // Assuming "Monarchy" is a standard form.
        const isMonarchy = (s: { form?: string }) => s.form === "Monarchy";
        if (isMonarchy(state) && isMonarchy(other)) {
          // Dynastic ties: chance to form a marriage alliance (max 2 per family to prevent excessive ties)
          if (affinity >= -10 && P(0.05) && ruler.marriages.length < 2) {
            // Check if the other ruler also hasn't reached the limit
            let otherRuler: Character | undefined;
            if (other.rulerId !== undefined) {
              otherRuler = characters.find(c => c.i === other.rulerId);
            }

            if (!otherRuler || otherRuler.marriages.length < 2) {
              affinity += 80;
              if (!ruler.marriages.includes(other.i)) ruler.marriages.push(other.i);

              if (otherRuler && !otherRuler.marriages.includes(state.i)) {
                otherRuler.marriages.push(state.i);
              }
            }
          }
        } else if (state.form !== other.form) {
          // Different forms might have slight negative affinity
          affinity -= 5;
        }

        // Clamp between -100 and 100
        ruler.affinities[other.i] = Math.max(-100, Math.min(100, affinity));
      }
    }
  }

  clear() {
    const { pack } = this.worldContext;
    pack.characters = [];
    for (const state of pack.states) delete state.rulerId;
  }

  private generateFamily(age: number, formName?: string): CharacterFamily {
    if (age < 16) {
      return { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 };
    }

    let spouseBase = 1; // Monogamy default
    if (formName) {
      if (["Horde", "Khaganate", "Khanate", "Empire"].includes(formName)) {
        spouseBase += rand(2, 6); // Harem
      } else if (["Emirate", "Caliphate", "Satrapy", "Beylik", "Sultanate"].includes(formName)) {
        spouseBase += rand(0, 3); // Polygamy
      } else if (["Theocracy", "Holy State", "Bishopric"].includes(formName)) {
        spouseBase = P(0.8) ? 1 : 0; // Celibacy chance
      }
    }

    const spouses = spouseBase;
    const yearsMarried = Math.max(0, age - 16);

    // For monogamy, child-bearing years are capped at ~30 years (e.g., age 16 to 46) due to menopause.
    // For polygamy/harem, the ruler can continually take younger spouses, so fertile years scale with age.
    const fertileYears = spouses === 1 ? Math.min(yearsMarried, 30) : yearsMarried;

    // Base rate: 1 surviving child every 4 years of fertility per spouse.
    const expectedChildren = spouses * (fertileYears / 4);
    let children = Math.round(expectedChildren * (0.5 + Math.random()));
    if (children < 0) children = 0;

    let grandchildren = 0;
    if (age >= 35) {
      grandchildren = Math.round(children * rand(1, 3) * ((age - 35) / 30));
    }

    let greatGrandchildren = 0;
    if (age >= 55) {
      greatGrandchildren = Math.round(grandchildren * rand(0, 2) * ((age - 55) / 20));
    }

    return { spouses, children, grandchildren, greatGrandchildren };
  }

  private createPerson(
    i: number,
    cultureId: number,
    primarySkill: keyof CharacterSkills | undefined,
    stateData: { form?: string; formName?: string }
  ): Character {
    const gender: Gender = P(0.5) ? "male" : "female";
    const age = rand(MIN_RULER_AGE, MAX_RULER_AGE);
    const isReligiousRole =
      stateData.form === "Theocracy" ||
      (stateData.formName && ["Theocracy", "Holy State", "Bishopric"].includes(stateData.formName)) ||
      primarySkill === "learning";

    const guile = rand(1, 100);
    const piety = isReligiousRole ? rand(60, 100) : rand(1, 100);
    // Religious figures are typically zealous, unless they are highly guileful (deceitful)
    const zeal = isReligiousRole && guile < 70 ? rand(50, 100) : rand(1, 100);

    const baseAppearance = rand(1, 100);
    const appearance = age > 35 ? Math.max(1, baseAppearance - Math.floor((age - 35) * 1.5)) : baseAppearance;

    const baseProwess = primarySkill === "prowess" ? rand(40, 100) : rand(1, 100);
    // Physical decline
    const prowess = age > 35 ? Math.max(1, baseProwess - Math.floor((age - 35) * 2)) : baseProwess;

    return {
      i,
      name: Names.getCulture(cultureId),
      age,
      gender,
      culture: cultureId,
      appearance,
      prestige: rand(1, 100),
      titles: [],
      affinities: {},
      marriages: [],
      skills: {
        artistry: rand(1, 100),
        diplomacy: primarySkill === "diplomacy" ? rand(40, 100) : rand(1, 100),
        engineering: rand(1, 100),
        geography: rand(1, 100),
        intrigue: primarySkill === "intrigue" ? rand(40, 100) : rand(1, 100),
        learning: primarySkill === "learning" ? rand(40, 100) : rand(1, 100),
        martial: primarySkill === "martial" ? rand(40, 100) : rand(1, 100),
        prowess,
        stewardship: primarySkill === "stewardship" ? rand(40, 100) : rand(1, 100)
      },
      personality: {
        boldness: rand(1, 100),
        compassion: rand(1, 100),
        greed: rand(1, 100),
        honor: rand(1, 100),
        rationality: rand(1, 100),
        sociability: rand(1, 100),
        vengefulness: rand(1, 100),
        zeal,
        energy: rand(1, 100),
        piety,
        guile
      },
      family: this.generateFamily(age, stateData.formName)
    };
  }
}

export const Characters = new CharactersModule();
