import type React from "react";
import { useState } from "react";
import { routeJoinDialogStore, useRouteJoinDialogState } from "../../store/routeJoinDialogState";
import { Dialog } from "./Dialog";

export const RouteJoinDialog: React.FC = () => {
  const isOpen = useRouteJoinDialogState(s => s.isOpen);
  const options = useRouteJoinDialogState(s => s.options);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const close = () => routeJoinDialogStore.getState().close();

  const join = () => {
    const id = selectedId ?? options[0]?.id;
    if (id == null) return;
    routeJoinDialogStore.getState().onJoin(id);
    close();
  };

  const currentId = selectedId ?? options[0]?.id ?? null;

  return (
    <Dialog
      isOpen={isOpen}
      title="Join routes"
      onClose={close}
      buttons={[
        { label: "Cancel", onClick: close },
        { label: "Join", onClick: join }
      ]}
    >
      <div>
        Route to join with:
        <select value={currentId ?? ""} onChange={e => setSelectedId(Number(e.target.value))}>
          {options.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.name} ({opt.length})
            </option>
          ))}
        </select>
      </div>
    </Dialog>
  );
};
