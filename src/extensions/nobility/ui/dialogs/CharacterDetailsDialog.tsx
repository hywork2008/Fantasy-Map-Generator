import type React from "react";
import { useState } from "react";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { getWorldContext } from "../../nobilityContext";
import { RadarChart } from "../components/charts/RadarChart";
import { useNobilityUiState } from "../nobilityUiState";

export const CharacterDetailsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("characterDetails"));
  const selectedCharacterId = useNobilityUiState(state => state.selectedCharacterId);
  const [activeTab, setActiveTab] = useState<"skills" | "personality">("skills");

  const worldContext = getWorldContext();
  const characters = worldContext.pack.characters ?? [];
  const states = worldContext.pack.states;
  const cultures = worldContext.pack.cultures;

  const character = characters.find(c => c.i === selectedCharacterId);

  if (!isOpen || !character) {
    return null;
  }

  const cultureName = cultures[character.culture]?.name ?? "Unknown";

  const getAffinityText = (score: number) => {
    if (score >= 50) return "Friendly";
    if (score >= 20) return "Positive";
    if (score <= -50) return "Hostile";
    if (score <= -20) return "Negative";
    return "Neutral";
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={`Character Details: ${character.name}`}
      onClose={() => closeDialog("characterDetails")}
    >
      <div id="characterDetailsContainer" style={{ padding: "10px", lineHeight: "1.5" }}>
        <h3>Personal Information</h3>
        <p>
          <strong>Name:</strong> {character.name}
        </p>
        <p>
          <strong>Age:</strong> {character.age}
        </p>
        <p>
          <strong>Gender:</strong> {character.gender}
        </p>
        <p>
          <strong>Culture:</strong> {cultureName}
        </p>
        <p>
          <strong>Appearance:</strong> {character.appearance ?? "N/A"}
        </p>
        <p>
          <strong>Prestige:</strong> {character.prestige ?? "N/A"}
        </p>
        {character.family && (
          <p>
            <strong>Family:</strong> {character.family.spouses} Spouses, {character.family.children} Children,{" "}
            {character.family.grandchildren} Grandchildren
            {character.family.greatGrandchildren > 0 && `, ${character.family.greatGrandchildren} Great-grandchildren`}
          </p>
        )}
        <h3>Titles</h3>
        <ul>
          {character.titles.map(t => (
            <li key={`${t.entityType}-${t.entityId}-${t.title}`}>
              {t.title} of {states[t.entityId]?.name ?? "Unknown"} {t.landed ? "(Landed)" : ""}
            </li>
          ))}
        </ul>

        <div className="tab" style={{ display: "flex", flexShrink: 0, marginTop: "10px" }}>
          <button
            type="button"
            className={`options ${activeTab === "skills" ? "active" : ""}`}
            onClick={() => setActiveTab("skills")}
          >
            Skills
          </button>
          <button
            type="button"
            className={`options ${activeTab === "personality" ? "active" : ""}`}
            onClick={() => setActiveTab("personality")}
          >
            Personality
          </button>
        </div>

        {activeTab === "skills" && (
          <div>
            {character.skills ? (
              <RadarChart
                data={[
                  { axis: "Artistry", value: character.skills.artistry },
                  { axis: "Diplomacy", value: character.skills.diplomacy },
                  { axis: "Engineering", value: character.skills.engineering },
                  { axis: "Geography", value: character.skills.geography },
                  { axis: "Intrigue", value: character.skills.intrigue },
                  { axis: "Learning", value: character.skills.learning },
                  { axis: "Martial", value: character.skills.martial },
                  { axis: "Prowess", value: character.skills.prowess },
                  { axis: "Stewardship", value: character.skills.stewardship }
                ]}
              />
            ) : (
              <p>No skills data.</p>
            )}
          </div>
        )}

        {activeTab === "personality" && (
          <div>
            {character.personality ? (
              <RadarChart
                data={[
                  { axis: "Boldness", value: character.personality.boldness },
                  { axis: "Compassion", value: character.personality.compassion },
                  { axis: "Energy", value: character.personality.energy },
                  { axis: "Greed", value: character.personality.greed },
                  { axis: "Guile", value: character.personality.guile },
                  { axis: "Honor", value: character.personality.honor },
                  { axis: "Piety", value: character.personality.piety },
                  { axis: "Rationality", value: character.personality.rationality },
                  { axis: "Sociability", value: character.personality.sociability },
                  { axis: "Vengefulness", value: character.personality.vengefulness },
                  { axis: "Zeal", value: character.personality.zeal }
                ]}
              />
            ) : (
              <p>No personality data.</p>
            )}
          </div>
        )}

        {character.marriages && character.marriages.length > 0 && (
          <>
            <h3>Dynastic Ties (Marriages)</h3>
            <ul>
              {character.marriages.map(stateId => (
                <li key={`m-${stateId}`}>Married into {states[stateId]?.name ?? "Unknown"}</li>
              ))}
            </ul>
          </>
        )}

        <h3>State Affinities</h3>
        {character.affinities && Object.keys(character.affinities).length > 0 ? (
          <ul>
            {Object.entries(character.affinities).map(([stateIdStr, score]) => {
              const stateId = Number(stateIdStr);
              const state = states[stateId];
              if (!state || state.removed) return null;

              const text = getAffinityText(score);
              return (
                <li key={`aff-${stateId}`}>
                  <strong>{state.name}:</strong> {score} ({text})
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No affinities calculated.</p>
        )}
      </div>
    </Dialog>
  );
};
