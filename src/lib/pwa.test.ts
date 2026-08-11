import { describe, it, expect, vi, afterEach } from "vitest";
import { registerServiceWorker, applyUpdate } from "./pwa";

// vitest runs in a plain 'node' environment here (see vitest.config.ts) - no real DOM.
// This is a minimal stand-in for the addEventListener/dispatch surface these tests need
// from window/document/navigator.serviceWorker, all of which are plain EventTargets.
class FakeEventTarget {
  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  addEventListener(type: string, fn: (...args: unknown[]) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (...args: unknown[]) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== fn);
  }
  hasListener(type: string): boolean {
    return (this.listeners[type]?.length ?? 0) > 0;
  }
  dispatch(type: string, ...args: unknown[]) {
    (this.listeners[type] ?? []).forEach((fn) => fn(...args));
  }
}

function setUpFakes(opts: {
  hasController: boolean;
  supportsServiceWorker?: boolean;
}) {
  const fakeRegistration = { update: vi.fn().mockResolvedValue(undefined) };
  const swContainer = Object.assign(new FakeEventTarget(), {
    controller: opts.hasController ? {} : null,
    register: vi.fn().mockResolvedValue(fakeRegistration),
  });

  const fakeNavigator =
    opts.supportsServiceWorker === false ? {} : { serviceWorker: swContainer };
  vi.stubGlobal("navigator", fakeNavigator);

  const fakeWindow = Object.assign(new FakeEventTarget(), {
    location: { reload: vi.fn() },
  });
  vi.stubGlobal("window", fakeWindow);

  const fakeDocument = Object.assign(new FakeEventTarget(), {
    visibilityState: "visible" as string,
  });
  vi.stubGlobal("document", fakeDocument);

  return { swContainer, fakeWindow, fakeDocument, fakeRegistration };
}

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does nothing in dev mode - never even attaches a load listener", () => {
    const { fakeWindow, swContainer } = setUpFakes({ hasController: false });
    registerServiceWorker(vi.fn(), true);
    expect(fakeWindow.hasListener("load")).toBe(false);
    expect(swContainer.register).not.toHaveBeenCalled();
  });

  it("does nothing when the browser has no serviceWorker support", () => {
    const { fakeWindow } = setUpFakes({
      hasController: false,
      supportsServiceWorker: false,
    });
    registerServiceWorker(vi.fn(), false);
    expect(fakeWindow.hasListener("load")).toBe(false);
  });

  it("registers on window load in production", async () => {
    const { fakeWindow, swContainer } = setUpFakes({ hasController: false });
    registerServiceWorker(vi.fn(), false);
    fakeWindow.dispatch("load");
    await vi.waitFor(() =>
      expect(swContainer.register).toHaveBeenCalledTimes(1),
    );
    expect(swContainer.register.mock.calls[0][0]).toMatch(/sw\.js$/);
    expect(swContainer.register.mock.calls[0][1]).toEqual({
      updateViaCache: "none",
    });
  });

  it("calls onUpdateAvailable when the page already had a controller and a new one takes over (genuine update)", async () => {
    const { fakeWindow, swContainer } = setUpFakes({ hasController: true });
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate, false);
    fakeWindow.dispatch("load");

    // Wait for the async load handler's `await register(...)` to resolve and register its
    // own controllerchange listener before we dispatch it.
    await vi.waitFor(() =>
      expect(swContainer.hasListener("controllerchange")).toBe(true),
    );

    swContainer.dispatch("controllerchange");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onUpdateAvailable on the very first install (no prior controller)", async () => {
    const { fakeWindow, swContainer } = setUpFakes({ hasController: false });
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate, false);
    fakeWindow.dispatch("load");

    await vi.waitFor(() =>
      expect(swContainer.hasListener("controllerchange")).toBe(true),
    );

    swContainer.dispatch("controllerchange");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("polls registration.update() on an interval", async () => {
    vi.useFakeTimers();
    const { fakeWindow, fakeRegistration } = setUpFakes({
      hasController: false,
    });
    registerServiceWorker(vi.fn(), false);
    fakeWindow.dispatch("load");

    // Let the pending `await register(...)` microtask resolve before advancing timers.
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeRegistration.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(fakeRegistration.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(fakeRegistration.update).toHaveBeenCalledTimes(2);
  });

  it("re-checks for an update when the tab becomes visible again", async () => {
    const { fakeWindow, fakeDocument, fakeRegistration } = setUpFakes({
      hasController: false,
    });
    registerServiceWorker(vi.fn(), false);
    fakeWindow.dispatch("load");
    await vi.waitFor(() =>
      expect(fakeDocument.hasListener("visibilitychange")).toBe(true),
    );

    fakeDocument.visibilityState = "hidden";
    fakeDocument.dispatch("visibilitychange");
    expect(fakeRegistration.update).not.toHaveBeenCalled();

    fakeDocument.visibilityState = "visible";
    fakeDocument.dispatch("visibilitychange");
    expect(fakeRegistration.update).toHaveBeenCalledTimes(1);
  });
});

describe("applyUpdate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reloads the page", () => {
    const fakeWindow = { location: { reload: vi.fn() } };
    vi.stubGlobal("window", fakeWindow);
    applyUpdate();
    expect(fakeWindow.location.reload).toHaveBeenCalledTimes(1);
  });
});
