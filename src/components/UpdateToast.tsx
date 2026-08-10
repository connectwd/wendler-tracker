interface UpdateToastProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

export function UpdateToast({ onRefresh, onDismiss }: UpdateToastProps) {
  return (
    <div className="update-toast" role="status" data-testid="update-toast">
      <p>A new version of the app is available.</p>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onDismiss} data-testid="update-toast-dismiss">
          Ignore this to continue
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={onRefresh}
          data-testid="update-toast-refresh"
        >
          Refresh to update
        </button>
      </div>
    </div>
  );
}
