import type { AppError } from '../lib/errors';

interface ErrorBannerProps {
  error: AppError;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div
      className="warning-banner"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}
      data-testid="error-banner"
    >
      <div>
        <strong>Couldn't finish {error.action}.</strong> {error.message}
      </div>
      <button
        className="btn btn-ghost"
        style={{ padding: '2px 8px', minHeight: 'auto', flexShrink: 0 }}
        onClick={onDismiss}
        aria-label="Dismiss"
        data-testid="error-banner-dismiss"
      >
        ✕
      </button>
    </div>
  );
}
