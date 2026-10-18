import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCharacters, getViewApi, getWorldContext } from "../../charactersContext";
import { resolveRaceAgeProfile } from "../../raceAge";
import { summarizeRoster } from "../../roster/model";
import { clockYear, readRoster } from "../../roster/runtime";
import type { PersonSlot, RosterSelection } from "../../roster/types";
import { useCharactersUiState } from "../charactersUiState";
import { groupOrganizations, organizationPath } from "../organizationRosterNavigation";

/** Organization and genealogy views share stable slots; rendering never generates a person. */
export function OrganizationRosterPanel() {
  const { t, i18n } = useTranslation();
  const tr = (key: string, values?: Record<string, unknown>) => String(t(`roster.${key}`, values));
  const [revision, refresh] = useState(0);
  const { organizationId, slotId, roleId, includeChildren } = useCharactersUiState(state => state.rosterNavigation);
  const setNavigation = useCharactersUiState(state => state.setRosterNavigation);
  const setOrganizationId = (organizationId?: string) => setNavigation({ organizationId });
  const setSlotId = (slotId?: string) => setNavigation({ slotId });
  const setRoleId = (roleId?: string) => setNavigation({ roleId });
  const setIncludeChildren = (includeChildren: boolean) => setNavigation({ includeChildren });
  const [simulate, setSimulate] = useState(false);
  const [successors, setSuccessors] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newCount, setNewCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const generationCancelled = useRef(false);
  const [cancelled, cancel] = useState(false);
  const [preview, setPreview] = useState<RosterSelection>();
  const [notes, setNotes] = useState("");
  const [personName, setPersonName] = useState("");
  const [relatedId, setRelatedId] = useState("");
  const [relationKind, setRelationKind] = useState("birth");
  const [tags, setTags] = useState("");
  const [watchAge, setWatchAge] = useState<number>();
  const [burgId, setBurgId] = useState(0);
  const [editor, setEditor] = useState<"FMG" | "RE" | "CE">("FMG");
  const [x, setX] = useState(0),
    [y, setY] = useState(0);
  const rosterFocus = useCharactersUiState(state => state.rosterFocus);
  const command = useCallback((payload: Record<string, unknown>) => {
    try {
      const result = getViewApi().dispatchExtensionCommand({ extensionId: "characters", name: "roster", payload });
      refresh(v => v + 1);
      setError("");
      return result?.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, []);
  useEffect(() => {
    command({ action: "build" });
    const onChange = () => refresh(v => v + 1);
    document.addEventListener("fmg:roster-changed", onChange);
    document.addEventListener("fmg:roster-stopped", onChange);
    document.addEventListener("fmg:nobility-court-changed", onChange);
    return () => {
      generationCancelled.current = true;
      document.removeEventListener("fmg:roster-changed", onChange);
      document.removeEventListener("fmg:roster-stopped", onChange);
      document.removeEventListener("fmg:nobility-court-changed", onChange);
    };
  }, [command]);
  const roster = readRoster();
  useEffect(() => {
    const s = roster?.slots.find(s => s.id === rosterFocus);
    if (s) {
      useCharactersUiState
        .getState()
        .setRosterNavigation({ slotId: s.id, organizationId: s.organizationId, roleId: undefined });
      useCharactersUiState.getState().clearRosterFocus();
    }
  }, [roster, rosterFocus]);
  const organization = roster?.organizations.find(o => o.id === organizationId);
  const slot = roster?.slots.find(s => s.id === slotId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision refreshes records mutated in place by simulation commands.
  useEffect(() => {
    setNotes(slot?.notes ?? organization?.notes ?? "");
    setPersonName(getCharacters().find(c => c.i === slot?.characterId)?.name ?? "");
    setTags(slot?.tags.join(", ") ?? "");
    setBurgId(slot?.location?.burgId ?? organization?.burgId ?? 0);
    setEditor(slot?.location?.editor ?? "FMG");
    setX(slot?.location?.x ?? 0);
    setY(slot?.location?.y ?? 0);
    setWatchAge(slot?.protection.watchAge ?? (slot ? resolveRaceAgeProfile(slot.raceId).maturity : undefined));
    setSimulate(slot ? slot.mode === "simulation" : (organization?.simulate ?? false));
    setSuccessors(organization?.generateSuccessors ?? false);
  }, [slot, organization, revision]);
  if (!roster) return <p>{tr("loading")}</p>;
  const selection: RosterSelection = {
    organizationId,
    roleId,
    descendants: includeChildren,
    mode: simulate ? "simulation" : "memo"
  };
  const summary = summarizeRoster(roster, { organizationId, descendants: true });
  const label = (s: PersonSlot) =>
    getCharacters().find(c => c.i === s.characterId)?.name ??
    `${roster.roles.find(r => r.id === s.roleId)?.name ?? tr("child")} ${s.ordinal !== undefined ? s.ordinal + 1 : ""} (${Math.max(0, Math.floor((s.deathYear ?? clockYear()) - s.birthYear))})`;
  const openSlot = (s: PersonSlot) => {
    setSlotId(s.id);
    setOrganizationId(s.organizationId);
    setRoleId(undefined);
  };
  const generate = async (target: RosterSelection) => {
    setPreview(undefined);
    setBusy(true);
    cancel(false);
    // One batch per task keeps large organizations interruptible and saves completed slots.
    try {
      let previous = -1;
      for (;;) {
        const before = getCharacters().length;
        if (before === previous) break;
        previous = before;
        const ids = command({
          action: "materialize",
          selection: { ...target, limit: target.slotIds ? undefined : 25 }
        });
        if (!Array.isArray(ids) || ids.length === 0 || target.slotIds) break;
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (generationCancelled.current) break;
      }
    } finally {
      setBusy(false);
      generationCancelled.current = false;
    }
  };
  return (
    <div style={{ minWidth: 650, maxHeight: "70vh", overflow: "auto", padding: 10 }}>
      {error && (
        <p role="alert" style={{ color: "#b22" }}>
          {error}
        </p>
      )}
      {roster.pending && (
        <div role="alert" style={{ padding: 8, border: "2px solid #b85" }}>
          {tr("stopped")} {label(roster.slots.find(s => s.id === roster.pending!.slotId)!)}:{" "}
          {tr(`stop_${roster.pending.kind}`)} ({roster.pending.year})
          <button
            type="button"
            onClick={() => {
              openSlot(roster.slots.find(s => s.id === roster.pending!.slotId)!);
            }}
          >
            {tr("inspect")}
          </button>
          <button type="button" onClick={() => command({ action: "continue" })}>
            {tr("acknowledge")}
          </button>
          {roster.remainingDays > 0 && (
            <button
              type="button"
              onClick={() => {
                const days = roster.remainingDays;
                command({ action: "continue" });
                if (!readRoster()?.pending)
                  getViewApi().events.dispatchEvent(new CustomEvent("fmg:request-time-advance", { detail: { days } }));
              }}
            >
              {tr("resumeRemaining", { days: roster.remainingDays })}
            </button>
          )}
        </div>
      )}
      <nav aria-label={tr("breadcrumb")} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        {[{ id: undefined, name: tr("world") }, ...organizationPath(roster.organizations, organizationId)].map(
          (item, index, path) => (
            <span key={item.id ?? "world"} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {index > 0 && <span aria-hidden="true">›</span>}
              {index === path.length - 1 && !slot ? (
                <strong aria-current="page">{item.name}</strong>
              ) : (
                <button
                  type="button"
                  onClick={() => setNavigation({ organizationId: item.id, slotId: undefined, roleId: undefined })}
                >
                  {item.name}
                </button>
              )}
            </span>
          )
        )}
        {slot && (
          <>
            <span aria-hidden="true">›</span>
            <strong aria-current="page">{label(slot)}</strong>
          </>
        )}
        <button type="button" onClick={() => command({ action: "build" })}>
          {tr("refresh")}
        </button>
      </nav>
      <p>{tr("summary", summary)}</p>
      {!slot && (
        <>
          {groupOrganizations(roster.organizations, organizationId, i18n.resolvedLanguage ?? i18n.language).map(
            group => (
              <section key={group.kind} aria-label={tr(group.kind)}>
                <h4>{tr(group.kind)}</h4>
                <ul>
                  {group.organizations.map(o => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setNavigation({ organizationId: o.id, slotId: undefined, roleId: undefined })}
                      >
                        {o.name}
                      </button>
                      {` — ${tr("summary", summarizeRoster(roster, { organizationId: o.id, descendants: true }))}`}
                    </li>
                  ))}
                </ul>
              </section>
            )
          )}
          <table className="table">
            <thead>
              <tr>
                <th>{tr("role")}</th>
                <th>{tr("required")}</th>
                <th>{tr("generated")}</th>
                <th>{tr("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.roles
                .filter(r => r.organizationId === organizationId)
                .map(r => (
                  <tr key={r.id}>
                    <td>
                      <label>
                        <input type="radio" checked={roleId === r.id} onChange={() => setRoleId(r.id)} />
                        {r.name}
                      </label>
                    </td>
                    <td title={r.reason}>{r.count}</td>
                    <td>
                      {
                        roster.slots.filter(
                          s => s.roleId === r.id && s.characterId !== undefined && s.deathYear === undefined
                        ).length
                      }
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          command({ action: "slots", selection: { roleId: r.id, organizationId, limit: 50 } })
                        }
                      >
                        {tr("browseSlots")}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setPreview({ ...selection, roleId: r.id })}>
                        {tr("generateRole")}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p>
            <button type="button" onClick={() => setRoleId(undefined)}>
              {tr("allRoles")}
            </button>
            <label>
              <input type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)} />
              {tr("includeSuborganizations")}
            </label>
          </p>
          <button type="button" disabled={busy} onClick={() => setPreview(selection)}>
            {tr("generateOrganization")}
          </button>
          <label>
            <input type="checkbox" checked={simulate} onChange={e => setSimulate(e.target.checked)} />
            {tr("simulate")}
          </label>
          <label>
            <input type="checkbox" checked={successors} onChange={e => setSuccessors(e.target.checked)} />
            {tr("successors")}
          </label>
          <button type="button" onClick={() => command({ action: "scope", selection, simulate, successors })}>
            {tr("applyScope")}
          </button>
          <ul>
            {roster.slots
              .filter(s => s.organizationId === organizationId && (!roleId || s.roleId === roleId))
              .slice(0, 200)
              .map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => openSlot(s)}>
                    {label(s)}
                  </button>{" "}
                  {s.deathYear !== undefined ? tr("deceased") : s.characterId ? tr("generated") : tr("undetailed")}
                </li>
              ))}
          </ul>
          <div>
            <input aria-label={tr("name")} value={newName} onChange={e => setNewName(e.target.value)} />
            <button
              type="button"
              onClick={() => command({ action: "organization", parentId: organizationId, name: newName })}
            >
              {tr("addOrganization")}
            </button>
            {organization && (
              <>
                <input
                  aria-label={tr("required")}
                  type="number"
                  min={1}
                  value={newCount}
                  onChange={e => setNewCount(+e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => command({ action: "role", organizationId, name: newName, count: newCount })}
                >
                  {tr("addRole")}
                </button>
              </>
            )}
          </div>
        </>
      )}
      {slot && (
        <>
          <p>
            {tr("born")} {slot.birthYear} / {slot.mode === "memo" ? tr("memo") : tr("simulate")} /{" "}
            {slot.deathYear !== undefined ? `${tr("deceased")} ${slot.deathYear}` : tr("living")}
          </p>
          <button type="button" onClick={() => setSlotId(undefined)}>
            {tr("organization")}
          </button>
          <button
            type="button"
            disabled={busy || slot.characterId !== undefined || slot.cancelledBirth || slot.birthYear > clockYear()}
            onClick={() => setPreview({ slotIds: [slot.id], mode: slot.mode })}
          >
            {tr("generatePerson")}
          </button>
          {slot.characterId !== undefined && (
            <button
              type="button"
              onClick={() => {
                useCharactersUiState.getState().openCharacterDetails(slot.characterId!);
                getViewApi().openDialog("characterDetails");
              }}
            >
              {tr("characterSheet")}
            </button>
          )}
          <label>
            <input type="checkbox" checked={simulate} onChange={e => setSimulate(e.target.checked)} />
            {tr("simulate")}
          </label>
          <button
            type="button"
            onClick={() => command({ action: "scope", selection: { slotIds: [slot.id] }, simulate, successors: false })}
          >
            {tr("applyScope")}
          </button>
          {slot.characterId !== undefined && (
            <div>
              <input
                aria-label={tr("personName")}
                value={personName}
                disabled={slot.protection.fields.includes("name")}
                onChange={e => setPersonName(e.target.value)}
              />
              <button type="button" onClick={() => command({ action: "rename", slotId, name: personName })}>
                {tr("saveName")}
              </button>
            </div>
          )}
          <h4>{tr("family")}</h4>
          <ul>
            {roster.links
              .filter(l => l.kind === "spouse" && (l.fromId === slot.id || l.toId === slot.id))
              .map(l => {
                const partner = roster.slots.find(s => s.id === (l.fromId === slot.id ? l.toId : l.fromId))!;
                return (
                  <li key={partner.id}>
                    {tr("partner")}{" "}
                    <button type="button" onClick={() => openSlot(partner)}>
                      {label(partner)}
                    </button>
                  </li>
                );
              })}
          </ul>
          <div>
            <select aria-label={tr("relatedPerson")} value={relatedId} onChange={e => setRelatedId(e.target.value)}>
              <option value="">{tr("relatedPerson")}</option>
              {roster.slots
                .filter(s => s.id !== slot.id)
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {label(s)}
                  </option>
                ))}
            </select>
            <select
              aria-label={tr("relationKind")}
              value={relationKind}
              onChange={e => setRelationKind(e.target.value)}
            >
              <option value="birth">{tr("birthChild")}</option>
              <option value="adoption">{tr("adoptedChild")}</option>
              <option value="spouse">{tr("partner")}</option>
            </select>
            <button
              type="button"
              onClick={() =>
                command(
                  relationKind === "spouse"
                    ? { action: "spouse", slotId, partnerId: relatedId }
                    : { action: "family", slotId, childId: relatedId, kind: relationKind }
                )
              }
            >
              {tr("addRelation")}
            </button>
          </div>
          <ul>
            {roster.family
              .filter(f => f.childId === slot.id)
              .map(f => (
                <li key={f.parentId}>
                  {tr("parentPerson")}{" "}
                  <button type="button" onClick={() => openSlot(roster.slots.find(s => s.id === f.parentId)!)}>
                    {label(roster.slots.find(s => s.id === f.parentId)!)}
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" onClick={() => command({ action: "children", slotId })}>
            {tr("listChildren")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              command({ action: "children", slotId });
              setPreview({
                slotIds: roster.family.filter(f => f.parentId === slot.id).map(f => f.childId),
                mode: slot.mode
              });
            }}
          >
            {tr("generateChildren")}
          </button>
          <ul>
            {roster.family
              .filter(f => f.parentId === slot.id)
              .map(f => {
                const child = roster.slots.find(s => s.id === f.childId)!;
                return (
                  <li key={child.id}>
                    <button type="button" onClick={() => openSlot(child)}>
                      {label(child)}
                    </button>{" "}
                    {child.cancelledBirth
                      ? tr("cancelledBirth")
                      : child.birthYear > clockYear()
                        ? tr("unborn")
                        : child.deathYear !== undefined
                          ? tr("deceased")
                          : ""}
                  </li>
                );
              })}
          </ul>
          <h4>{tr("protection")}</h4>
          <p>{tr("protectionHelp")}</p>
          <label>
            {tr("observeAge")}{" "}
            <input
              type="number"
              min={0}
              value={watchAge ?? ""}
              onChange={e => setWatchAge(e.target.value === "" ? undefined : +e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => command({ action: "watch", slotId, age: watchAge, track: "branch", death: true })}
          >
            {tr("watchChild")}
          </button>
          <select
            aria-label={tr("lineage")}
            value={slot.protection.track}
            onChange={e => command({ action: "watch", slotId, track: e.target.value, death: false })}
          >
            <option value="none">{tr("noTracking")}</option>
            <option value="branch">{tr("branch")}</option>
            <option value="all">{tr("allDescendants")}</option>
            <option value="heir">{tr("heir")}</option>
          </select>
          <button type="button" onClick={() => command({ action: "clearWatch", slotId })}>
            {tr("clearWatch")}
          </button>
          <div>
            {["name", "looks", "location", "family", "notes", "birthYear", "familyRelations", "organizationId"].map(
              field => (
                <label key={field} style={{ marginRight: 8 }}>
                  <input
                    type="checkbox"
                    checked={slot.protection.fields.includes(field)}
                    onChange={e =>
                      command({
                        action: "lock",
                        slotId,
                        fields: e.target.checked
                          ? [...slot.protection.fields, field]
                          : slot.protection.fields.filter(f => f !== field)
                      })
                    }
                  />
                  🔒 {tr(`field_${field}`)}
                </label>
              )
            )}
          </div>
          <div>
            <label>
              {tr("location")}{" "}
              <select
                value={burgId}
                disabled={slot.protection.fields.includes("location")}
                onChange={e => setBurgId(+e.target.value)}
              >
                <option value={0}>{tr("unplaced")}</option>
                {getWorldContext()
                  .pack.burgs.filter(b => b?.i && !b.removed)
                  .map(b => (
                    <option key={b.i} value={b.i}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <select aria-label={tr("map")} value={editor} onChange={e => setEditor(e.target.value as typeof editor)}>
              <option>FMG</option>
              <option>RE</option>
              <option>CE</option>
            </select>
            <input aria-label="X" type="number" value={x} onChange={e => setX(+e.target.value)} />
            <input aria-label="Y" type="number" value={y} onChange={e => setY(+e.target.value)} />
            <button type="button" onClick={() => command({ action: "location", slotId, burgId, editor, x, y })}>
              {tr("saveLocation")}
            </button>
          </div>
        </>
      )}
      {(organization || slot) && (
        <div>
          <label>
            {tr("notes")}
            <textarea
              value={notes}
              disabled={slot?.protection.fields.includes("notes")}
              onChange={e => setNotes(e.target.value)}
            />
          </label>
          {slot && (
            <label>
              {tr("tags")}
              <input value={tags} onChange={e => setTags(e.target.value)} />
            </label>
          )}
          <button
            type="button"
            onClick={() =>
              command({
                action: "notes",
                slotId,
                organizationId,
                notes,
                tags: slot
                  ? tags
                      .split(",")
                      .map(t => t.trim())
                      .filter(Boolean)
                  : undefined
              })
            }
          >
            {tr("saveNotes")}
          </button>
        </div>
      )}
      {preview && (
        <div style={{ border: "1px solid", padding: 8 }}>
          <p>
            {tr("preview", {
              count: preview.slotIds
                ? preview.slotIds.filter(id => {
                    const s = roster.slots.find(s => s.id === id);
                    return s && s.characterId === undefined && s.birthYear <= clockYear();
                  }).length
                : summarizeRoster(roster, preview).unmaterialized
            })}{" "}
            / {preview.mode === "simulation" ? tr("simulate") : tr("memo")}
          </p>
          <button type="button" onClick={() => void generate(preview)}>
            {tr("generate")}
          </button>
          <button type="button" onClick={() => setPreview(undefined)}>
            {tr("cancel")}
          </button>
        </div>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => {
            generationCancelled.current = true;
            cancel(true);
          }}
        >
          {cancelled ? tr("stopping") : tr("cancelGeneration")}
        </button>
      )}
    </div>
  );
}
