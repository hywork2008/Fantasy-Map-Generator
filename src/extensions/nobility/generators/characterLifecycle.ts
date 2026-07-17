import Alea from "alea";
import type { Character, CharacterSkills } from "../../characters/characterTypes";
import { createPerson } from "../../characters/personFactory";
import { calculateCharacterTraits } from "../../characters/utils/personalityUtils";
import type { Province, State } from "../../hostTypes";
import { P, rand, TIME } from "../../hostUtils";
import { CENTRAL_OFFICES, resolveProvinceLordTitle, resolveRulerTitle } from "../data/titleTable";
import { getRulerId, getWorldContext, setRulerId } from "../nobilityContext";

export type {
  Character,
  CharacterFamily,
  CharacterPersonality,
  CharacterSkills,
  Gender,
  TitleHolding
} from "../../characters/characterTypes";

const MIN_RULER_AGE = 28;
const MAX_RULER_AGE = 65;

const MIN_OFFICER_AGE = 22;
const MAX_OFFICER_AGE = 60;

function getNextCharacterId(characters: Character[]): number {
  return Math.max(0, ...characters.map(c => c.i), -1) + 1;
}

function clearStateRulerIds(): void {
  const { pack } = getWorldContext();
  for (const state of pack.states ?? []) setRulerId(state, undefined);
}

function preserveNonPoliticalCharacters(characters: Character[] = []): Character[] {
  return characters.filter(character => {
    if (!character.roles?.length) return false;

    character.titles = [];
    character.affinities = {};
    character.marriages = [];
    return true;
  });
}

/** True for state forms whose central offices should skew towards a devout/zealous personality roll. */
function isReligiousForm(
  stateData: { form?: string; formName?: string },
  primarySkill?: keyof CharacterSkills
): boolean {
  return (
    stateData.form === "Theocracy" ||
    (!!stateData.formName && ["Theocracy", "Holy State", "Bishopric"].includes(stateData.formName)) ||
    primarySkill === "learning"
  );
}

