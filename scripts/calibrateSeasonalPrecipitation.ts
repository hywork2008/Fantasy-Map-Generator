import { readFileSync, writeFileSync } from "node:fs";
import { getDrySeasonCandidates, getPrecipitationDailyScores, distributeSeasonalPrecipitation } from "../src/utils/precipitationSeasonality";

const input = JSON.parse(readFileSync("docs/calibration/seasonal-precipitation-v1.json", "utf8"));
const days = [31,28,31,30,31,30,31,31,30,31,30,31];
function metrics(p: number[]) {
  const annual = p.reduce((a,b)=>a+b,0), rate = p.map((v,m)=>v/days[m]);
  const mean = annual/365;
  const wet3 = Math.max(...p.map((_,m)=>p[m]+p[(m+1)%12]+p[(m+2)%12]))/annual;
  const peak = Math.max(...p);
  const dry = getDrySeasonCandidates({year: 1, annualPrecipitationMm:annual, monthlyPrecipitationMm:p, precipitationSeasonalitySource:"modeledSeasonality", precipitationSeasonalityConfidence:1});
  return {wet3, cv: Math.sqrt(rate.reduce((s,r)=>s+(r-mean)**2,0)/12)/mean, peaks:p.flatMap((v,m)=>Math.abs(v-peak)<1e-9?[m+1]:[]),dry};
}
let md = `# Seasonal precipitation v1 baseline and structural checks\n\nRun: \`node --import tsx scripts/calibrateSeasonalPrecipitation.ts\`. [Fixed inputs](../calibration/seasonal-precipitation-v1.json) contain station IDs, coordinates, retrieval dates and URLs. JMA TCC 1991-2020 normals.\n\nObserved normals are compared with the old day-proportional distribution. Synthetic terrain is not mapped to real cities; annual-total calibration is outside this work.\n\n|Station|Role|Annual mm|Observed wet3|Old wet3|Old share MAE|Daily-rate CV|Peak month|Dry candidates|\n|---|---|---:|---:|---:|---:|---:|---|---|\n`;
for (const s of input.stations) {
  const m = metrics(s.monthlyPrecipitationMm);
  md += `|${s.name}|${s.role}|${s.annualMm}|${m.wet3.toFixed(3)}|${s.uniformBaselineWetThreeMonthShare.toFixed(3)}|${s.uniformShareMae.toFixed(4)}|${m.cv.toFixed(3)}|${m.peaks}|${JSON.stringify(m.dry.intervals)}|\n`;
}
md += `\n## Synthetic forcing checks\n\nOcean supply and terrain multiplier are 1 in every month; landFraction=0.6, axial tilt=23.5 degrees, confidence=1. Geography walks are verified separately on the synthetic continent fixture. No station-level modeled MAE is calculated without matching terrain.\n\nInitial coefficients: background 0.06, convection 2.4, fronts 1.4, land convection 0.8, subsidence 2.4, ocean background 0.08. Belt widths follow the design candidates. Structural acceptance: summer-rain wet3>0.4, winter-rain cold-quarter>warm-quarter, two equatorial local maxima, no dry season under year-round wet conditions, maritime daily-rate maximum/minimum<3 at 50 degrees. These checks do not establish observational predictive accuracy.\n\n|Latitude|Continentality|Annual mm|wet3|Daily-rate CV|Peak month|Dry candidates|\n|---:|---:|---:|---:|---:|---|---|\n`;
for (const [latitude, continentality, annual] of [[18,0.6,1800],[-18,0.6,1800],[38,0.05,760],[-38,0.05,760],[0,0,2800],[50,0,840],[70,0.7,400]]) {
  const scores = getPrecipitationDailyScores({latitudeDeg:latitude, continentality, landFraction:0.6, axialTiltDeg:23.5, moisture:new Array(12).fill(1),orographic:new Array(12).fill(1)});
  const m = metrics(Array.from(distributeSeasonalPrecipitation(annual,1,scores,1,23.5).monthly));
  md += `|${latitude}|${continentality}|${annual}|${m.wet3.toFixed(3)}|${m.cv.toFixed(3)}|${m.peaks}|${JSON.stringify(m.dry.intervals)}|\n`;
}
md += `\nSeasonal allocation does not change annual totals, random draws, river generation or biomes. Solar salt production reads the new monthly amounts; normalized seasonal production weights retain existing annual capability.\n`;
writeFileSync("docs/analytics/seasonal-precipitation-v1.md", md);
