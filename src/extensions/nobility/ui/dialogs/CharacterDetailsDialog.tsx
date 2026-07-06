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

  const downloadCSV = () => {
    if (!character) return;

    const rows: string[] = [];

    // Basic Info
    rows.push("Personal Information");
    rows.push(`Name, ${character.name}`);
    rows.push(`Age, ${character.age}`);
    rows.push(`Gender, ${character.gender}`);
    rows.push(`Culture, ${cultureName}`);
    rows.push(`Appearance, ${character.appearance ?? "N/A"}`);
    rows.push(`Prestige, ${character.prestige ?? "N/A"}`);

    // Family
    if (character.family) {
      rows.push("Family");
      rows.push(`Spouses, ${character.family.spouses}`);
      rows.push(`Children, ${character.family.children}`);
      rows.push(`Grandchildren, ${character.family.grandchildren}`);
      if (character.family.greatGrandchildren > 0) {
        rows.push(`Great-grandchildren, ${character.family.greatGrandchildren}`);
      }
    }

    // Skills
    if (character.skills) {
      rows.push("Skills");
      rows.push(`Artistry, ${character.skills.artistry}`);
      rows.push(`Diplomacy, ${character.skills.diplomacy}`);
      rows.push(`Engineering, ${character.skills.engineering}`);
      rows.push(`Geography, ${character.skills.geography}`);
      rows.push(`Intrigue, ${character.skills.intrigue}`);
      rows.push(`Learning, ${character.skills.learning}`);
      rows.push(`Martial, ${character.skills.martial}`);
      rows.push(`Prowess, ${character.skills.prowess}`);
      rows.push(`Stewardship, ${character.skills.stewardship}`);
    }

    // Personality
    if (character.personality) {
      rows.push("Personality");
      rows.push(`Boldness, ${character.personality.boldness}`);
      rows.push(`Compassion, ${character.personality.compassion}`);
      rows.push(`Confidence, ${character.personality.confidence ?? "N/A"}`);
      rows.push(`Energy, ${character.personality.energy}`);
      rows.push(`Greed, ${character.personality.greed}`);
      rows.push(`Guile, ${character.personality.guile}`);
      rows.push(`Honor, ${character.personality.honor}`);
      rows.push(`Piety, ${character.personality.piety}`);
      rows.push(`Rationality, ${character.personality.rationality}`);
      rows.push(`Sociability, ${character.personality.sociability}`);
      rows.push(`Vengefulness, ${character.personality.vengefulness}`);
      rows.push(`Zeal, ${character.personality.zeal}`);
    }

    // Titles
    if (character.titles && character.titles.length > 0) {
      rows.push("Titles");
      character.titles.forEach(t => {
        const stateName = states[t.entityId]?.name ?? "Unknown";
        rows.push(`${t.title} of ${stateName}, ${t.landed ? "(Landed)" : ""}`);
      });
    }

    // Dynastic Ties
    if (character.marriages && character.marriages.length > 0) {
      rows.push("Dynastic Ties (Marriages)");
      character.marriages.forEach(stateId => {
        const stateName = states[stateId]?.name ?? "Unknown";
        rows.push(`Married into ${stateName}`);
      });
    }

    // Affinities
    if (character.affinities && Object.keys(character.affinities).length > 0) {
      rows.push("State Affinities");
      Object.entries(character.affinities).forEach(([stateIdStr, score]) => {
        const stateId = Number(stateIdStr);
        const state = states[stateId];
        if (state && !state.removed) {
          const text = getAffinityText(score);
          rows.push(`${state.name}, ${score} (${text})`);
        }
      });
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name.replace(/\s+/g, "_")}_details.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={`Character Details: ${character.name}`}
      onClose={() => closeDialog("characterDetails")}
      buttons={[{ label: "Download CSV", onClick: downloadCSV }]}
    >
      <div id="characterDetailsContainer" style={{ padding: "10px" }}>
        <h3>Personal Information</h3>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", marginBottom: "10px" }}>
          <tbody>
            <tr>
              <th style={{ width: "120px", padding: "4px 0" }}>Name</th>
              <td>{character.name}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>Age</th>
              <td>{character.age}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>Gender</th>
              <td>{character.gender}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>Culture</th>
              <td>{cultureName}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>Appearance</th>
              <td>{character.appearance ?? "N/A"}</td>
            </tr>
            <tr>
              <th style={{ padding: "4px 0" }}>Prestige</th>
              <td>{character.prestige ?? "N/A"}</td>
            </tr>
            {character.family && (
              <tr>
                <th style={{ padding: "4px 0" }}>Family</th>
                <td>
                  {character.family.spouses} Spouses, {character.family.children} Children,{" "}
                  {character.family.grandchildren} Grandchildren
                  {character.family.greatGrandchildren > 0 &&
                    `, ${character.family.greatGrandchildren} Great-grandchildren`}
                </td>
              </tr>
            )}
            {character.titles && character.titles.length > 0 && (
              <tr>
                <th style={{ padding: "4px 0", verticalAlign: "top" }}>Titles</th>
                <td>
                  <ul style={{ margin: 0, listStyleType: "none", padding: 0 }}>
                    {character.titles.map(t => (
                      <li key={`${t.entityType}-${t.entityId}-${t.title}`}>
                        {t.title} of {states[t.entityId]?.name ?? "Unknown"} {t.landed ? "(Landed)" : ""}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
          </tbody>
        </table>

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
                  { axis: "Confidence", value: character.personality.confidence ?? 0 },
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
