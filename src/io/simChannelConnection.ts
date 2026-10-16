/**
 * Following one simulation server channel (docs/plan/simulation-channel-server.md §14): the
 * browser loads the channel's world and reloads it whenever the channel gets a new revision.
 * Changes made in this tab are not sent to the server (§6 sync is not implemented yet).
 */
import { tip } from "../services/tooltipService";
import { uploadMap } from "./load";
import { fetchSimChannelArchive, watchSimChannel } from "./simServer";

let connected: { id: string; stop: () => void } | null = null;
let loading: Promise<void> | null = null;
let pendingReload = false;

export function getConnectedSimChannel(): string | null {
  return connected?.id ?? null;
}

function loadChannel(id: string): Promise<void> {
  if (loading) {
    // A newer revision arrived while loading: fetch once more afterwards, only the latest.
    pendingReload = true;
    return loading;
  }
  loading = fetchSimChannelArchive(id)
    .then(blob => uploadMap(blob))
    .catch((error: Error) => tip(error.message, true, "error", 8000))
    .finally(() => {
      loading = null;
      if (pendingReload && connected?.id === id) {
        pendingReload = false;
        void loadChannel(id);
      }
    });
  return loading;
}

export function connectSimChannel(id: string): Promise<void> {
  disconnectSimChannel();
  const stop = watchSimChannel(id, {
    onRevision: () => {
      if (connected?.id === id) void loadChannel(id);
    },
    onDeleted: () => {
      if (connected?.id !== id) return;
      connected = null;
      tip(`Channel ${id} was deleted on the server. This map is now a local copy.`, true, "warning" as never, 10000);
    }
  });
  connected = { id, stop };
  return loadChannel(id);
}

export function disconnectSimChannel(): void {
  connected?.stop();
  connected = null;
  pendingReload = false;
}
