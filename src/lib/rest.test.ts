import { describe, it, expect } from 'vitest';
import { defaultRestSeconds, clampRestSeconds, formatCountdown } from './rest';
import { DEFAULT_SETTINGS } from './db';

describe('defaultRestSeconds', () => {
  const settings = { ...DEFAULT_SETTINGS, restTimerShortSeconds: 90, restTimerLongSeconds: 180 };

  it('uses the long default for main work', () => {
    expect(defaultRestSeconds('main', settings)).toBe(180);
  });

  it('uses the short default for warm-up, BBS, and accessory work', () => {
    expect(defaultRestSeconds('warmup', settings)).toBe(90);
    expect(defaultRestSeconds('bbs', settings)).toBe(90);
    expect(defaultRestSeconds('accessory', settings)).toBe(90);
  });

  it('reflects a customized Settings value', () => {
    const custom = { ...settings, restTimerLongSeconds: 300 };
    expect(defaultRestSeconds('main', custom)).toBe(300);
  });
});

describe('clampRestSeconds', () => {
  it('leaves an in-range value untouched', () => {
    expect(clampRestSeconds(90)).toBe(90);
  });

  it('floors at 5 seconds', () => {
    expect(clampRestSeconds(-30)).toBe(5);
    expect(clampRestSeconds(0)).toBe(5);
  });

  it('ceilings at 20 minutes', () => {
    expect(clampRestSeconds(999999)).toBe(1200);
  });
});

describe('formatCountdown', () => {
  it('formats whole minutes', () => {
    expect(formatCountdown(180)).toBe('3:00');
  });

  it('pads seconds under 10', () => {
    expect(formatCountdown(65)).toBe('1:05');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('rounds fractional seconds', () => {
    expect(formatCountdown(89.6)).toBe('1:30');
  });
});
