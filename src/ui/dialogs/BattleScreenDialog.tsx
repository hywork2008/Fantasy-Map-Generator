import { sum } from "d3";
import React, { useState } from "react";
import { worldContext } from "../../context/worldContext";
import {
  battleAction_addRegimentToSide,
  battleAction_addSide,
  battleAction_applyResults,
  battleAction_cancelResults,
  battleAction_changeName,
  battleAction_changePhase,
  battleAction_changePlace,
  battleAction_changeType,
  battleAction_generateName,
  battleAction_hideNameSection,
  battleAction_randomize,
  battleAction_rollDie,
  battleAction_run,
  battleAction_showNameSection,
  battleAction_wiki
} from "../../controllers/battle-screen";
import { tip } from "../../services/tooltipService";
import type { BattleRegimentDisplay, BattleSide } from "../../store/battleScreenState";
import { useBattleScreenState } from "../../store/battleScreenState";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { applySorting } from "../../utils/domUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

// ── Phase data ─────────────────────────────────────────────────────────────

interface PhaseOption {
  phase: string;
  tip: string;
}

type PhaseSides = { attackers: PhaseOption[]; defenders: PhaseOption[] };

const SHARED_FIELD: PhaseOption[] = [
  { phase: "skirmish", tip: "Skirmish phase. Ranged units excel" },
  { phase: "melee", tip: "Melee phase. Melee units excel" },
  { phase: "pursue", tip: "Pursue phase. Mounted units excel" },
  { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
];

const SHARED_NAVAL: PhaseOption[] = [
  { phase: "shelling", tip: "Shelling phase. Naval artillery bombardment of enemy fleet" },
  { phase: "boarding", tip: "Boarding phase. Melee units go aboard" },
  { phase: "chase", tip: "Сhase phase. Naval units pursue and rarely shell enemy fleet" },
  { phase: "withdrawal", tip: "Withdrawal phase. Naval units try to escape enemy fleet" }
];

const SHARED_AIR: PhaseOption[] = [
  { phase: "maneuvering", tip: "Maneuvering phase. Units strength reduced" },
  { phase: "dogfight", tip: "Dogfight phase. Units strength increased" },
  { phase: "pursue", tip: "Pursue phase. Units strength increased" },
  { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
];

const PHASE_DATA: Record<string, PhaseSides> = {
  field: { attackers: SHARED_FIELD, defenders: SHARED_FIELD },
  naval: { attackers: SHARED_NAVAL, defenders: SHARED_NAVAL },
  siege: {
    attackers: [
      { phase: "blockade", tip: "Blockade phase. Prepare or hold the blockade" },
      { phase: "bombardment", tip: "Bombardment phase. Attack enemy with machinery units" },
      { phase: "storming", tip: "Storming phase. Storm enemy town. Melee units excel" },
      { phase: "looting", tip: "Looting phase. Plunder the town. Units strength increased" },
      { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
    ],
    defenders: [
      { phase: "sheltering", tip: "Sheltering phase. Hide behind the walls and wait" },
      { phase: "sortie", tip: "Sortie phase. Make a sortie from besieged town. Melee units excel" },
      { phase: "bombardment", tip: "Bombardment phase. Attack enemy with machinery units" },
      { phase: "defense", tip: "Defense phase. Ranged and melee units excel" },
      { phase: "surrendering", tip: "Surrendering phase. Give up the defense. Units strength reduced" },
      { phase: "pursue", tip: "Pursue phase. Mounted units excel" }
    ]
  },
  ambush: {
    attackers: [
      { phase: "shock", tip: "Shock phase. Units strength reduced" },
      { phase: "melee", tip: "Melee phase. Melee units excel" },
      { phase: "pursue", tip: "Pursue phase. Mounted units excel" },
      { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
    ],
    defenders: [
      { phase: "surprise", tip: "Surprise attack phase. Units strength increased, ranged units excel" },
      { phase: "melee", tip: "Melee phase. Melee units excel" },
      { phase: "pursue", tip: "Pursue phase. Mounted units excel" },
      { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
    ]
  },
  landing: {
    attackers: [
      { phase: "landing", tip: "Landing phase. Amphibious attack. Units are vulnerable against prepared defense" },
      { phase: "melee", tip: "Melee phase. Melee units excel" },
      { phase: "pursue", tip: "Pursue phase. Mounted units excel" },
      { phase: "flee", tip: "Flee phase. Units strength reduced" }
    ],
    defenders: [
      { phase: "shock", tip: "Shock phase. Units are not prepared for a defense" },
      { phase: "defense", tip: "Defense phase. Prepared defense. Units strength increased" },
      { phase: "melee", tip: "Melee phase. Melee units excel" },
      { phase: "waiting", tip: "Waiting phase. Cannot pursue fleeing naval" },
      { phase: "pursue", tip: "Pursue phase. Try to intercept fleeing attackers. Mounted units excel" },
      { phase: "retreat", tip: "Retreat phase. Units strength reduced" }
    ]
  },
  air: { attackers: SHARED_AIR, defenders: SHARED_AIR }
};

// ── Sub-components ──────────────────────────────────────────────────────────

interface PhasePickerProps {
  side: BattleSide;
  battleType: string;
  currentPhase: string;
}

const PhasePicker: React.FC<PhasePickerProps> = ({ side, battleType, currentPhase }) => {
  const [open, setOpen] = useState(false);
  const options = PHASE_DATA[battleType]?.[side] ?? SHARED_FIELD;

  const handleToggle = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    setOpen(prev => !prev);
  };

  const handleSelect = (phase: string) => {
    battleAction_changePhase(side, phase);
    setOpen(false);
  };

  return (
    <div className="d-inline-block">
      <button
        type="button"
        className={`icon-button-${currentPhase || "skirmish"}`}
        data-tip={options.find(o => o.phase === currentPhase)?.tip ?? ""}
        onClick={handleToggle}
      />
      {open && (
        <div className="battlePhases d-block">
          {options.map(opt => (
            <button
              key={opt.phase}
              type="button"
              className={`icon-button-${opt.phase}`}
              data-phase={opt.phase}
              data-tip={opt.tip}
              onClick={() => handleSelect(opt.phase)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SideHeaderProps {
  label: string;
  side: BattleSide;
  morale: number;
  power: number;
  phase: string;
  die: number;
  battleType: string;
}

const SideHeader: React.FC<SideHeaderProps> = ({ label, side, morale, power, phase, die, battleType }) => (
  <div>
    <span>{label}</span>
    <div>
      <meter data-tip={`${label} morale: ${morale}`} min={0} max={100} low={33} high={66} optimum={80} value={morale} />
      <div
        data-tip={`${label} strength during this phase. Strength defines dealt damage`}
        className="d-inline-block icon-button-power"
      >
        {power}
      </div>
      <PhasePicker side={side} battleType={battleType} currentPhase={phase} />
      <button
        type="button"
        data-tip={`Random factor for ${label.toLowerCase()}. Click to re-roll`}
        className="icon-button-die"
        onClick={() => battleAction_rollDie(side)}
      >
        {die}
      </button>
    </div>
  </div>
);

interface RegimentTableProps {
  regiments: BattleRegimentDisplay[];
  militaryUnitNames: Array<{ name: string; icon: string }>;
}

const RegimentTable: React.FC<RegimentTableProps> = ({ regiments, militaryUnitNames }) => (
  <table>
    <thead>
      <tr>
        <th />
        <th />
        {militaryUnitNames.map(u => {
          const isExternal = u.icon.startsWith("http") || u.icon.startsWith("data:image");
          return (
            <th key={u.name} data-tip={u.name}>
              {isExternal ? <img src={u.icon} width="15" height="15" alt={u.name} /> : u.icon}
            </th>
          );
        })}
        <th data-tip="Total military">Total</th>
      </tr>
    </thead>
    <tbody>
      {regiments.map(r => {
        const isExternal = r.icon.startsWith("http") || r.icon.startsWith("data:image");
        const iconHtml = isExternal
          ? `<image href="${r.icon}" x="0.1em" y="0.1em" width="1.2em" height="1.2em"></image>`
          : `<text x="50%" y="1em" style="text-anchor: middle">${r.icon}</text>`;
        const svgIcon = `<svg width="1.4em" height="1.4em" style="stroke: #333">
          <rect x="0" y="0" width="100%" height="100%" fill="${r.stateColor}"></rect>${iconHtml}</svg>`;

        const totalCasualties = sum(Object.values(r.casualties));
        const totalSurvivors = sum(Object.values(r.survivors));

        return (
          <React.Fragment key={r.key}>
            <tr className="battleInitial">
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG icon requires raw HTML */}
              <td dangerouslySetInnerHTML={{ __html: svgIcon }} />
              <td className="regiment" data-tip={r.regimentName}>
                {r.regimentName.slice(0, 24)}
              </td>
              {militaryUnitNames.map(u => (
                <td key={u.name} data-tip="Initial forces">
                  {r.initialUnits[u.name] || 0}
                </td>
              ))}
              <td data-tip="Initial forces">{r.initialTotal}</td>
            </tr>
            <tr className="battleCasualties">
              <td />
              <td data-tip={r.stateFullName}>{r.stateFullName.slice(0, 26)}</td>
              {militaryUnitNames.map(u => (
                <td key={u.name} data-tip="Casualties">
                  {r.casualties[u.name] || 0}
                </td>
              ))}
              <td data-tip="Casualties">{totalCasualties}</td>
            </tr>
            <tr className="battleSurvivors">
              <td />
              <td data-tip="Supply line length, affects morale">Distance to base: {r.distanceLabel}</td>
              {militaryUnitNames.map(u => (
                <td key={u.name} data-tip="Survivors">
                  {r.survivors[u.name] || 0}
                </td>
              ))}
              <td data-tip="Survivors">{totalSurvivors}</td>
            </tr>
          </React.Fragment>
        );
      })}
    </tbody>
  </table>
);

// ── Regiment selector dialog ────────────────────────────────────────────────

export const RegimentSelectorScreenDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("regimentSelectorScreen"));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const regiments = isOpen
    ? (worldContext.pack.states ?? [])
        .filter(s => s.military && !s.removed)
        .flatMap(s => (s.military ?? []).map(r => ({ state: s, regiment: r })))
    : [];

  const attackers = useBattleScreenState(s => s.attackers.regiments);
  const defenders = useBattleScreenState(s => s.defenders.regiments);
  const addedKeys = new Set([...attackers, ...defenders].map(r => r.key));

  const distanceUnit = useOptionsState(s => s.distanceUnit);

  const toggleSelect = (key: string, isAdded: boolean) => {
    if (isAdded) {
      tip("Regiment is already in the battle", false, "error");
      return;
    }
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addClicked = (side: BattleSide) => {
    if (!selected.size) {
      tip("Please select a regiment first", false, "error");
      return;
    }
    for (const key of selected) {
      const [sI, rI] = key.split("-").map(Number);
      battleAction_addRegimentToSide(side, sI, rI);
    }
    setSelected(new Set());
    closeDialog("regimentSelectorScreen");
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Add regiment to the battle"
      onClose={() => {
        setSelected(new Set());
        closeDialog("regimentSelectorScreen");
      }}
      buttons={[
        { label: "Add to attackers", onClick: () => addClicked("attackers") },
        { label: "Add to defenders", onClick: () => addClicked("defenders") },
        {
          label: "Cancel",
          onClick: () => {
            setSelected(new Set());
            closeDialog("regimentSelectorScreen");
          }
        }
      ]}
    >
      <div id="regimentSelectorBody" className="table">
        <table className="states-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead
            id="regimentSelectorHeader"
            ref={el => {
              if (el) applySorting(el);
            }}
          >
            <tr className="header">
              <th data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="state">
                State&nbsp;
              </th>
              <th data-tip="Click to sort by regiment name" className="sortable alphabetically" data-sortby="regiment">
                Regiment&nbsp;
              </th>
              <th data-tip="Click to sort by total military forces" className="sortable" data-sortby="total">
                Total&nbsp;
              </th>
              <th
                data-tip="Click to sort by distance to the battlefield"
                className="sortable icon-sort-number-up"
                data-sortby="distance"
              >
                Distance&nbsp;
              </th>
            </tr>
          </thead>
          <tbody>
            {regiments.map(({ state: s, regiment: r }) => {
              const key = `${s.i}-${r.i}`;
              const isAdded = addedKeys.has(key);
              const isSelected = selected.has(key);
              return (
                <tr
                  key={key}
                  className={isAdded ? "inactive" : isSelected ? "selected" : ""}
                  data-s={s.i}
                  data-i={r.i}
                  data-state={s.name}
                  data-regiment={r.name}
                  data-total={r.a}
                  data-tip="Click to select regiment"
                  onClick={() => toggleSelect(key, isAdded)}
                  style={{ cursor: isAdded ? "default" : "pointer" }}
                >
                  <td>
                    <svg width=".9em" height=".9em" aria-label={s.name ?? ""}>
                      <rect x="0" y="0" width="100%" height="100%" fill={s.color ?? "#999"} />
                    </svg>
                    {(s.name ?? "").slice(0, 11)}
                  </td>
                  <td>
                    {r.icon} {r.name.slice(0, 24)}
                  </td>
                  <td>{r.a}</td>
                  <td>{isAdded ? `0 ${distanceUnit}` : `? ${distanceUnit}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};

// ── Main battle screen dialog ───────────────────────────────────────────────

export const BattleScreenDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("battleScreen"));
  const { name, type, place, attackers, defenders, nameSectionVisible, militaryUnits } = useBattleScreenState();

  const unitNames = militaryUnits.map(u => ({ name: u.name, icon: u.icon }));

  return (
    <Dialog isOpen={isOpen} title={name} onClose={() => battleAction_cancelResults()}>
      <div id="battleScreenContainer">
        <div>
          <div id="battleBody">
            <SideHeader
              label="Attackers"
              side="attackers"
              morale={attackers.morale}
              power={attackers.power}
              phase={attackers.phase}
              die={attackers.die}
              battleType={type}
            />
            <RegimentTable regiments={attackers.regiments} militaryUnitNames={unitNames} />

            <SideHeader
              label="Defenders"
              side="defenders"
              morale={defenders.morale}
              power={defenders.power}
              phase={defenders.phase}
              die={defenders.die}
              battleType={type}
            />
            <RegimentTable regiments={defenders.regiments} militaryUnitNames={unitNames} />
          </div>

          <div id="battleFooter">
            {/* Battle type selector */}
            <BattleTypePicker currentType={type} />

            {/* Name controls */}
            {!nameSectionVisible && (
              <button
                type="button"
                data-tip="Set battle name"
                className="icon-font"
                onClick={battleAction_showNameSection}
              />
            )}
            {nameSectionVisible && (
              <div id="battleNameSection">
                <button
                  type="button"
                  data-tip="Hide the battle name section"
                  className="icon-font"
                  onClick={battleAction_hideNameSection}
                />
                <input
                  data-tip="Type place name"
                  value={place}
                  onChange={e => battleAction_changePlace(e.target.value)}
                />
                <input
                  data-tip="Type full battle name"
                  value={name}
                  onChange={e => battleAction_changeName(e.target.value)}
                />
                <button
                  type="button"
                  data-tip="Generate culture-specific name for place and battle"
                  className="icon-book"
                  onClick={() => battleAction_generateName("culture")}
                />
                <button
                  type="button"
                  data-tip="Generate random name for place and battle"
                  className="icon-globe"
                  onClick={() => battleAction_generateName("random")}
                />
              </div>
            )}

            <button
              type="button"
              data-tip="Add regiment to the battle"
              className="icon-user-plus"
              onClick={battleAction_addSide}
            />
            <button
              type="button"
              data-tip="Roll dice to update random factor"
              className="icon-die"
              onClick={battleAction_randomize}
            />
            <button type="button" data-tip="Iterate battle" className="icon-play" onClick={battleAction_run} />
            <button
              type="button"
              data-tip="End battle: apply current results and close the screen"
              className="icon-check"
              onClick={battleAction_applyResults}
            />
            <button
              type="button"
              data-tip="Cancel battle: roll back results and close the screen"
              className="icon-cancel"
              onClick={battleAction_cancelResults}
            />
            <button
              type="button"
              data-tip="Open Battle Simulation Tutorial"
              className="icon-info"
              onClick={battleAction_wiki}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};

// ── Battle type picker ──────────────────────────────────────────────────────

const BATTLE_TYPES = [
  { type: "field", tip: "Field Battle: a standard type of combat" },
  { type: "naval", tip: "Naval Battle: naval units combat" },
  { type: "siege", tip: "Siege: burg blockade and storming" },
  { type: "ambush", tip: "Ambush: surprise attack" },
  { type: "landing", tip: "Landing: amphibious attack" },
  { type: "air", tip: "Air Battle: maneuring fight of avia units" }
];

const BattleTypePicker: React.FC<{ currentType: string }> = ({ currentType }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-tip="Battle type. Click to change"
        className={`icon-button-${currentType}`}
        onClick={ev => {
          ev.stopPropagation();
          setOpen(prev => !prev);
        }}
      />
      {open && (
        <div className="battleTypes">
          {BATTLE_TYPES.map(bt => (
            <button
              key={bt.type}
              type="button"
              data-tip={bt.tip}
              className={`icon-button-${bt.type}`}
              onClick={() => {
                battleAction_changeType(bt.type);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};
