import { useEffect } from "react";

interface SaveToastProps {
  message: string;
  onDone: () => void;
}

/**
 * Brief, auto-dismissing confirmation shown after a workout save succeeds.
 * Unlike UpdateToast (which needs a decision from the person), this one
 * just confirms something that already happened, so it clears itself.
 */
export function SaveToast({ message, onDone }: SaveToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="save-toast" role="status" data-testid="save-toast">
      <p>{message}</p>
    </div>
  );
}