function generate(options: { randomSeed?: number } = {}): void {
  TIME && console.time("generateCharacters");
  const worldContext = getWorldContext();
  Math.random = Alea(options.randomSeed ?? worldContext.seed);

  const { pack } = worldContext;
  clearStateRulerIds();
  const characters: Character[] = [...preserveNonPoliticalCharacters(pack.characters)];
  let nextId = getNextCharacterId(characters);

  const currentYear = Number(worldContext.options.year) || 1000;
  const states = pack.states.filter(s => s.i && !s.removed);

  for (const state of states) {
    const ruler = createPerson(nextId++, state.culture, {
      homeStateId: state.i,
      formName: state.formName,
      marriageExpectation: "dynastic",
      isReligiousRole: isReligiousForm(state)
    });
    ruler.location = state.capital;
    ruler.titles.push({
      title: resolveRulerTitle(state, ruler.gender),
      landed: true,
      entityType: "state",
      entityId: state.i,
      startYear: currentYear - rand(0, Math.max(0, ruler.age - 20))
    });
    characters.push(ruler);
    setRulerId(state, ruler.i);

    for (const office of CENTRAL_OFFICES) {
      const officer = createPerson(nextId++, state.culture, {
        homeStateId: state.i,
        formName: state.formName,
        marriageExpectation: "elite",
        primarySkill: office.primarySkill,
        isReligiousRole: isReligiousForm(state, office.primarySkill)
      });
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

  calculateAffinities(characters);

  pack.characters = characters;
  TIME && console.timeEnd("generateCharacters");
}

function calculateAffinities(characters: Character[]): void {
  const { pack } = getWorldContext();
  const states = pack.states.filter(s => s.i && !s.removed);

  for (const state of states) {
    const rulerId = getRulerId(state);
    if (rulerId === undefined) continue;
    const ruler = characters.find(c => c.i === rulerId);
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
          c => (c.attacker === state.i && c.defender === other.i) || (c.attacker === other.i && c.defender === state.i)
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
          const otherRulerId = getRulerId(other);
          if (otherRulerId !== undefined) {
            otherRuler = characters.find(c => c.i === otherRulerId);
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

/**
 * Creates a standalone field/fleet officer for `state` and appends them to pack.characters.
 * Unlike the fixed central offices, officers are not part of every state's roster —
 * callers (see officerAssignment.ts) decide sparsely and randomly which regiments get one.
 */
function createOfficer(
  state: Pick<State, "i" | "culture" | "form" | "formName" | "capital">,
  title: "Commander" | "Admiral"
): Character {
  const { pack } = getWorldContext();
  const nextId = getNextCharacterId(pack.characters);
  const officer = createPerson(nextId, state.culture, {
    homeStateId: state.i,
    formName: state.formName,
    marriageExpectation: "elite",
    primarySkill: "martial",
    isReligiousRole: isReligiousForm(state, "martial"),
    ageOverride: rand(MIN_OFFICER_AGE, MAX_OFFICER_AGE)
  });
  officer.location = state.capital;
  officer.titles.push({
    title,
    landed: false,
    entityType: "state",
    entityId: state.i,
    startYear: getWorldContext().options.year
  });
  pack.characters.push(officer);
  return officer;
}

/**
 * Creates a landed lord for a frontier province and appends them to pack.characters.
 * Only provinces flagged as a frontier by getProvinceThreats() get one — see
 * provinceLordGenerator.ts — so interior provinces don't add to the character roster.
 */
function createProvinceLord(
  state: Pick<State, "i" | "culture" | "form" | "formName">,
  province: Pick<Province, "i" | "formName" | "burg">
): Character {
  const { pack } = getWorldContext();
  const nextId = getNextCharacterId(pack.characters);
  const lord = createPerson(nextId, state.culture, {
    homeStateId: state.i,
    formName: state.formName,
    marriageExpectation: "dynastic",
    primarySkill: "martial",
    isReligiousRole: isReligiousForm(state, "martial"),
    ageOverride: rand(MIN_RULER_AGE, MAX_RULER_AGE)
  });
  lord.location = province.burg;
  lord.titles.push({
    title: resolveProvinceLordTitle(province, lord.gender),
    landed: true,
    entityType: "province",
    entityId: province.i,
    startYear: getWorldContext().options.year
  });
  pack.characters.push(lord);
  return lord;
}

function clear(): void {
  const { pack } = getWorldContext();
  pack.characters = preserveNonPoliticalCharacters(pack.characters);
  clearStateRulerIds();
}

/**
 * Political pass B: title resignation/deposition checks, retired-character local effects, and
 * succession/office reassignment. Must run immediately after Characters.advanceAge() (Pass A —
 * generic aging/mortality, no title-table knowledge) within the same tick, because
 * processRetiredCharacterEffects() below needs to see each character's *final* titles state for
 * this tick (death already applied by Pass A, resignation applied earlier in this same pass) —
 * see docs/plan/char-economy.md for the two-pass split rationale.
 */
function processResignationsAndSuccessions(deltaYears: number): void {
  const { pack } = getWorldContext();
  if (!pack.characters?.length) return;

  for (const character of pack.characters) {
    if (character.dead) continue;

    // Resignation Check
    if (character.titles.length > 0) {
      for (let i = character.titles.length - 1; i >= 0; i--) {
        const title = character.titles[i];
        if (title.entityType === "state") {
          const state = pack.states[title.entityId];
          if (!state || state.removed) {
            title.endYear = getWorldContext().options.year;
            title.reason = "State Destroyed";
            character.pastTitles.push(title);
            character.titles.splice(i, 1);
            continue;
          }
          const isRuler = getRulerId(state) === character.i;

          // Rulers do not easily resign, only appointed officers.
          if (!isRuler) {
            if (title.title === "Regent") {
              const ruler = pack.characters.find(c => c.i === getRulerId(state));
              if (ruler && ruler.age >= 16) {
                // Ruler has come of age, Regent must step down
                title.endYear = getWorldContext().options.year;
                title.reason = "Ruler came of age";
                character.pastTitles.push(title);
                character.titles.splice(i, 1);
                continue;
              }
            }

            const threat = evaluateStateThreat(state.i);

            // Purged / Deposed by rivals
            if (threat > 5 && character.personality.guile < 40 && character.personality.honor > 60) {
              if (P(0.015 * deltaYears)) {
                title.endYear = getWorldContext().options.year;
                title.reason = "Deposed by political rivals";
                character.pastTitles.push(title);
                character.titles.splice(i, 1);
                continue;
              }
            }

            const officeDef =
              CENTRAL_OFFICES.find(o => o.title === title.title) ||
              (title.title === "Regent"
                ? { title: "Regent", primarySkill: "stewardship" as keyof CharacterSkills }
                : undefined);
            const skillValue = officeDef ? character.skills[officeDef.primarySkill!] : 50;

            // Stress calculation: High threat + low specific skill + low boldness
            const stress = threat * 10 + (100 - skillValue) * 0.5 + (100 - character.personality.boldness) * 0.5;
            if (stress > 150 && P(0.1 * deltaYears)) {
              title.endYear = getWorldContext().options.year;
              title.reason = "Resigned (Stress)";
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

    // Retired Characters Local Development Bonus
    processRetiredCharacterEffects(character, deltaYears);
  }

  processSuccessions();
}

function processRetiredCharacterEffects(character: Character, deltaYears: number): void {
  if (character.dead || character.titles.length > 0 || character.location === undefined) return;

  const { pack } = getWorldContext();
  const burg = pack.burgs[character.location];
  if (!burg || burg.removed) return;

  const skills = character.skills;
  const p = character.personality;

  // Population Growth (Benevolent elder)
  const { good, bad } = calculateCharacterTraits(p);

  if (good > bad && skills.stewardship > 60) {
    const boost = (skills.stewardship / 100) * deltaYears * 0.1; // 100 people per year at 100 stewardship
    if (burg.demographics) {
      burg.demographics.capacity += boost;
      burg.demographics.children += boost * 0.25;
      burg.demographics.maleAdults += boost * 0.25;
      burg.demographics.femaleAdults += boost * 0.25;
      burg.demographics.elders += boost * 0.25;
    }
    burg.population = (burg.population || 0) + boost;
  }

  // Fortifications
  if (skills.engineering > 70 && P(0.01 * deltaYears)) {
    burg.walls = (burg.walls || 0) + 1;
  }
  // Plaza
  if ((skills.artistry > 70 || skills.diplomacy > 70) && P(0.01 * deltaYears)) {
    burg.plaza = (burg.plaza || 0) + 1;
  }
  // Temple
  if ((skills.learning > 70 || p.piety > 70) && P(0.01 * deltaYears)) {
    burg.temple = (burg.temple || 0) + 1;
  }
}

function evaluateStateThreat(stateId: number): number {
  const { pack } = getWorldContext();
  const state = pack.states[stateId];
  if (!state?.diplomacy) return 0;

  let threat = 0;
  state.diplomacy.forEach(rel => {
    if (rel === "Enemy") threat += 5;
    if (rel === "Rival") threat += 2;
  });
  return threat;
}

function evaluateOfficeAttractiveness(
  character: Character,
  office: (typeof CENTRAL_OFFICES)[0] | undefined,
  threat: number
): number {
  if (!office) return 0;
  const skillVal = office.primarySkill ? character.skills[office.primarySkill] : 50;
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

function processSuccessions(): void {
  const { pack } = getWorldContext();
  const states = pack.states.filter(s => s.i && !s.removed);
  let nextId = Math.max(0, ...pack.characters.map(c => c.i)) + 1;

  for (const state of states) {
    const livingStateChars = pack.characters.filter(
      c => !c.dead && c.titles.some(t => t.entityType === "state" && t.entityId === state.i)
    );

    let rulerVacant = false;
    let currentRuler = pack.characters.find(c => c.i === getRulerId(state));
    if (!currentRuler || currentRuler.dead || !currentRuler.titles.some(t => t.landed)) {
      rulerVacant = true;
    }

    // Generate replacement for ruler immediately so we can check if they are underage
    if (rulerVacant) {
      let heirAge: number | undefined;
      const isHereditary = state.form === "Monarchy" || state.form === "Dictatorship";

      if (currentRuler) {
        if (isHereditary) {
          if (currentRuler.age < 16) {
            // If a child ruler dies, the heir is usually an adult relative (uncle/cousin)
            heirAge = rand(16, 50);
          } else {
            heirAge = Math.max(0, currentRuler.age - rand(15, 45));
          }
        } else {
          // Republics, Theocracies, etc. elect/appoint established adults
          heirAge = rand(35, 75);
        }
      }

      const heir = createPerson(nextId++, state.culture, {
        homeStateId: state.i,
        formName: state.formName,
        marriageExpectation: "dynastic",
        isReligiousRole: isReligiousForm(state),
        ageOverride: heirAge
      });

      // Setup Heir relationships if possible
      if (currentRuler && isHereditary) {
        // If the heir is young enough, assume they are a direct child
        if (heir.age < currentRuler.age - 14) {
          heir.family.fatherId = currentRuler.gender === "male" ? currentRuler.i : undefined;
          heir.family.motherId = currentRuler.gender === "female" ? currentRuler.i : undefined;

          if (!currentRuler.family.childIds) currentRuler.family.childIds = [];
          currentRuler.family.childIds.push(heir.i);
        }
      }

      heir.location = state.capital;
      let rulerTitleName = resolveRulerTitle(state, heir.gender);
      if (heir.age < 16) {
        rulerTitleName += " (Under Regency)";
      }

      heir.titles.push({
        title: rulerTitleName,
        landed: true,
        entityType: "state",
        entityId: state.i,
        startYear: getWorldContext().options.year
      });
      pack.characters.push(heir);
      setRulerId(state, heir.i);
      currentRuler = heir;
      // The heir is now part of the living state characters if we do further processing
      livingStateChars.push(heir);
    }

    const vacantOffices = CENTRAL_OFFICES.filter(
      office => !livingStateChars.some(c => c.titles.some(t => t.title === office.title))
    ).map(o => ({ ...o }));

    // If the current ruler is underage, ensure there's a Regent office
    if (currentRuler && currentRuler.age < 16) {
      const hasRegent = livingStateChars.some(c => c.titles.some(t => t.title === "Regent"));
      if (!hasRegent) {
        vacantOffices.push({ title: "Regent", primarySkill: "stewardship" });
      }
    }

    const threat = evaluateStateThreat(state.i);

    // Musical Chairs: Let veterans shift to vacant, more attractive offices
    let changesMade = true;
    while (changesMade && vacantOffices.length > 0) {
      changesMade = false;

      for (const office of vacantOffices) {
        let bestCandidate: Character | null = null;
        let bestScore = -1;

        for (const vet of livingStateChars) {
          if (vet.i === getRulerId(state)) continue; // Rulers don't step down to officer
          const currentTitle = vet.titles.find(t => !t.landed && t.entityId === state.i);
          if (!currentTitle) continue;

          const currentOffice =
            CENTRAL_OFFICES.find(o => o.title === currentTitle.title) ||
            (currentTitle.title === "Regent"
              ? { title: "Regent", primarySkill: "stewardship" as keyof CharacterSkills }
              : undefined);
          const currentScore = evaluateOfficeAttractiveness(vet, currentOffice, threat);
          const vacantScore = evaluateOfficeAttractiveness(vet, office, threat);

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
          oldTitle.endYear = getWorldContext().options.year;
          oldTitle.reason = "Reassigned";
          bestCandidate.pastTitles.push({ ...oldTitle });

          // Reassign to new title
          bestCandidate.titles[currentTitleIndex].title = office.title;
          bestCandidate.titles[currentTitleIndex].startYear = getWorldContext().options.year;

          vacantOffices.splice(vacantOffices.indexOf(office), 1);
          const oldOfficeDef =
            CENTRAL_OFFICES.find(o => o.title === oldTitleName) ||
            (oldTitleName === "Regent"
              ? { title: "Regent", primarySkill: "stewardship" as keyof CharacterSkills }
              : undefined);
          if (oldOfficeDef) vacantOffices.push(oldOfficeDef);

          changesMade = true;
          break;
        }
      }
    }

    for (const office of vacantOffices) {
      const officer = createPerson(nextId++, state.culture, {
        homeStateId: state.i,
        formName: state.formName,
        marriageExpectation: "elite",
        primarySkill: office.primarySkill,
        isReligiousRole: isReligiousForm(state, office.primarySkill)
      });
      officer.location = state.capital;
      officer.titles.push({
        title: office.title,
        landed: false,
        entityType: "state",
        entityId: state.i,
        startYear: getWorldContext().options.year
      });
      pack.characters.push(officer);
    }
  }
}

export const Characters = {
  generate,
  createOfficer,
  createProvinceLord,
  clear,
  processResignationsAndSuccessions
};
