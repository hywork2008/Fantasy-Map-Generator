import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPrice } from "../../../hostUtils";
import { getApi, getWorldContext } from "../../charactersContext";
import { describeCharacterFinance } from "../../financialLifecycle";
import { readReference } from "../../reference/model";
import { previewPreset } from "../../roster/presets";
import { PRESET_IDS, type PresetPreview, type PresetQuery } from "../../roster/presetTypes";
import { clockYear } from "../../roster/runtime";
import type { WorldRoster } from "../../roster/types";
import { useCharactersUiState } from "../charactersUiState";
import { RosterInstitutionSetup } from "./RosterInstitutionSetup";

interface Props {
  roster: WorldRoster;
  organizationId?: string;
  command: (payload: Record<string, unknown>) => unknown;
}
export function RosterPresetPanel({ roster, organizationId, command }: Props) {
  const { t } = useTranslation();
  const tr = (key: string, values?: Record<string, unknown>) => String(t(`rosterPresets.${key}`, values));
  const query = useCharactersUiState(s => s.presetQuery);
  const setQuery = useCharactersUiState(s => s.setPresetQuery);
  const open = useCharactersUiState(s => s.presetOpen);
  const setOpen = useCharactersUiState(s => s.setPresetOpen);
  const [preview, setPreview] = useState<PresetPreview>();
  const [name, setName] = useState("");
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"memo" | "simulation">(roster.referenceProfile ? "simulation" : "memo");
  const reference = readReference(getApi().simulationContext);
  const referenceProfileId = roster.referenceProfile?.id;
  useEffect(() => {
    if (referenceProfileId) setMode("simulation");
  }, [referenceProfileId]);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    []
  );
  const change = (value: Partial<PresetQuery>) => {
    setQuery({ ...query, ...value });
    setPreview(undefined);
  };
  const run = async (planId: string) => {
    stop.current = false;
    setRunning(true);
    try {
      while (!stop.current) {
        const result = command({ action: "presetBatch", planId });
        if (typeof result !== "number") break;
        const plan = roster.presetPlans?.find(p => p.id === planId);
        if (!plan || plan.cursor >= plan.seats.length) break;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      setRunning(false);
      setPreview(undefined);
    }
  };
  const states = (getWorldContext().pack.states ?? []).filter(s => s.i && !s.removed);
  const availableOrgs = roster.organizations.filter(o => !o.archived).sort((a, b) => a.name.localeCompare(b.name));
  const rows = preview
    ? [...new Set(preview.seats.map(s => s.roleId))].map(id => {
        const role = roster.roles.find(r => r.id === id)!;
        const seats = preview.seats.filter(s => s.roleId === id);
        return { role, seats, org: roster.organizations.find(o => o.id === role.organizationId)! };
      })
    : [];
  return (
    <section style={{ border: "1px solid #777", padding: 8, margin: "8px 0" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {tr("title")}
      </button>
      {open && (
        <>
          <fieldset disabled={running} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <legend>{tr("selection")}</legend>
            <label>
              {tr("profile")}{" "}
              <select
                value={query.profile ?? (roster.referenceProfile ? "master-20261022-v1" : "household-funded-v1")}
                onChange={e => change({ profile: e.target.value as PresetQuery["profile"] })}
              >
                <option value="master-20261022-v1" disabled={!roster.referenceProfile}>
                  {tr("masterProfile")}
                </option>
                <option value="household-funded-v1">{tr("expandedProfile")}</option>
              </select>
            </label>
            <p>{tr(roster.referenceProfile ? "masterProfileHelp" : "legacyProfileHelp")}</p>
            {roster.referenceProfile && (
              <p>
                {tr("referenceDate", {
                  commit: roster.referenceProfile.commit.slice(0, 10),
                  year: roster.referenceProfile.year,
                  month: roster.referenceProfile.month,
                  day: roster.referenceProfile.day
                })}
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 4 }}>
              {PRESET_IDS.filter(id => !id.startsWith("master-") || !!reference).map(id => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={query.presets.includes(id)}
                    onChange={e =>
                      change({
                        presets: e.target.checked ? [...query.presets, id] : query.presets.filter(p => p !== id)
                      })
                    }
                  />
                  {tr(`presets.${id}`)}
                </label>
              ))}
            </div>
            <details>
              <summary>
                {tr("countries")}: {query.stateIds?.length ?? tr("allCountries")}
              </summary>
              <label>
                <input
                  type="checkbox"
                  checked={query.stateIds === undefined}
                  onChange={e => change({ stateIds: e.target.checked ? undefined : [] })}
                />
                {tr("allCountries")}
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {states.map(s => (
                  <label key={s.i}>
                    <input
                      type="checkbox"
                      checked={query.stateIds?.includes(s.i) ?? true}
                      onChange={e => {
                        const ids = query.stateIds ?? states.map(s => s.i);
                        change({ stateIds: e.target.checked ? [...ids, s.i] : ids.filter(id => id !== s.i) });
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </details>
            <label>
              {tr("organization")}{" "}
              <select
                value={query.organizationId ?? ""}
                onChange={e => change({ organizationId: e.target.value || undefined })}
              >
                <option value="">{tr("allOrganizations")}</option>
                {availableOrgs.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({getWorldContext().pack.states[o.stateId]?.name ?? tr("independent")})
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button type="button" onClick={() => change({ organizationId, stateIds: undefined })}>
                {tr("currentScope")}
              </button>{" "}
              <label>
                <input
                  type="checkbox"
                  checked={query.descendants}
                  onChange={e => change({ descendants: e.target.checked })}
                />
                {tr("descendants")}
              </label>
            </div>
            <label>
              {tr("geography")}{" "}
              <select
                value={query.geography}
                onChange={e => change({ geography: e.target.value as PresetQuery["geography"] })}
              >
                <option value="affiliation">{tr("affiliation")}</option>
                <option value="activity">{tr("activity")}</option>
              </select>
            </label>
            <label>
              {tr("depth")}{" "}
              <select value={query.depth} onChange={e => change({ depth: e.target.value as PresetQuery["depth"] })}>
                {["heads", "leaders", "all"].map(v => (
                  <option key={v} value={v}>
                    {tr(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("clergy")}{" "}
              <select value={query.clergy} onChange={e => change({ clergy: e.target.value as PresetQuery["clergy"] })}>
                <option value="urban">{tr("urban")}</option>
                <option value="parishes">{tr("parishes")}</option>
              </select>
            </label>
            <label>
              {tr("military")}{" "}
              <select
                value={query.military}
                onChange={e => change({ military: e.target.value as PresetQuery["military"] })}
              >
                {["all", "land", "sea", "corps"].map(v => (
                  <option key={v} value={v}>
                    {tr(v === "all" ? "allForces" : v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={query.includeReligiousLords}
                onChange={e => change({ includeReligiousLords: e.target.checked })}
              />
              {tr("includeReligiousLords")}
            </label>
            <div>
              <button
                type="button"
                disabled={!query.presets.length}
                onClick={() => setPreview(previewPreset(roster, query, clockYear()))}
              >
                {tr("preview")}
              </button>
            </div>
            <label>
              {tr("saveName")}{" "}
              <input aria-label={tr("saveName")} value={name} onChange={e => setName(e.target.value)} />{" "}
              <button
                type="button"
                disabled={!name.trim() || !query.presets.length}
                onClick={() => command({ action: "savePreset", name, query })}
              >
                {tr("save")}
              </button>
            </label>
            {!!roster.savedPresets?.length && (
              <label>
                {tr("saved")}{" "}
                <select
                  value=""
                  onChange={e => {
                    const preset = roster.savedPresets?.find(p => p.id === e.target.value);
                    if (preset) {
                      setQuery(structuredClone(preset.query));
                      setPreview(undefined);
                    }
                  }}
                >
                  <option value="">{tr("choose")}</option>
                  {roster.savedPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
          {preview && (
            <div>
              <p role="status">{tr("counts", preview as unknown as Record<string, unknown>)}</p>
              {preview.warnings.map(w => (
                <p key={w}>{tr(`warnings.${w}`)}</p>
              ))}
              {preview.unresolved > 0 && <p>{tr("unresolvedHelp")}</p>}
              <div style={{ maxHeight: 260, overflow: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      {[
                        "organization",
                        "role",
                        "occupation",
                        "required",
                        "existing",
                        "new",
                        "reason",
                        ...(reference ? ["initialCash", "cash", "family"] : [])
                      ].map(k => (
                        <th key={k}>{tr(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ role, seats, org }) => (
                      <tr key={role.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              useCharactersUiState
                                .getState()
                                .setRosterNavigation({ organizationId: org.id, slotId: undefined, roleId: role.id })
                            }
                          >
                            {org.name}
                          </button>
                        </td>
                        <td>{role.name}</td>
                        <td>{role.occupation ?? "—"}</td>
                        <td>{seats.length}</td>
                        <td>{seats.filter(s => s.status === "existing").length}</td>
                        <td>{seats.filter(s => s.status === "new").length}</td>
                        <td>
                          {role.reason}
                          {reference &&
                            (() => {
                              const ids = new Set(seats.flatMap(s => (s.slotId ? [s.slotId] : [])));
                              const shared = [
                                ...new Set(
                                  roster.appointments
                                    .filter(a => a.roleId !== role.id && a.endYear === undefined && ids.has(a.slotId))
                                    .map(a => roster.roles.find(r => r.id === a.roleId)?.name)
                                    .filter(Boolean)
                                )
                              ];
                              return shared.length ? <p>{tr("sharedOffices", { roles: shared.join(", ") })}</p> : null;
                            })()}
                        </td>
                        {reference && (
                          <>
                            <td>
                              {formatPrice(
                                seats.reduce((sum, s) => {
                                  const slot = roster.slots.find(p => p.id === s.slotId);
                                  return (
                                    sum + (reference.people.find(p => p.id === slot?.referenceId)?.initialWealth ?? 0)
                                  );
                                }, 0)
                              )}
                            </td>
                            <td>
                              {formatPrice(
                                seats.reduce((sum, s) => {
                                  const slot = roster.slots.find(p => p.id === s.slotId);
                                  return sum + (describeCharacterFinance(slot)?.balance ?? 0);
                                }, 0)
                              )}
                            </td>
                            <td>
                              {tr(
                                "referenceFamilies",
                                seats.reduce(
                                  (counts, s) => {
                                    const slot = roster.slots.find(p => p.id === s.slotId);
                                    const family = reference.people.find(p => p.id === slot?.referenceId)?.family;
                                    if (family)
                                      for (const field of [
                                        "spouses",
                                        "children",
                                        "grandchildren",
                                        "greatGrandchildren"
                                      ] as const)
                                        counts[field] += family[field];
                                    return counts;
                                  },
                                  { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 }
                                )
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label>
                {tr("participation")}{" "}
                <select value={mode} onChange={e => setMode(e.target.value as "memo" | "simulation")}>
                  <option value="simulation">{tr("simulationMode")}</option>
                  <option value="memo">{tr("memoMode")}</option>
                </select>
              </label>
              <p>{tr(mode === "memo" ? "memoHelp" : "simulationHelp")}</p>
              <button
                type="button"
                disabled={running || !preview.generate}
                onClick={() => {
                  const id = command({ action: "presetPlan", query, expected: JSON.stringify(preview), mode });
                  if (typeof id === "string") void run(id);
                }}
              >
                {tr("generate")}
              </button>
            </div>
          )}
          {running && (
            <button
              type="button"
              onClick={() => {
                stop.current = true;
              }}
            >
              {tr("stop")}
            </button>
          )}
          {(roster.presetPlans ?? [])
            .filter(p => !p.discarded && p.cursor < p.seats.length)
            .map(p => (
              <div key={p.id}>
                {tr("progress", { done: p.cursor, total: p.seats.length })}{" "}
                <button type="button" disabled={running} onClick={() => void run(p.id)}>
                  {tr("resume")}
                </button>{" "}
                <button
                  type="button"
                  disabled={running}
                  onClick={() => command({ action: "discardPresetPlan", planId: p.id })}
                >
                  {tr("discard")}
                </button>
              </div>
            ))}
          <RosterInstitutionSetup roster={roster} command={command} />
        </>
      )}
    </section>
  );
}
