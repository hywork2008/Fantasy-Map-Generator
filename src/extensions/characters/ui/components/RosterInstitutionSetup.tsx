import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getWorldContext } from "../../charactersContext";
import { religiousSiteCandidates } from "../../roster/institutions";
import { ROLE_PURPOSES, type RolePurpose } from "../../roster/presetTypes";
import type { WorldRoster } from "../../roster/types";

export function RosterInstitutionSetup({
  roster,
  command
}: {
  roster: WorldRoster;
  command: (payload: Record<string, unknown>) => unknown;
}) {
  const { t } = useTranslation();
  const tr = (key: string, values?: Record<string, unknown>) => String(t(`rosterPresets.${key}`, values));
  const [religionId, setReligionId] = useState(0),
    [name, setName] = useState("");
  const [burgIds, setBurgIds] = useState<number[]>([]);
  const [parishPopulation, setParishPopulation] = useState(3000),
    [citiesPerDiocese, setCitiesPerDiocese] = useState(8),
    [share, setShare] = useState(100);
  const [patronId, setPatronId] = useState(""),
    [supplierId, setSupplierId] = useState(""),
    [representative, setRepresentative] = useState(""),
    [ordinal, setOrdinal] = useState(1),
    [domain, setDomain] = useState("");
  const [roleId, setRoleId] = useState(""),
    [purposes, setPurposes] = useState<RolePurpose[]>([]);
  const [roleCount, setRoleCount] = useState(1),
    [occupation, setOccupation] = useState(""),
    [majorLord, setMajorLord] = useState(false);
  const [orgId, setOrgId] = useState(""),
    [orgKind, setOrgKind] = useState("institution"),
    [formation, setFormation] = useState("");
  const [sourceRole, setSourceRole] = useState(""),
    [targetRole, setTargetRole] = useState(""),
    [sourceOrdinal, setSourceOrdinal] = useState(1),
    [targetOrdinal, setTargetOrdinal] = useState(1);
  const pack = getWorldContext().pack;
  const religions = (pack.religions ?? []).filter(r => r?.i && !r.removed);
  const candidates = religionId ? religiousSiteCandidates(religionId) : [];
  const selected = burgIds.map(id => pack.burgs[id]);
  const priests = selected.reduce(
    (sum, b) =>
      sum +
      Math.max(
        1,
        Math.ceil(
          ((b.population ?? 0) *
            (getWorldContext().populationRate || 1000) *
            (getWorldContext().urbanization || 1) *
            share) /
            100 /
            parishPopulation
        )
      ),
    0
  );
  const organizations = roster.organizations
    .filter(o => !o.archived)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const supplierRoles = roster.roles.filter(r => r.organizationId === supplierId && r.count > 0);
  const chosenRole = supplierRoles.find(r => r.id === representative);
  const valid =
    !!religionId &&
    !!name.trim() &&
    !!burgIds.length &&
    Number.isInteger(parishPopulation) &&
    parishPopulation > 0 &&
    Number.isInteger(citiesPerDiocese) &&
    citiesPerDiocese > 0 &&
    share > 0 &&
    share <= 100;
  return (
    <>
      <details>
        <summary>{tr("churchSetup")}</summary>
        <p>{tr("churchHelp")}</p>
        <label>
          {tr("religion")}{" "}
          <select
            value={religionId}
            onChange={e => {
              setReligionId(Number(e.target.value));
              setBurgIds([]);
              setName(pack.religions[Number(e.target.value)]?.name ?? "");
            }}
          >
            <option value={0}>{tr("choose")}</option>
            {religions.map(r => (
              <option key={r.i} value={r.i}>
                {r.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {tr("organizationName")} <input value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <label>
            {tr("parishPopulation")}{" "}
            <input
              type="number"
              min={1}
              value={parishPopulation}
              onChange={e => setParishPopulation(Number(e.target.value))}
            />
          </label>
          <label>
            {tr("citiesPerDiocese")}{" "}
            <input
              type="number"
              min={1}
              value={citiesPerDiocese}
              onChange={e => setCitiesPerDiocese(Number(e.target.value))}
            />
          </label>
          <label>
            {tr("share")}{" "}
            <input type="number" min={1} max={100} value={share} onChange={e => setShare(Number(e.target.value))} />%
          </label>
        </div>
        <p>{tr("candidateHelp")}</p>
        <button type="button" onClick={() => setBurgIds(candidates.filter(c => c.temple).map(c => c.id))}>
          {tr("templeCandidates")}
        </button>{" "}
        <button type="button" onClick={() => setBurgIds(candidates.map(c => c.id))}>
          {tr("allCandidates")}
        </button>{" "}
        <label>
          {tr("addSite")}{" "}
          <select
            value=""
            onChange={e => {
              const id = Number(e.target.value);
              if (id && !burgIds.includes(id)) setBurgIds([...burgIds, id]);
            }}
          >
            <option value="">{tr("choose")}</option>
            {(pack.burgs ?? [])
              .filter(b => b?.i && !b.removed)
              .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
              .map(b => (
                <option key={b.i} value={b.i}>
                  {b.name} ({pack.states[b.state ?? 0]?.name ?? tr("independent")})
                </option>
              ))}
          </select>
        </label>
        <div style={{ maxHeight: 150, overflow: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[...new Set([...candidates.map(c => c.id), ...burgIds])].map(id => (
            <label key={id}>
              <input
                type="checkbox"
                checked={burgIds.includes(id)}
                onChange={e => setBurgIds(e.target.checked ? [...burgIds, id] : burgIds.filter(i => i !== id))}
              />
              {pack.burgs[id].name}
            </label>
          ))}
        </div>
        {valid && (
          <p>
            {tr("churchCounts", {
              cities: burgIds.length,
              dioceses: Math.ceil(burgIds.length / citiesPerDiocese),
              priests,
              head: 1
            })}
          </p>
        )}
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            const result = command({
              action: "church",
              setup: { religionId, name, burgIds, parishPopulation, citiesPerDiocese, adherentShare: share / 100 }
            });
            if (typeof result === "string") setBurgIds([]);
          }}
        >
          {tr("establishChurch")}
        </button>
      </details>
      <details>
        <summary>{tr("patronageSetup")}</summary>
        <p>{tr("patronageHelp")}</p>
        <label>
          {tr("patron")}{" "}
          <select value={patronId} onChange={e => setPatronId(e.target.value)}>
            <option value="">{tr("choose")}</option>
            {organizations.map(o => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {tr("supplier")}{" "}
          <select
            value={supplierId}
            onChange={e => {
              setSupplierId(e.target.value);
              setRepresentative("");
              setOrdinal(1);
            }}
          >
            <option value="">{tr("choose")}</option>
            {organizations
              .filter(o => ["company", "market", "guild", "institution"].includes(o.kind ?? ""))
              .map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>{" "}
        <label>
          {tr("representative")}{" "}
          <select
            value={representative}
            onChange={e => {
              setRepresentative(e.target.value);
              setOrdinal(1);
            }}
          >
            <option value="">{tr("choose")}</option>
            {supplierRoles.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {tr("ordinal")}{" "}
          <input
            type="number"
            min={1}
            max={chosenRole?.count ?? 1}
            value={ordinal}
            onChange={e => setOrdinal(Number(e.target.value))}
          />
        </label>{" "}
        <label>
          {tr("domain")} <input value={domain} onChange={e => setDomain(e.target.value)} />
        </label>{" "}
        <button
          type="button"
          disabled={
            !patronId ||
            !chosenRole ||
            !domain.trim() ||
            !Number.isInteger(ordinal) ||
            ordinal < 1 ||
            ordinal > chosenRole.count
          }
          onClick={() =>
            command({ action: "patronage", patronId, supplierId, roleId: representative, ordinal: ordinal - 1, domain })
          }
        >
          {tr("addContract")}
        </button>
        <ul>
          {(roster.patronage ?? [])
            .filter(c => c.endYear === undefined)
            .map(c => (
              <li key={c.id}>
                {organizations.find(o => o.id === c.patronId)?.name} →{" "}
                {organizations.find(o => o.id === c.supplierId)?.name}: {c.domain}{" "}
                <button type="button" onClick={() => command({ action: "endPatronage", contractId: c.id })}>
                  {tr("endContract")}
                </button>
              </li>
            ))}
        </ul>
      </details>
      <details>
        <summary>{tr("classification")}</summary>
        <p>{tr("classificationHelp")}</p>
        <select
          aria-label={tr("role")}
          value={roleId}
          onChange={e => {
            setRoleId(e.target.value);
            const role = roster.roles.find(r => r.id === e.target.value);
            setRoleCount(role?.count ?? 1);
            setOccupation(role?.occupation ?? "");
            setMajorLord(role?.majorLord ?? false);
            setPurposes(roster.roles.find(r => r.id === e.target.value)?.purposes ?? []);
          }}
        >
          <option value="">{tr("choose")}</option>
          {roster.roles.map(r => (
            <option key={r.id} value={r.id}>
              {organizations.find(o => o.id === r.organizationId)?.name} / {r.name}
            </option>
          ))}
        </select>
        <div>
          <label>
            {tr("staffingCount")}{" "}
            <input type="number" min={0} value={roleCount} onChange={e => setRoleCount(Number(e.target.value))} />
          </label>{" "}
          <label>
            {tr("occupation")} <input value={occupation} onChange={e => setOccupation(e.target.value)} />
          </label>{" "}
          <label>
            <input type="checkbox" checked={majorLord} onChange={e => setMajorLord(e.target.checked)} />
            {tr("majorLord")}
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
          {ROLE_PURPOSES.map(p => (
            <label key={p}>
              <input
                type="checkbox"
                checked={purposes.includes(p)}
                onChange={e => setPurposes(e.target.checked ? [...purposes, p] : purposes.filter(v => v !== p))}
              />
              {tr(`purposes.${p}`)}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!roleId || !Number.isInteger(roleCount) || roleCount < 0}
          onClick={() => command({ action: "classifyRole", roleId, purposes, count: roleCount, occupation, majorLord })}
        >
          {tr("applyClassification")}
        </button>
      </details>
      <details>
        <summary>{tr("shareAppointment")}</summary>
        <p>{tr("shareAppointmentHelp")}</p>
        <label>
          {tr("sourceRole")}{" "}
          <select
            value={sourceRole}
            onChange={e => {
              setSourceRole(e.target.value);
              setSourceOrdinal(1);
            }}
          >
            <option value="">{tr("choose")}</option>
            {roster.roles
              .filter(r => r.count > 0)
              .map(r => (
                <option key={r.id} value={r.id}>
                  {organizations.find(o => o.id === r.organizationId)?.name} / {r.name}
                </option>
              ))}
          </select>
        </label>{" "}
        <input
          aria-label={tr("sourceOrdinal")}
          type="number"
          min={1}
          max={roster.roles.find(r => r.id === sourceRole)?.count ?? 1}
          value={sourceOrdinal}
          onChange={e => setSourceOrdinal(Number(e.target.value))}
        />
        <label>
          {tr("targetRole")}{" "}
          <select
            value={targetRole}
            onChange={e => {
              setTargetRole(e.target.value);
              setTargetOrdinal(1);
            }}
          >
            <option value="">{tr("choose")}</option>
            {roster.roles
              .filter(r => r.count > 0)
              .map(r => (
                <option key={r.id} value={r.id}>
                  {organizations.find(o => o.id === r.organizationId)?.name} / {r.name}
                </option>
              ))}
          </select>
        </label>{" "}
        <input
          aria-label={tr("targetOrdinal")}
          type="number"
          min={1}
          max={roster.roles.find(r => r.id === targetRole)?.count ?? 1}
          value={targetOrdinal}
          onChange={e => setTargetOrdinal(Number(e.target.value))}
        />
        <button
          type="button"
          disabled={!sourceRole || !targetRole}
          onClick={() =>
            command({
              action: "shareAppointment",
              sourceRoleId: sourceRole,
              targetRoleId: targetRole,
              sourceOrdinal: sourceOrdinal - 1,
              targetOrdinal: targetOrdinal - 1
            })
          }
        >
          {tr("assignSamePerson")}
        </button>
      </details>
      <details>
        <summary>{tr("orgClassification")}</summary>
        <label>
          {tr("organization")}{" "}
          <select
            value={orgId}
            onChange={e => {
              const o = organizations.find(o => o.id === e.target.value);
              setOrgId(e.target.value);
              setOrgKind(o?.kind ?? "institution");
              setFormation(o?.formation ?? "");
            }}
          >
            <option value="">{tr("choose")}</option>
            {organizations.map(o => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {tr("orgKind")}{" "}
          <select value={orgKind} onChange={e => setOrgKind(e.target.value)}>
            {[
              "government",
              "household",
              "military",
              "religious",
              "company",
              "guild",
              "market",
              "settlement",
              "territory",
              "institution"
            ].map(k => (
              <option key={k} value={k}>
                {tr(`orgKinds.${k}`)}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {tr("military")}{" "}
          <select value={formation} onChange={e => setFormation(e.target.value)}>
            <option value="">{tr("unclassified")}</option>
            {["land", "sea", "corps"].map(k => (
              <option key={k} value={k}>
                {tr(k)}
              </option>
            ))}
          </select>
        </label>{" "}
        <button
          type="button"
          disabled={!orgId}
          onClick={() =>
            command({
              action: "classifyOrganization",
              organizationId: orgId,
              kind: orgKind,
              formation: formation || undefined
            })
          }
        >
          {tr("applyClassification")}
        </button>
      </details>
    </>
  );
}
