import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { exportBackup } from "../lib/backup";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere below it - the one class of failure
 * `withPersistence` and `ErrorBanner` don't cover, since those only handle
 * failures the app already anticipated (a bad write, a bad backup file). This
 * is for the unanticipated kind: a data shape nobody planned for, a bug in a
 * date calculation, a future browser quirk. Without this, that's a blank
 * white screen with no explanation, on a phone, mid-workout.
 *
 * React error boundaries must be class components - there's no hook
 * equivalent (still true as of React 19).
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No external error reporting in this app, by design (see README - no
    // analytics, nothing phones home). The browser console is the only place
    // to find this after the fact.
    console.error("Uncaught render error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <ErrorFallback error={error} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

type ExportState = "idle" | "exporting" | "done" | "failed";

function ErrorFallback({
  error,
  onReload,
}: {
  error: Error;
  onReload: () => void;
}) {
  const [exportState, setExportState] = useState<ExportState>("idle");

  const handleExport = async () => {
    setExportState("exporting");
    try {
      // Reads straight from IndexedDB, independent of whatever crashed in the
      // component tree - this works whether or not the crash had anything to
      // do with the data itself.
      await exportBackup();
      setExportState("done");
    } catch {
      setExportState("failed");
    }
  };

  return (
    <div className="screen" data-testid="error-boundary-screen">
      <p className="eyebrow">Something went wrong</p>
      <h1>The app crashed, not your data</h1>
      <p>
        Everything you've logged is still sitting in this browser's storage -
        the screen crashed, the database didn't. Export a backup now while
        you're here as a precaution, then reload.
      </p>

      <div className="stack" style={{ marginTop: 4 }}>
        <button
          className="btn btn-primary btn-block"
          onClick={handleExport}
          disabled={exportState === "exporting"}
          data-testid="error-boundary-export-btn"
        >
          {exportState === "exporting"
            ? "Exporting…"
            : exportState === "done"
              ? "Exported ✓"
              : "Export backup now"}
        </button>

        {exportState === "failed" && (
          <div
            className="warning-banner"
            data-testid="error-boundary-export-failed"
          >
            Couldn't export automatically. Your data's still in IndexedDB
            regardless - check devtools ▸ Application ▸ IndexedDB if you need it
            right away.
          </div>
        )}

        <button
          className="btn btn-block"
          onClick={onReload}
          data-testid="error-boundary-reload-btn"
        >
          Reload app
        </button>
      </div>

      <details style={{ marginTop: 20 }} data-testid="error-boundary-details">
        <summary
          style={{
            color: "var(--text-faint)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Technical details
        </summary>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 11,
            color: "var(--text-faint)",
            marginTop: 8,
            background: "var(--surface)",
            padding: 10,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
      </details>
    </div>
  );
}
