import type { SyncState } from '../types';

export type SyncDecision =
  | { action: 'push-initial' } // nothing on remote yet - this device's data becomes the first version
  | { action: 'noop' } // remote unchanged since we last saw it, nothing local to push
  | { action: 'push-local' } // remote unchanged since we last saw it, local has new changes to push
  | { action: 'adopt-remote' } // remote moved (another device pushed) and local has no unsynced changes - safe to just pull it in
  | { action: 'conflict' }; // remote moved AND local has unsynced changes - both sides changed, ask the user

/**
 * `remoteSha` is null when the file doesn't exist on GitHub yet.
 * Pure function, no IO - see verify tests for every branch.
 */
export function decideSyncAction(remoteSha: string | null, syncState: SyncState): SyncDecision {
  if (remoteSha === null) return { action: 'push-initial' };

  if (syncState.lastKnownSha === null) {
    // First time this device has looked at an existing remote file.
    return syncState.localDirty ? { action: 'conflict' } : { action: 'adopt-remote' };
  }

  if (remoteSha === syncState.lastKnownSha) {
    return syncState.localDirty ? { action: 'push-local' } : { action: 'noop' };
  }

  // Remote sha differs from what we last saw - another device pushed since.
  return syncState.localDirty ? { action: 'conflict' } : { action: 'adopt-remote' };
}
