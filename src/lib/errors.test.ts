import { describe, it, expect } from 'vitest';
import { StorageError, describeStorageError, makeAppError } from './errors';

function domException(name: string, message = ''): DOMException {
  return new DOMException(message, name);
}

describe('describeStorageError', () => {
  it('gives an actionable message for QuotaExceededError', () => {
    expect(describeStorageError(domException('QuotaExceededError'))).toMatch(/storage is full/i);
    expect(describeStorageError(domException('QuotaExceededError'))).toMatch(/export a backup/i);
  });

  it('gives an actionable message for InvalidStateError', () => {
    expect(describeStorageError(domException('InvalidStateError'))).toMatch(/reloading the page/i);
  });

  it('gives an actionable message for VersionError', () => {
    expect(describeStorageError(domException('VersionError'))).toMatch(/older version/i);
  });

  it('falls back to the DOMException message for an unrecognized name', () => {
    expect(describeStorageError(domException('UnknownWeirdError', 'something specific broke'))).toBe(
      'something specific broke'
    );
  });

  it('falls back to a generic message for an unrecognized DOMException with no message', () => {
    expect(describeStorageError(domException('UnknownWeirdError'))).toBe('Storage error (UnknownWeirdError).');
  });

  it('uses the message directly for a StorageError', () => {
    expect(describeStorageError(new StorageError('could not save your workout'))).toBe(
      'could not save your workout'
    );
  });

  it('uses the message directly for a plain Error', () => {
    expect(describeStorageError(new Error('boom'))).toBe('boom');
  });

  it('has a final fallback for a thrown non-Error value', () => {
    expect(describeStorageError('a raw string')).toBe('An unknown storage error occurred.');
    expect(describeStorageError(undefined)).toBe('An unknown storage error occurred.');
    expect(describeStorageError({ weird: true })).toBe('An unknown storage error occurred.');
  });
});

describe('makeAppError', () => {
  it('bundles the described message with the action and a timestamp', () => {
    const before = Date.now();
    const result = makeAppError('saving your workout', new Error('disk full'));
    const after = Date.now();

    expect(result.message).toBe('disk full');
    expect(result.action).toBe('saving your workout');
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it('routes DOMException-derived messages through the same describeStorageError logic', () => {
    const result = makeAppError('syncing', domException('QuotaExceededError'));
    expect(result.message).toMatch(/storage is full/i);
  });
});
