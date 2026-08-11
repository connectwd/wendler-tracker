import { useEffect, useRef, useState } from "react";
import { clampRestSeconds, formatCountdown } from "../lib/rest";
import { RestGame } from "./RestGame";
import { useBackable } from "../hooks/useBackable";

interface RestTimerProps {
  defaultSeconds: number;
  sectionLabel: string;
  highScore: number;
  onNewHighScore: (score: number) => void;
  onClose: () => void;
}

/** A short two-note chime via the Web Audio API - no audio file to bundle, and it still works offline. */
function playChime() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const note = (freq: number, startOffset: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    };
    note(880, 0); // A5
    note(1174.66, 0.15); // D6 - a little "ding-ding" rather than one flat beep
  } catch {
    // Audio can fail for plenty of reasons (autoplay policy, no support) -
    // the visual "Rest's over!" state and vibration still cover it either way.
  }
}

export function RestTimer({
  defaultSeconds,
  sectionLabel,
  highScore,
  onNewHighScore,
  onClose,
}: RestTimerProps) {
  // Registers the overlay as its own back-able layer, nested on top of the
  // workout session underneath it - one swipe closes just the timer and
  // returns to the session, a second swipe closes the session itself.
  const { goBack } = useBackable(onClose);

  const [endAt, setEndAt] = useState(() => Date.now() + defaultSeconds * 1000);
  const [secondsLeft, setSecondsLeft] = useState(defaultSeconds);
  const alertedRef = useRef(false);

  useEffect(() => {
    function recompute() {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !alertedRef.current) {
        alertedRef.current = true;
        playChime();
        navigator.vibrate?.([200, 100, 200]);
      }
    }
    recompute();
    // 250ms rather than 1000ms so the display doesn't visibly stutter, and
    // recomputed from `endAt` (a fixed target time) rather than decremented
    // by 1 each tick, so a backgrounded tab throttling setInterval doesn't
    // leave the countdown wrong when you come back - see visibilitychange
    // below, and the same approach used for PWA update polling.
    const interval = setInterval(recompute, 250);
    document.addEventListener("visibilitychange", recompute);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", recompute);
    };
  }, [endAt]);

  const done = secondsLeft === 0;

  function adjust(deltaSeconds: number) {
    if (done && deltaSeconds < 0) return; // nothing left to subtract from "done"
    setEndAt((prev) => {
      const remainingNow = Math.max(0, Math.ceil((prev - Date.now()) / 1000));
      const nextRemaining = clampRestSeconds(remainingNow + deltaSeconds);
      if (nextRemaining > 0) alertedRef.current = false; // adding time after it's already alerted re-arms the alert
      return Date.now() + nextRemaining * 1000;
    });
  }

  return (
    <div className="screen rest-timer-overlay" data-testid="rest-timer-overlay">
      <p className="eyebrow">{sectionLabel} rest</p>
      <div
        className={`rest-timer-display${done ? " done" : ""}`}
        data-testid="rest-timer-countdown"
      >
        {done ? "Rest's over!" : formatCountdown(secondsLeft)}
      </div>

      <div
        className="row"
        style={{ gap: 8, justifyContent: "center", margin: "10px 0" }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => adjust(-15)}
          data-testid="rest-timer-subtract-15"
        >
          −15s
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => adjust(15)}
          data-testid="rest-timer-add-15"
        >
          +15s
        </button>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--text-faint)",
          textAlign: "center",
        }}
      >
        Tap the plate (or hit space) to flap while you wait.
      </p>
      <RestGame highScore={highScore} onNewHighScore={onNewHighScore} />

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 16 }}
        onClick={goBack}
        data-testid="rest-timer-close-btn"
      >
        {done ? "Back to workout" : "Skip rest"}
      </button>
    </div>
  );
}
