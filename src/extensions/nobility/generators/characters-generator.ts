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

/** Physical decline sets in past this age — mirrors the generation-time formula in createPerson(). */
const DECLINE_AGE_THRESHOLD = 35;
const APPEARANCE_DECLINE_PER_YEAR = 1.5;
const PROWESS_DECLINE_PER_YEAR = 2;

/** Total decline accrued by `age` under the generation-time formula (0 below the threshold). */
function declineAt(age: number, ratePerYear: number): number {
  return age > DECLINE_AGE_THRESHOLD ? Math.floor((age - DECLINE_AGE_THRESHOLD) * ratePerYear) : 0;
}

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

    const currentYear = this.worldContext.options.year;

    const states = pack.states.filter(s => s.i && !s.removed);
    for (const state of states) {
      const ruler = this.createPerson(nextId++, state.culture, undefined, state);
      ruler.location = state.capital;
      ruler.titles.push({
        title: resolveRulerTitle(state, ruler.gender),
        landed: true,
        entityType: "state",
        entityId: state.i,
        startYear: currentYear - rand(0, Math.max(0, ruler.age - 20))
      });
      characters.push(ruler);
      state.rulerId = ruler.i;

      for (const office of CENTRAL_OFFICES) {
        const officer = this.createPerson(nextId++, state.culture, office.primarySkill, state);
        officer.location = state.capital;
        officer.titles.push({
          title: office.title,
          landed: false,
          entityType: "state",
          entityId: state.i,
          startYear: currentYear - rand(0, Math.max(0, officer.age - 20))
        });
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

  advanceAge(deltaYears: number): void {
    if (deltaYears <= 0) return;
    const { pack } = this.worldContext;
    if (!pack.characters?.length) return;

    for (const character of pack.characters) {
      if (character.dead) continue;

      const oldAge = character.age;
      const newAge = Math.round(oldAge + deltaYears);

      const appearanceDecline =
        declineAt(newAge, APPEARANCE_DECLINE_PER_YEAR) - declineAt(oldAge, APPEARANCE_DECLINE_PER_YEAR);
      const prowessDecline = declineAt(newAge, PROWESS_DECLINE_PER_YEAR) - declineAt(oldAge, PROWESS_DECLINE_PER_YEAR);

      character.age = newAge;
      if (appearanceDecline > 0) character.appearance = Math.max(1, character.appearance - appearanceDecline);
      if (prowessDecline > 0) character.skills.prowess = Math.max(1, character.skills.prowess - prowessDecline);

      // Mortality Check: Base risk 1% per year, increasing exponentially past 50.
      const mortalityRisk = 0.01 + (newAge > 50 ? 1.15 ** (newAge - 50) / 100 : 0);
      const survivalProb = (1 - Math.min(0.99, mortalityRisk)) ** deltaYears;
      if (Math.random() > survivalProb) {
        character.dead = true;
        for (const t of character.titles) {
          t.endYear = this.worldContext.options.year;
          character.pastTitles.push(t);
        }
        character.titles = [];
        continue;
      }

      // Resignation Check
      if (character.titles.length > 0) {
        for (let i = character.titles.length - 1; i >= 0; i--) {
          const title = character.titles[i];
          if (title.entityType === "state") {
            const state = pack.states[title.entityId];
            if (!state || state.removed) {
              title.endYear = this.worldContext.options.year;
              character.pastTitles.push(title);
              character.titles.splice(i, 1);
              continue;
            }
            const threat = this.evaluateStateThreat(state.i);
            const isRuler = state.rulerId === character.i;

            // Rulers do not easily resign, only appointed officers.
            if (!isRuler) {
              const officeDef = CENTRAL_OFFICES.find(o => o.title === title.title);
              const skillValue = officeDef ? character.skills[officeDef.primarySkill] : 50;

              // Stress calculation: High threat + low specific skill + low boldness
              const stress = threat * 10 + (100 - skillValue) * 0.5 + (100 - character.personality.boldness) * 0.5;
              if (stress > 150 && P(0.1 * deltaYears)) {
                title.endYear = this.worldContext.options.year;
                character.pastTitles.push(title);
                character.titles.splice(i, 1);

                // Move to a random burg in their homeland state (if any) or capital
                const stateBurgs = pack.burgs.filter(b => b.state === state.i && !b.removed);
                if (stateBurgs.length > 0) {
                  character.location = stateBurgs[rand(0, stateBurgs.length - 1)].i;
                }
              }
            }
          }
        }
      }
    }

    this.processSuccessions();
  }

  private evaluateStateThreat(stateId: number): number {
    const { pack } = this.worldContext;
    const state = pack.states[stateId];
    if (!state?.diplomacy) return 0;

    let threat = 0;
    state.diplomacy.forEach(rel => {
      if (rel === "Enemy") threat += 5;
      if (rel === "Rival") threat += 2;
    });
    return threat;
  }

  private evaluateOfficeAttractiveness(
    character: Character,
    office: (typeof CENTRAL_OFFICES)[0] | undefined,
    threat: number
  ): number {
    if (!office) return 0;
    const skillVal = character.skills[office.primarySkill] || 50;
    let score = skillVal;

    // War-mongers want martial positions during high threat
    if (office.primarySkill === "martial") {
      score += threat * (character.personality.boldness / 50) * (character.personality.vengefulness / 50);
    }
    // Greedy characters prefer stewardship
    if (office.primarySkill === "stewardship") {
      score += character.personality.greed * 0.5;
    }
    // Manipulators prefer intrigue
    if (office.primarySkill === "intrigue") {
      score += character.personality.guile * 0.5;
    }

    return score;
  }

  private processSuccessions(): void {
    const { pack } = this.worldContext;
    const states = pack.states.filter(s => s.i && !s.removed);
    let nextId = Math.max(0, ...pack.characters.map(c => c.i)) + 1;

    for (const state of states) {
      const livingStateChars = pack.characters.filter(c => !c.dead && c.titles.some(t => t.entityId === state.i));

      let rulerVacant = false;
      const currentRuler = pack.characters.find(c => c.i === state.rulerId);
      if (!currentRuler || currentRuler.dead || !currentRuler.titles.some(t => t.landed)) {
        rulerVacant = true;
      }

      const vacantOffices = CENTRAL_OFFICES.filter(
        office => !livingStateChars.some(c => c.titles.some(t => t.title === office.title))
      );

      const threat = this.evaluateStateThreat(state.i);

      // Musical Chairs: Let veterans shift to vacant, more attractive offices
      let changesMade = true;
      while (changesMade && vacantOffices.length > 0) {
        changesMade = false;

        for (const office of vacantOffices) {
          let bestCandidate: Character | null = null;
          let bestScore = -1;

          for (const vet of livingStateChars) {
            if (vet.i === state.rulerId) continue; // Rulers don't step down to officer
            const currentTitle = vet.titles.find(t => !t.landed && t.entityId === state.i);
            if (!currentTitle) continue;

            const currentOffice = CENTRAL_OFFICES.find(o => o.title === currentTitle.title);
            const currentScore = this.evaluateOfficeAttractiveness(vet, currentOffice, threat);
            const vacantScore = this.evaluateOfficeAttractiveness(vet, office, threat);

            // Needs to be significantly more attractive to bother switching
            if (vacantScore > currentScore + 20 && vacantScore > bestScore) {
              bestScore = vacantScore;
              bestCandidate = vet;
            }
          }

          if (bestCandidate) {
            const currentTitleIndex = bestCandidate.titles.findIndex(t => !t.landed && t.entityId === state.i);
            const oldTitle = bestCandidate.titles[currentTitleIndex];
            const oldTitleName = oldTitle.title;

            // Move old title to past titles
            oldTitle.endYear = this.worldContext.options.year;
            bestCandidate.pastTitles.push({ ...oldTitle });

            // Reassign to new title
            bestCandidate.titles[currentTitleIndex].title = office.title;
            bestCandidate.titles[currentTitleIndex].startYear = this.worldContext.options.year;

            vacantOffices.splice(vacantOffices.indexOf(office), 1);
            const oldOfficeDef = CENTRAL_OFFICES.find(o => o.title === oldTitleName);
            if (oldOfficeDef) vacantOffices.push(oldOfficeDef);

            changesMade = true;
            break;
          }
        }
      }

      // Generate replacements for remaining vacancies
      if (rulerVacant) {
        const heir = this.createPerson(nextId++, state.culture, undefined, state);

        // Setup Heir relationships if possible
        if (currentRuler) {
          heir.family.fatherId = currentRuler.gender === "male" ? currentRuler.i : undefined;
          heir.family.motherId = currentRuler.gender === "female" ? currentRuler.i : undefined;
          heir.age = Math.max(16, currentRuler.age - rand(16, 40));

          if (!currentRuler.family.childIds) currentRuler.family.childIds = [];
          currentRuler.family.childIds.push(heir.i);
        }

        heir.location = state.capital;
        heir.titles.push({
          title: resolveRulerTitle(state, heir.gender),
          landed: true,
          entityType: "state",
          entityId: state.i,
          startYear: this.worldContext.options.year
        });
        pack.characters.push(heir);
        state.rulerId = heir.i;
      }

      for (const office of vacantOffices) {
        const officer = this.createPerson(nextId++, state.culture, office.primarySkill, state);
        officer.location = state.capital;
        officer.titles.push({
          title: office.title,
          landed: false,
          entityType: "state",
          entityId: state.i,
          startYear: this.worldContext.options.year
        });
        pack.characters.push(officer);
      }
    }
  }

  private generateFamily(age: number, gender: Gender, formName?: string): CharacterFamily {
    if (age < 16) {
      return { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, spouseIds: [], childIds: [] };
    }

    let spouseBase = 1; // Monogamy default
    if (formName) {
      if (["Horde", "Khaganate", "Khanate", "Empire"].includes(formName) && gender === "male") {
        spouseBase += rand(2, 6); // Harem
      } else if (["Emirate", "Caliphate", "Satrapy", "Beylik", "Sultanate"].includes(formName) && gender === "male") {
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

    return { spouses, children, grandchildren, greatGrandchildren, spouseIds: [], childIds: [] };
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

    const skills = {
      artistry: rand(1, 100),
      diplomacy: primarySkill === "diplomacy" ? rand(40, 100) : rand(1, 100),
      engineering: rand(1, 100),
      geography: rand(1, 100),
      intrigue: primarySkill === "intrigue" ? rand(40, 100) : rand(1, 100),
      learning: primarySkill === "learning" ? rand(40, 100) : rand(1, 100),
      martial: primarySkill === "martial" ? rand(40, 100) : rand(1, 100),
      prowess,
      stewardship: primarySkill === "stewardship" ? rand(40, 100) : rand(1, 100)
    };

    const avgSkill = Math.round(
      (skills.artistry +
        skills.diplomacy +
        skills.engineering +
        skills.geography +
        skills.intrigue +
        skills.learning +
        skills.martial +
        skills.prowess +
        skills.stewardship) /
        9
    );

    // Confidence: based on average skill with a ±20 random variance
    const confidence = Math.max(1, Math.min(100, avgSkill + rand(-20, 20)));

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
      skills,
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
        guile,
        confidence
      },
      family: this.generateFamily(age, gender, stateData.formName),
      pastTitles: [],
      state: stateData.i
    };
  }
}

export const Characters = new CharactersModule();
