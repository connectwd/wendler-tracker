import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pushBackHandler,
  removeBackHandler,
  replaceBackHandler,
  consumeTopBackHandler,
  backStackDepth,
} from './backNav';

// backStack is module-level state, shared across every test in this file -
// reset it manually since there's no exported "clear" (app code never needs
// one, but tests need isolation).
function resetStack() {
  while (backStackDepth() > 0) consumeTopBackHandler();
}

describe('backNav', () => {
  beforeEach(() => {
    resetStack();
  });

  it('starts empty', () => {
    expect(backStackDepth()).toBe(0);
  });

  it('consuming an empty stack is a safe no-op', () => {
    expect(() => consumeTopBackHandler()).not.toThrow();
    expect(backStackDepth()).toBe(0);
  });

  it('consumes handlers in LIFO order - last opened, first closed', () => {
    const calls: string[] = [];
    pushBackHandler(() => calls.push('workout'));
    pushBackHandler(() => calls.push('rest-timer'));

    expect(backStackDepth()).toBe(2);
    consumeTopBackHandler(); // simulates one swipe-back
    expect(calls).toEqual(['rest-timer']);
    expect(backStackDepth()).toBe(1);

    consumeTopBackHandler(); // simulates a second swipe-back
    expect(calls).toEqual(['rest-timer', 'workout']);
    expect(backStackDepth()).toBe(0);
  });

  it('removeBackHandler removes a specific handler even if not on top, and is a no-op if already gone', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    pushBackHandler(a);
    pushBackHandler(b);
    pushBackHandler(c);

    removeBackHandler(b); // e.g. an unmount cleanup running for a handler that isn't topmost
    expect(backStackDepth()).toBe(2);

    consumeTopBackHandler();
    expect(c).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    // Removing something no longer in the stack (already popped/replaced) must not throw.
    expect(() => removeBackHandler(b)).not.toThrow();
    expect(backStackDepth()).toBe(1);
  });

  it('replaceBackHandler swaps a handler in place without changing depth, and the swap wins on consume', () => {
    const original = vi.fn();
    const replacement = vi.fn();
    pushBackHandler(original);

    replaceBackHandler(original, replacement);
    expect(backStackDepth()).toBe(1);

    consumeTopBackHandler();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled();
  });

  it('replaceBackHandler is a no-op if the handler is not found', () => {
    const a = vi.fn();
    const unrelated = vi.fn();
    pushBackHandler(a);

    replaceBackHandler(unrelated, vi.fn());
    expect(backStackDepth()).toBe(1);

    consumeTopBackHandler();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('models three nested layers closing one swipe at a time (workout -> rest timer -> a second rest timer open)', () => {
    const order: string[] = [];
    pushBackHandler(() => order.push('close workout'));
    pushBackHandler(() => order.push('close rest timer'));

    consumeTopBackHandler();
    consumeTopBackHandler();
    expect(order).toEqual(['close rest timer', 'close workout']);
    expect(backStackDepth()).toBe(0);

    // A further swipe past the last layer is a harmless no-op (falls through to the OS).
    consumeTopBackHandler();
    expect(order).toEqual(['close rest timer', 'close workout']);
  });
});
