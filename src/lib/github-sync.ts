import type { AppData, SyncConfig, SyncPayload } from '../types';
import { SCHEMA_VERSION } from '../types';

const API_BASE = 'https://api.github.com';

export class SyncAuthError extends Error {}

/** Distinct from SyncAuthError even though GitHub uses the same 403 status for both -
 * this one means "try again shortly," not "the token is wrong." */
export class SyncRateLimitError extends Error {}

export class SyncConflictError extends Error {
  remotePayload: SyncPayload;
  remoteSha: string;
  constructor(remotePayload: SyncPayload, remoteSha: string) {
    super('Remote data has changed since the last sync from this device.');
    this.remotePayload = remotePayload;
    this.remoteSha = remoteSha;
  }
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function contentsUrl(config: SyncConfig): string {
  const encodedPath = config.path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;
}

function authHeaders(config: SyncConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ---- Retry with backoff, for transient failures only ----
//
// Deliberately NOT retried: 401/403-not-rate-limit (bad token - retrying
// changes nothing), 404 (not found), 409/422 (conflict - needs the
// conflict-resolution flow, not a blind retry that would just conflict
// again). Retried: the fetch() call itself throwing (offline, DNS, a flaky
// gym wifi dropping mid-request), 429 (rate limited), and 5xx (GitHub's
// problem, usually transient).

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, or however long GitHub's Retry-After says to wait if it's present. */
function retryDelayMs(attempt: number, baseDelayMs: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = exponential * 0.3 * Math.random();
  return exponential + jitter;
}

interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function fetchWithRetry(url: string, init: RequestInit, options: FetchRetryOptions = {}): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    try {
      const res = await fetch(url, init);
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || isLastAttempt) {
        return res;
      }
      await sleep(retryDelayMs(attempt, baseDelayMs, res.headers.get('Retry-After')));
    } catch (err) {
      lastNetworkError = err;
      if (isLastAttempt) throw err;
      await sleep(retryDelayMs(attempt, baseDelayMs, null));
    }
  }
  // Unreachable - the loop above always returns or throws - but satisfies the return type.
  throw lastNetworkError ?? new Error('Ran out of retry attempts.');
}

/** True if a 403 is GitHub's rate limiting rather than a genuinely bad token. */
function isRateLimited(res: Response): boolean {
  return res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0';
}

function throwForAuthOrRateLimit(res: Response): never {
  if (isRateLimited(res)) {
    const resetHeader = res.headers.get('X-RateLimit-Reset');
    const resetAt = resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : null;
    throw new SyncRateLimitError(
      resetAt
        ? `GitHub's API rate limit was hit - this should clear up by ${resetAt.toLocaleTimeString()}.`
        : "GitHub's API rate limit was hit - this should clear up shortly."
    );
  }
  throw new SyncAuthError("GitHub rejected the token - check it has Contents read/write on this repo.");
}

export interface RemoteFile {
  payload: SyncPayload;
  sha: string;
}

/** Fetches the current synced file. Returns null if it doesn't exist yet (first sync ever). */
export async function pullRemote(config: SyncConfig): Promise<RemoteFile | null> {
  const res = await fetchWithRetry(contentsUrl(config), { headers: authHeaders(config) });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throwForAuthOrRateLimit(res);
  if (!res.ok) {
    throw new Error(`GitHub sync pull failed (${res.status})`);
  }
  const json = await res.json();
  const decoded = base64ToUtf8(json.content as string);
  const payload = JSON.parse(decoded) as SyncPayload;
  return { payload, sha: json.sha as string };
}

/**
 * Pushes local data to the remote file. `knownSha` should be the sha last
 * seen from this device (via pullRemote/pushRemote) - pass null only when
 * no sync has ever happened. Throws SyncConflictError if the remote file
 * has moved since knownSha (i.e. another device pushed first).
 */
export async function pushRemote(
  config: SyncConfig,
  data: AppData,
  knownSha: string | null
): Promise<{ sha: string; updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  const payload: SyncPayload = { schemaVersion: SCHEMA_VERSION, updatedAt, app: 'wendler-tracker', data };
  const body: Record<string, unknown> = {
    message: `Sync ${updatedAt}`,
    content: utf8ToBase64(JSON.stringify(payload, null, 2)),
  };
  if (knownSha) body.sha = knownSha;

  const res = await fetchWithRetry(contentsUrl(config), {
    method: 'PUT',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 409 || res.status === 422) {
    const remote = await pullRemote(config);
    if (remote) throw new SyncConflictError(remote.payload, remote.sha);
    throw new Error('GitHub reported a sync conflict but the remote file could not be re-fetched.');
  }
  if (res.status === 401 || res.status === 403) throwForAuthOrRateLimit(res);
  if (!res.ok) {
    throw new Error(`GitHub sync push failed (${res.status})`);
  }
  const json = await res.json();
  return { sha: json.content.sha as string, updatedAt };
}

export async function testConnection(
  config: SyncConfig
): Promise<{ ok: true; fileExists: boolean } | { ok: false; message: string }> {
  try {
    const repoRes = await fetchWithRetry(
      `${API_BASE}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
      { headers: authHeaders(config) }
    );
    if (repoRes.status === 404) {
      return { ok: false, message: `Repo "${config.owner}/${config.repo}" not found, or this token can't see it.` };
    }
    if (repoRes.status === 401 || repoRes.status === 403) {
      throwForAuthOrRateLimit(repoRes);
    }
    if (!repoRes.ok) {
      return { ok: false, message: `Unexpected response from GitHub (${repoRes.status}).` };
    }
    const remote = await pullRemote(config);
    return { ok: true, fileExists: remote !== null };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error contacting GitHub.' };
  }
}
