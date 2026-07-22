import { useState } from 'react';
import type { SyncConfig, SyncState, SyncStatus } from '../types';
import { testConnection } from '../lib/github-sync';

interface GitHubSyncSettingsProps {
  syncConfig: SyncConfig;
  syncStatus: SyncStatus;
  syncState: SyncState;
  onUpdateConfig: (config: SyncConfig) => Promise<void>;
  onSyncNow: () => Promise<void>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function GitHubSyncSettings({
  syncConfig,
  syncStatus,
  syncState,
  onUpdateConfig,
  onSyncNow,
}: GitHubSyncSettingsProps) {
  const [owner, setOwner] = useState(syncConfig.owner);
  const [repo, setRepo] = useState(syncConfig.repo);
  const [path, setPath] = useState(syncConfig.path);
  const [token, setToken] = useState(syncConfig.token);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const configured = syncConfig.enabled;

  async function handleConnect() {
    setTesting(true);
    setTestResult(null);
    const config: SyncConfig = {
      enabled: true,
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim(),
      token: token.trim(),
    };
    const result = await testConnection(config);
    setTesting(false);
    if (!result.ok) {
      setTestResult({ ok: false, message: result.message });
      return;
    }
    setTestResult({ ok: true, message: result.fileExists ? 'Connected - existing data found, pulling it in.' : 'Connected - this will be the first sync.' });
    await onUpdateConfig(config);
  }

  async function handleDisable() {
    // A full disconnect, not just flipping enabled off - the token has no
    // reason to sit in storage once you're done with it, and re-connecting
    // later is just re-entering these four fields.
    const cleared: SyncConfig = { enabled: false, owner: '', repo: '', path: 'wendler-data.json', token: '' };
    await onUpdateConfig(cleared);
    setOwner('');
    setRepo('');
    setPath('wendler-data.json');
    setToken('');
    setTestResult(null);
  }

  const statusLabel: Record<SyncStatus, string> = {
    disabled: 'Off',
    syncing: 'Syncing…',
    idle: `Synced ${timeAgo(syncState.lastSyncedAt)}`,
    error: `Error: ${syncState.lastError ?? 'unknown'}`,
    conflict: 'Conflict — resolve below',
  };

  return (
    <div className="card">
      <h3>Multi-device sync</h3>
      {!configured ? (
        <>
          <p>
            Syncs your data to a JSON file in a <strong>private</strong> GitHub repo, automatically after every
            workout you save. Use a fine-grained token scoped to just that one repo with Contents read/write only —
            create one at github.com/settings/tokens?type=beta.
          </p>
          <div className="field">
            <label htmlFor="sync-owner">Repo owner (your GitHub username)</label>
            <input id="sync-owner" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="yourname" data-testid="sync-owner-input" />
          </div>
          <div className="field">
            <label htmlFor="sync-repo">Repo name (private)</label>
            <input id="sync-repo" type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="wendler-data" data-testid="sync-repo-input" />
          </div>
          <div className="field">
            <label htmlFor="sync-path">File path</label>
            <input id="sync-path" type="text" value={path} onChange={(e) => setPath(e.target.value)} data-testid="sync-path-input" />
          </div>
          <div className="field">
            <label htmlFor="sync-token">Fine-grained personal access token</label>
            <input id="sync-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" data-testid="sync-token-input" />
          </div>
          {testResult && (
            <p style={{ fontSize: 13, color: testResult.ok ? 'var(--plate-green)' : 'var(--plate-red)' }}>
              {testResult.message}
            </p>
          )}
          <button
            className="btn btn-primary btn-block"
            onClick={handleConnect}
            disabled={testing || !owner || !repo || !token}
            data-testid="sync-connect-btn"
          >
            {testing ? 'Connecting…' : 'Connect & enable'}
          </button>
        </>
      ) : (
        <>
          <div className="row">
            <span className="mono-num" style={{ fontSize: 14 }}>
              {owner}/{repo}
            </span>
            <span
              className="pill"
              data-testid="sync-status-pill"
              style={{
                color:
                  syncStatus === 'error'
                    ? 'var(--plate-red)'
                    : syncStatus === 'conflict'
                    ? 'var(--plate-yellow)'
                    : 'var(--plate-green)',
              }}
            >
              <span className="pill-dot" />
              {statusLabel[syncStatus]}
            </span>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onSyncNow} disabled={syncStatus === 'syncing'} data-testid="sync-now-btn">
              Sync now
            </button>
            <button className="btn btn-ghost" onClick={handleDisable} data-testid="sync-disable-btn">
              Disable
            </button>
          </div>
        </>
      )}
    </div>
  );
}
