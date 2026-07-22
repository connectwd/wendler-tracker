/**
 * Central error-handling primitives. The goal: every local write goes through
 * one of these, so failures are surfaced to the person instead of silently
 * vanishing, and the messages are actionable rather than raw browser text.
 */

export class StorageError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/** Turns a raw thrown value (IndexedDB errors are inconsistent about this) into a message worth showing someone. */
export function describeStorageError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'QuotaExceededError':
        return "Your browser's storage is full. Export a backup (Settings) and free up space, then try again.";
      case 'InvalidStateError':
        return 'The local database is in an unexpected state - reloading the page usually fixes this.';
      case 'VersionError':
        return 'This tab is running an older version of the app than your data expects - reload the page.';
      default:
        return err.message || `Storage error (${err.name}).`;
    }
  }
  if (err instanceof StorageError) return err.message;
  if (err instanceof Error) return err.message;
  return 'An unknown storage error occurred.';
}

/** A single surfaced failure, shown in the UI until dismissed or superseded. */
export interface AppError {
  message: string;
  /** What we were trying to do when it failed, e.g. "saving your workout". Shown alongside the message. */
  action: string;
  timestamp: number;
}

export function makeAppError(action: string, err: unknown): AppError {
  return { message: describeStorageError(err), action, timestamp: Date.now() };
}
