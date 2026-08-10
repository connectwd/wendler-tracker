import type { Settings } from '../types';

/**
 * Which part of a session a rest timer was started from. Warm-up, BBS, and
 * accessory work are all higher-volume/lower-intensity, so they share the
 * "short" default; main/AMRAP work is the heaviest and gets the "long" one.
 * Both are still just defaults - adjustable in Settings ahead of time, and
 * with +/-15s controls on the timer itself in the moment.
 */
export type WorkoutSection = 'warmup' | 'main' | 'bbs' | 'accessory';

export function defaultRestSeconds(section: WorkoutSection, settings: Settings): number {
  return section === 'main' ? settings.restTimerLongSeconds : settings.restTimerShortSeconds;
}

/** Clamps a rest duration to a sane range - a stray Settings edit (or a rapid string of -15s taps) shouldn't produce a negative or day-long timer. */
export function clampRestSeconds(seconds: number): number {
  return Math.max(5, Math.min(seconds, 20 * 60));
}

/** Formats a whole number of seconds as M:SS for the countdown display. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
