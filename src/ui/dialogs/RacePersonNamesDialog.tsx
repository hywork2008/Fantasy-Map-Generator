import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  configurablePersonNameRaces,
  DEFAULT_RACE_PERSON_NAME_SPHERES,
  PERSON_NAME_SPHERE_OPTIONS,
  type RacePersonNameMapping,
  type RacePersonNameSphereConfig,
  resolveRacePersonNameMapping,
  sphereLabel
} from "../../data/racePersonNameConfig";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import type { RaceKey } from "../../types/models";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const RACE_ROWS = configurablePersonNameRaces();

function sphereSelectValue(id: number | null | undefined): string {
  if (id === null || id === undefined) return "null";
  return String(id);
}

function parseSphereSelectValue(raw: string): number | null {
  if (raw === "null") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export const RacePersonNamesDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("racePersonNames"));
  const stored = useOptionsState(s => s.racePersonNameSpheres);
  const setOption = useOptionsState(s => s.setOption);

  const [draft, setDraft] = useState<Record<string, RacePersonNameSphereConfig>>(() =>
    resolveRacePersonNameMapping(stored)
  );

  useEffect(() => {
    if (isOpen) setDraft(resolveRacePersonNameMapping(useOptionsState.getState().racePersonNameSpheres));
  }, [isOpen]);

  const summary = useMemo(() => {
    const longLived = ["elf", "dark_elf", "dwarf", "giant", "draconic"] as const;
    return longLived
      .map(key => {
        const cfg = draft[key];
        if (!cfg) return null;
        const race = RACE_ROWS.find(r => r.key === key)?.name ?? key;
        const primary = sphereLabel(cfg.primary);
        const alt = cfg.alternate !== undefined ? ` / ${sphereLabel(cfg.alternate)}` : "";
        return `${race}: ${primary}${alt}`;
      })
      .filter(Boolean)
      .join(" · ");
  }, [draft]);

  const updateRace = (key: RaceKey, field: "primary" | "alternate", value: number | null | undefined) => {
    setDraft(prev => {
      const current = prev[key] ?? { primary: null };
      if (field === "primary") {
        return { ...prev, [key]: { ...current, primary: value === undefined ? null : value } };
      }
      // alternate: undefined means clear (use primary only)
      if (value === undefined) {
        const { alternate: _drop, ...rest } = current;
        return { ...prev, [key]: { ...rest, primary: rest.primary ?? null } };
      }
      return { ...prev, [key]: { ...current, alternate: value } };
    });
  };

  const handleSave = () => {
    const mapping: RacePersonNameMapping = {};
    for (const [key, cfg] of Object.entries(draft)) {
      mapping[key] = {
        primary: cfg.primary,
        ...(cfg.alternate !== undefined ? { alternate: cfg.alternate } : {})
      };
    }
    setOption("racePersonNameSpheres", mapping);
    closeDialog("racePersonNames");
  };

  const handleReset = () => {
    setDraft(resolveRacePersonNameMapping(DEFAULT_RACE_PERSON_NAME_SPHERES));
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Race person names"
      onClose={() => closeDialog("racePersonNames")}
      style={{ minWidth: "32em", maxWidth: "42em" }}
      buttons={[
        { label: "Reset defaults", onClick: handleReset },
        { label: "Cancel", onClick: () => closeDialog("racePersonNames") },
        { label: "Save", onClick: handleSave }
      ]}
    >
      <div data-tip="Assign a cultural name sphere to each race. Long-lived races use CC0 mythic/ancient names from that sphere only.">
        <p style={{ marginTop: 0 }}>
          Choose which <strong>person-name sphere</strong> each race uses when generating High/Dark Fantasy cultures.
          Place names still use the culture namesbase. Changes apply on the next map generation (or regenerate
          cultures).
        </p>
        <p style={{ fontSize: "0.9em", opacity: 0.85, marginBottom: "0.75em" }}>{summary}</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Race</th>
              <th style={{ textAlign: "left" }} data-tip="Used for the first culture of this race">
                Primary sphere
              </th>
              <th
                style={{ textAlign: "left" }}
                data-tip="Optional: used for a second culture of the same race (e.g. Eldar vs Quenian)"
              >
                Alternate
              </th>
            </tr>
          </thead>
          <tbody>
            {RACE_ROWS.map(race => {
              const cfg = draft[race.key] ?? { primary: null };
              return (
                <tr key={race.key}>
                  <td style={{ padding: "0.25em 0.4em 0.25em 0" }}>{race.name}</td>
                  <td style={{ padding: "0.25em 0.4em" }}>
                    <select
                      value={sphereSelectValue(cfg.primary)}
                      onChange={e => updateRace(race.key, "primary", parseSphereSelectValue(e.target.value))}
                      aria-label={`${race.name} primary person-name sphere`}
                    >
                      {PERSON_NAME_SPHERE_OPTIONS.map(opt => (
                        <option key={String(opt.id)} value={sphereSelectValue(opt.id)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "0.25em 0" }}>
                    <select
                      value={cfg.alternate === undefined ? "none" : sphereSelectValue(cfg.alternate)}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === "none") updateRace(race.key, "alternate", undefined);
                        else updateRace(race.key, "alternate", parseSphereSelectValue(raw));
                      }}
                      aria-label={`${race.name} alternate person-name sphere`}
                    >
                      <option value="none">— same as primary —</option>
                      {PERSON_NAME_SPHERE_OPTIONS.map(opt => (
                        <option key={String(opt.id)} value={sphereSelectValue(opt.id)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontSize: "0.85em", opacity: 0.8, marginBottom: 0 }}>
          <strong>Markov</strong> keeps short-lived races on place-name generation. Mythic spheres only apply when the
          race lifespan is long enough (≥ 150 years).
        </p>
      </div>
    </Dialog>
  );
};
