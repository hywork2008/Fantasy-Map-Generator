import type React from "react";
import { useHoverNotesState } from "../../store/hoverNotesState";

export const NotesBox: React.FC = () => {
  const { isVisible, name, legend } = useHoverNotesState();

  if (!isVisible) return null;

  return (
    <div id="notes" className="-notes-box__display-block">
      <div id="notesHeader">{name}</div>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: legacy editor content requires rendering HTML */}
      <div id="notesBody" dangerouslySetInnerHTML={{ __html: legend }} />
    </div>
  );
};
