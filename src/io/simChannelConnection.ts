/**
 * Following one simulation server channel (docs/plan/simulation-channel-server.md §14): the
 * browser loads the channel's world and reloads it whenever the channel gets a new revision.
 * Changes made in this tab are not sent to the server (§6 sync is not implemented yet).
 *
 * The connection ends on `disconnectSimChannel()`, and by itself when this tab loads another map
 * or starts generating one (§15) — otherwise the next revision would overwrite that map.
 */
import { tip } from "../services/tooltipService";
import { generationProgressStore } from "../store/generationProgressState";
import { onMapUpload, uploadMap } from "./load";
import { fetchSimChannelArchive, watchSimChannel } from "./simServer";

let connected: { id: string; stop: () => void } | null = null;
let loading: Promise<void> | null = null;
let pendingReload = false;
/** The archive this module is loading; any other upload is the user's own map. */
let channelBlob: Blob | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

/** For useSyncExternalStore: called whenever the connected channel changes. */
export function subscribeSimChannelConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
    .then(blob => {
      if (connected?.id !== id) return;
      channelBlob = blob;
      uploadMap(blob);
    })
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

function endConnection(reason?: string): void {
  if (!connected) return;
  const { id, stop } = connected;
  stop();
  connected = null;
  pendingReload = false;
  channelBlob = null;
  notify();
  if (reason) tip(reason.replace("{id}", id), true, "warning" as never, 8000);
}

export function connectSimChannel(id: string): Promise<void> {
  endConnection();
  const unwatch = watchSimChannel(id, {
    onRevision: () => {
      if (connected?.id === id) void loadChannel(id);
    },
    onDeleted: () => endConnection("Channel {id} was deleted on the server. This map is now a local copy.")
  });
  const unUpload = onMapUpload(file => {
    if (file !== channelBlob) endConnection("Disconnected from channel {id}: another map was loaded.");
  });
  const unGeneration = generationProgressStore.subscribe((state, previous) => {
    if (state.isOpen && !previous.isOpen)
      endConnection("Disconnected from channel {id}: a new map is being generated.");
  });
  connected = {
    id,
    stop: () => {
      unwatch();
      unUpload();
      unGeneration();
    }
  };
  notify();
  return loadChannel(id);
}

/** Stops following the channel; the loaded map stays as a local copy. */
export function disconnectSimChannel(): void {
  endConnection();
}
