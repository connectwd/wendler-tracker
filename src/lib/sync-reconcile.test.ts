import { describe, it, expect } from 'vitest';
import { decideSyncAction } from './sync-reconcile';
import type { SyncState } from '../types';

const base: SyncState = { lastKnownSha: null, lastSyncedAt: null, localDirty: false, lastError: null };

describe('decideSyncAction', () => {
  it('nothing on remote yet -> push-initial', () => {
    expect(decideSyncAction(null, base).action).toBe('push-initial');
  });

  it('remote file gone even if this device thought it had synced before -> push-initial', () => {
    expect(decideSyncAction(null, { ...base, lastKnownSha: 'abc' }).action).toBe('push-initial');
  });

  it('remote exists, first time this device has seen it, nothing local to lose -> adopt-remote', () => {
    expect(decideSyncAction('sha1', base).action).toBe('adopt-remote');
  });

  it('remote exists, first time seeing it, but local has unsynced changes -> conflict', () => {
    expect(decideSyncAction('sha1', { ...base, localDirty: true }).action).toBe('conflict');
  });

  it('remote unchanged since last sync, local clean -> noop', () => {
    const synced: SyncState = { ...base, lastKnownSha: 'sha1', lastSyncedAt: '2026-01-01' };
    expect(decideSyncAction('sha1', synced).action).toBe('noop');
  });

  it('remote unchanged since last sync, local dirty (the normal "just logged a workout" case) -> push-local', () => {
    const synced: SyncState = { ...base, lastKnownSha: 'sha1', lastSyncedAt: '2026-01-01', localDirty: true };
    expect(decideSyncAction('sha1', synced).action).toBe('push-local');
  });

  it('remote moved (another device pushed), local clean -> adopt-remote silently', () => {
    const synced: SyncState = { ...base, lastKnownSha: 'sha1', lastSyncedAt: '2026-01-01' };
    expect(decideSyncAction('sha2', synced).action).toBe('adopt-remote');
  });

  it('remote moved AND local is dirty - genuine two-sided conflict -> conflict', () => {
    const synced: SyncState = { ...base, lastKnownSha: 'sha1', lastSyncedAt: '2026-01-01', localDirty: true };
    expect(decideSyncAction('sha2', synced).action).toBe('conflict');
  });
});
