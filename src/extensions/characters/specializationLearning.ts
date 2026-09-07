import type { WorldLanguages } from "../../types/worldLanguages";
import type { Character } from "./characterTypes";
import { SPECIALIZATIONS } from "./specializationCatalog";
import {
  EXPERTISE_APTITUDE_GAIN,
  readSpecializationAxis,
  recordSpecializationExperience,
  resolveCommunication
} from "./specializations";
import type { SpecializationLearningPlan } from "./specializationTypes";

export function learningAvailable(
  student: Character,
  teacher: Character | undefined,
  plan: SpecializationLearningPlan,
  world?: WorldLanguages
): boolean {
  if (
    !teacher ||
    teacher.dead ||
    student.dead ||
    teacher.i === student.i ||
    student.location === undefined ||
    student.location !== teacher.location
  )
    return false;
  if (plan.kind === "language") {
    const language = teacher.specializations?.languages.find(entry => entry.languageId === plan.languageId);
    if (!language || !world?.languages.some(entry => entry.id === plan.languageId)) return false;
    // Oral immersion is possible without a shared language. Literacy needs oral explanation.
    if (plan.axis === "listening" || plan.axis === "speaking") return language[plan.axis] >= 50;
    const score = language.literacy.find(entry => entry.scriptId === plan.scriptId)?.[plan.axis] ?? 0;
    const listener =
      student.specializations?.languages.find(entry => entry.languageId === plan.languageId)?.listening ?? 0;
    return score >= 50 && listener >= 20;
  }
  if (plan.axis === "practice" && SPECIALIZATIONS.get(plan.domainId)?.economyDomain) return false;
  const expertise = readSpecializationAxis(teacher, plan.domainId, plan.axis) ?? 0;
  return expertise >= 50 && resolveCommunication(student, teacher, world).score >= 20;
}

/** Continuous time, cumulative annual coverage and one history entry per plan/year. */
export function advanceSpecializationLearning(
  student: Character,
  characters: readonly Character[],
  year: number,
  deltaYears: number,
  world?: WorldLanguages
): void {
  const profile = student.specializations;
  const plan = profile?.learningPlan;
  if (!profile || !plan || !(deltaYears > 0) || !Number.isSafeInteger(year)) return;
  const teacher = characters.find(character => character.i === plan.teacherId);
  if (!learningAvailable(student, teacher, plan, world)) return;
  const used = profile.experience.filter(entry => entry.year === year).reduce((sum, entry) => sum + entry.coverage, 0);
  const lessonUsed = profile.learningYear === year ? (profile.learningCoverage ?? 0) : 0;
  const coverage = Math.min(0.25 - lessonUsed, Math.max(0, 1 - used), deltaYears * 0.25);
  if (!(coverage > 0)) return;
  profile.learningYear = year;
  profile.learningCoverage = lessonUsed + coverage;
  // Multiplicative remaining distance avoids daily rounding destroying slow learning.
  const grow = (current: number, teacherScore: number, aptitude = 1) => {
    if (current >= teacherScore) return current;
    return Math.min(teacherScore, current + (100 - current) * (1 - Math.exp(-0.06 * coverage * aptitude)));
  };
  if (plan.kind === "domain") {
    const existing = profile.domains.find(entry => entry.domainId === plan.domainId);
    const current = existing?.[plan.axis] ?? 0;
    const teacherScore = readSpecializationAxis(teacher!, plan.domainId, plan.axis) ?? 0;
    // Record through the canonical accounting helper, then apply the continuous learning curve.
    const id = `lesson:${year}:${plan.domainId}:${plan.axis}:${profile.learningCoverage}`;
    const saved = recordSpecializationExperience(
      student,
      {
        id,
        year,
        domainId: plan.domainId,
        coverage,
        mode: plan.axis === "knowledge" ? "study" : plan.axis === "appraisal" ? "appraisal" : "training",
        role: "student",
        outcome: "lesson",
        source: "simulation",
        targets: []
      },
      0
    );
    if (!saved) return;
    profile.domains.find(entry => entry.domainId === plan.domainId)![plan.axis] = grow(
      current,
      teacherScore,
      EXPERTISE_APTITUDE_GAIN[existing?.aptitude ?? "ordinary"]
    );
    if (plan.axis === "practice")
      profile.domains.find(entry => entry.domainId === plan.domainId)!.lastPracticedYear = year;
    // Compact same-year lessons so one day does not allocate a permanent history row.
    const added = profile.experience.pop()!;
    const prior = profile.experience.find(entry => entry.id === `lesson:${year}:${plan.domainId}:${plan.axis}`);
    if (prior) prior.coverage += coverage;
    else profile.experience.push({ ...added, id: `lesson:${year}:${plan.domainId}:${plan.axis}` });
  } else {
    let language = profile.languages.find(entry => entry.languageId === plan.languageId);
    if (!language) {
      language = { languageId: plan.languageId, speaking: 0, listening: 0, literacy: [], acquisition: "learned" };
      profile.languages.push(language);
    }
    const teacherLanguage = teacher!.specializations!.languages.find(entry => entry.languageId === plan.languageId)!;
    if (plan.axis === "listening" || plan.axis === "speaking")
      language[plan.axis] = grow(language[plan.axis], teacherLanguage[plan.axis]);
    else {
      let script = language.literacy.find(entry => entry.scriptId === plan.scriptId);
      if (!script) {
        script = { scriptId: plan.scriptId!, reading: 0, writing: 0 };
        language.literacy.push(script);
      }
      script[plan.axis] = grow(
        script[plan.axis],
        teacherLanguage.literacy.find(entry => entry.scriptId === plan.scriptId)![plan.axis]
      );
    }
    language.lastUsedYear = year;
    const id = `language:${year}:${plan.languageId}:${plan.axis}:${plan.scriptId ?? "oral"}`;
    const previous = profile.experience.find(entry => entry.id === id);
    if (previous) previous.coverage += coverage;
    else
      profile.experience.push({
        id,
        domainId: "learning.cultures",
        year,
        coverage,
        mode: "study",
        role: "student",
        outcome: "lesson",
        source: "simulation",
        targets: [{ kind: "languagePair", id: plan.languageId }]
      });
    profile.experienceYears.study = (profile.experienceYears.study ?? 0) + coverage;
  }
}
