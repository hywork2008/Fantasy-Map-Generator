import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CultureRomanceNorms } from "../../../../types/models";
import type { Character } from "../../characterTypes";
import { getPersonalityDescriptionKeys } from "../../personalityDescription";
import { getRomanceDescriptionKeys } from "../../romanceDescription";

const tabs = ["general", "romance"] as const;

export function PersonalityFlavorTabs({
  character,
  norms
}: {
  character: Pick<Character, "personality" | "appearance">;
  norms?: CultureRomanceNorms;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [active, setActive] = useState<(typeof tabs)[number]>("general");
  const keys =
    active === "general"
      ? getPersonalityDescriptionKeys(character.personality)
      : getRomanceDescriptionKeys(character.personality, { appearance: character.appearance, norms });

  return (
    <div style={{ marginTop: 12, lineHeight: 1.7 }}>
      <div role="tablist" aria-label={t("characters.personalityFlavorTabs.label")} style={{ display: "flex", gap: 4 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            id={`${id}-${tab}`}
            type="button"
            role="tab"
            className={`options ${active === tab ? "active" : ""}`}
            aria-selected={active === tab}
            aria-controls={`${id}-panel`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "general"
                  : event.key === "End"
                    ? "romance"
                    : tab === "general"
                      ? "romance"
                      : "general";
              setActive(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {t(`characters.personalityFlavorTabs.${tab}`)}
          </button>
        ))}
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The text-only tab panel is a keyboard navigation destination. */}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${active}`} tabIndex={0}>
        {keys.map(key => (
          <p key={key} style={{ margin: "4px 0" }}>
            {t(key)}
          </p>
        ))}
      </div>
    </div>
  );
}
