import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pullRemote, pushRemote, testConnection, SyncConflictError, SyncAuthError, SyncRateLimitError } from './github-sync';
import type { AppData, SyncConfig } from '../types';

const config: SyncConfig = { enabled: true, owner: 'jake', repo: 'wendler-data', path: 'wendler-data.json', token: 'fake-token' };

const sampleData: AppData = {
  settings: { units: 'kg', barWeight: 20, roundingIncrement: 2.5, bodyweight: 90, onboardingComplete: true },
  lifts: [{ id: 'bench', name: 'Bench Press', dayOfWeek: 1, order: 1, cycleIncrement: 3 }],
  cycles: [
    { id: 'c1', cycleNumber: 1, startDate: '2026-07-14', trainingMaxes: { bench: 166.5 }, status: 'active', completedDate: null },
  ],
  workouts: [],
};

function b64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/** A minimal fetch-Response stand-in - just enough surface for the code under test. */
function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe('pullRemote / pushRemote / testConnection - core behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pullRemote returns null on 404 (no sync has happened yet)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(404, {})));
    expect(await pullRemote(config)).toBeNull();
  });

  it('pullRemote decodes base64 content correctly', async () => {
    const payload = { schemaVersion: 2, updatedAt: '2026-07-10T00:00:00.000Z', app: 'wendler-tracker', data: sampleData };
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, { content: b64(JSON.stringify(payload)), sha: 'sha-abc' })));
    const result = await pullRemote(config);
    expect(result?.sha).toBe('sha-abc');
    expect(result?.payload.data.lifts[0].name).toBe('Bench Press');
  });

  it('pushRemote omits sha when creating, includes it when updating', async () => {
    let capturedBody: any = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return fakeResponse(201, { content: { sha: 'sha-new' } });
      })
    );
    await pushRemote(config, sampleData, null);
    expect(capturedBody.sha).toBeUndefined();

    await pushRemote(config, sampleData, 'sha-abc');
    expect(capturedBody.sha).toBe('sha-abc');
  });

  it('pushRemote surfaces a 409 as SyncConflictError carrying the current remote state', async () => {
    const remotePayload = { schemaVersion: 2, updatedAt: '2026-07-10T00:00:00.000Z', app: 'wendler-tracker', data: sampleData };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return fakeResponse(409, {});
        return fakeResponse(200, { content: b64(JSON.stringify(remotePayload)), sha: 'sha-conflict' });
      })
    );
    await expect(pushRemote(config, sampleData, 'stale-sha')).rejects.toThrow(SyncConflictError);
  });

  it('a genuine 401 throws SyncAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(401, {})));
    await expect(pullRemote(config)).rejects.toThrow(SyncAuthError);
  });

  it('a rate-limited 403 (X-RateLimit-Remaining: 0) throws SyncRateLimitError, not SyncAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(403, {}, { 'X-RateLimit-Remaining': '0' }))
    );
    await expect(pullRemote(config)).rejects.toThrow(SyncRateLimitError);
  });

  it('a plain 403 with no rate-limit header is treated as an auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(403, {})));
    await expect(pullRemote(config)).rejects.toThrow(SyncAuthError);
  });

  it('testConnection reports a missing/inaccessible repo clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(404, {})));
    const result = await testConnection(config);
    expect(result.ok).toBe(false);
  });
});

describe('retry with backoff - transient failures only', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a 500 and succeeds once the server recovers', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        if (calls < 3) return fakeResponse(500, {});
        return fakeResponse(404, {}); // "no file yet" is a clean terminal state for this test
      })
    );

    const promise = pullRemote(config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(calls).toBe(3);
    expect(result).toBeNull();
  });

  it('retries 429 and respects a Retry-After header', async () => {
    let calls = 0;
    const timestamps: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        timestamps.push(Date.now());
        calls++;
        if (calls < 2) return fakeResponse(429, {}, { 'Retry-After': '5' });
        return fakeResponse(404, {});
      })
    );

    const promise = pullRemote(config);
    await vi.runAllTimersAsync();
    await promise;

    expect(calls).toBe(2);
    // Second call should land ~5000ms after the first, honoring Retry-After rather than the default backoff curve.
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(5000);
  });

  it('retries when fetch itself throws (offline / DNS / dropped connection)', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        if (calls < 2) throw new TypeError('Failed to fetch');
        return fakeResponse(404, {});
      })
    );

    const promise = pullRemote(config);
    await vi.runAllTimersAsync();
    await promise;

    expect(calls).toBe(2);
  });

  it('does NOT retry a 401 - retrying a bad token wastes time for no benefit', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return fakeResponse(401, {});
      })
    );

    await expect(pullRemote(config)).rejects.toThrow(SyncAuthError);
    expect(calls).toBe(1);
  });

  it('does NOT retry a 404 - there is nothing to retry into existing', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return fakeResponse(404, {});
      })
    );

    await pullRemote(config);
    expect(calls).toBe(1);
  });

  it('does NOT retry a 409 conflict - it needs the conflict-resolution flow, not a blind retry', async () => {
    let putCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          putCalls++;
          return fakeResponse(409, {});
        }
        return fakeResponse(200, {
          content: Buffer.from(
            JSON.stringify({ schemaVersion: 2, updatedAt: '2026-01-01', app: 'wendler-tracker', data: sampleData })
          ).toString('base64'),
          sha: 'sha-x',
        });
      })
    );

    await expect(pushRemote(config, sampleData, 'stale')).rejects.toThrow(SyncConflictError);
    expect(putCalls).toBe(1);
  });

  it('gives up after exhausting retries on a persistent 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(500, {})));

    const promise = pullRemote(config).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(Error);
    expect((globalThis.fetch as any).mock.calls.length).toBeGreaterThan(1);
    expect((globalThis.fetch as any).mock.calls.length).toBeLessThanOrEqual(4);
  });
});
