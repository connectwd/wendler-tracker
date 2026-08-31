import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLastBackupTimestamp,
  daysSinceLastBackup,
  BackupValidationError,
  importBackupFromFile,
  isValidLift,
  isValidCycle,
  isValidWorkout,
  isValidBodyweightEntry,
  isValidAppData,
} from "./backup";
import { SCHEMA_VERSION } from "../types";

// vitest.config.ts runs this file with environment: 'node', which has no
// localStorage global - a small in-memory stand-in is enough to exercise the
// pure date-math in daysSinceLastBackup without needing jsdom.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const copy: Record<string, unknown> = { ...obj };
  delete copy[key as string];
  return copy as Omit<T, K>;
}

const validLift = { id: "l1", name: "Bench Press", cycleIncrement: 3 };
const validCycle = {
  id: "c1",
  cycleNumber: 1,
  trainingMaxes: { l1: 100 },
  status: "active",
};
const validWorkout = {
  id: "w1",
  liftId: "l1",
  cycleId: "c1",
  warmupSets: [],
  mainSets: [],
  bbsSets: [],
  accessories: [],
  status: "pending",
};
const validBodyweightEntry = {
  id: "2026-01-01",
  date: "2026-01-01",
  weight: 90,
};
const validAppData = {
  settings: { units: "kg", barWeight: 20 },
  lifts: [validLift],
  cycles: [validCycle],
  workouts: [validWorkout],
  bodyweightEntries: [validBodyweightEntry],
};

function fileOf(contents: string): File {
  return new File([contents], "backup.json", { type: "application/json" });
}

function validBackupFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    app: "wendler-tracker",
    data: validAppData,
    ...overrides,
  });
}

describe("getLastBackupTimestamp / daysSinceLastBackup", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null when nothing has been exported yet", () => {
    expect(getLastBackupTimestamp()).toBeNull();
    expect(daysSinceLastBackup()).toBeNull();
  });

  it("reports 0 for a timestamp from a few minutes ago", () => {
    localStorage.setItem(
      "wendler-tracker-last-backup-at",
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    );
    expect(daysSinceLastBackup()).toBe(0);
  });

  it("reports whole days elapsed, rounding down rather than up", () => {
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000 - 60 * 1000,
    );
    localStorage.setItem(
      "wendler-tracker-last-backup-at",
      fourteenDaysAgo.toISOString(),
    );
    expect(daysSinceLastBackup()).toBe(14);
  });

  it("does not round 13 days 23 hours up to 14 - the nag banner threshold matters here", () => {
    const almostFourteen = new Date(
      Date.now() - (14 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000),
    );
    localStorage.setItem(
      "wendler-tracker-last-backup-at",
      almostFourteen.toISOString(),
    );
    expect(daysSinceLastBackup()).toBe(13);
  });
});

describe("per-record validators", () => {
  it("isValidLift accepts a well-formed lift and rejects missing/wrong-typed fields", () => {
    expect(isValidLift(validLift)).toBe(true);
    expect(isValidLift({ ...validLift, cycleIncrement: "3" })).toBe(false);
    expect(isValidLift({ id: "l1", name: "Bench Press" })).toBe(false);
    expect(isValidLift(null)).toBe(false);
    expect(isValidLift("l1")).toBe(false);
    expect(isValidLift([])).toBe(false);
  });

  it("isValidCycle requires trainingMaxes to be an object and status to be a known value", () => {
    expect(isValidCycle(validCycle)).toBe(true);
    expect(isValidCycle({ ...validCycle, trainingMaxes: [100] })).toBe(false);
    expect(isValidCycle({ ...validCycle, status: "archived" })).toBe(false);
    expect(isValidCycle({ ...validCycle, cycleNumber: "1" })).toBe(false);
  });

  it("isValidWorkout requires every set array to actually be an array, not just present", () => {
    expect(isValidWorkout(validWorkout)).toBe(true);
    const missingMainSets = omit(validWorkout, "mainSets");
    expect(isValidWorkout(missingMainSets)).toBe(false);
    expect(isValidWorkout({ ...validWorkout, mainSets: "none" })).toBe(false);
    expect(isValidWorkout({ ...validWorkout, status: "in-progress" })).toBe(
      false,
    );
  });

  it("isValidWorkout accepts the real in_progress status (underscore, not hyphen)", () => {
    expect(isValidWorkout({ ...validWorkout, status: "in_progress" })).toBe(
      true,
    );
  });

  it("isValidBodyweightEntry requires a numeric weight", () => {
    expect(isValidBodyweightEntry(validBodyweightEntry)).toBe(true);
    expect(
      isValidBodyweightEntry({ ...validBodyweightEntry, weight: "90" }),
    ).toBe(false);
  });

  it("isValidAppData treats bodyweightEntries as optional (pre-bodyweight-feature backups)", () => {
    const withoutBodyweight = omit(validAppData, "bodyweightEntries");
    expect(isValidAppData(withoutBodyweight)).toBe(true);
  });

  it("isValidAppData rejects a data object where every top-level container looks right but one record inside is malformed", () => {
    expect(
      isValidAppData({
        ...validAppData,
        workouts: [{ ...validWorkout, mainSets: undefined }],
      }),
    ).toBe(false);
  });

  it("isValidAppData rejects non-object input entirely", () => {
    expect(isValidAppData(null)).toBe(false);
    expect(isValidAppData([validAppData])).toBe(false);
    expect(isValidAppData("data")).toBe(false);
  });
});

describe("importBackupFromFile", () => {
  it("rejects a file that is not valid JSON", async () => {
    await expect(importBackupFromFile(fileOf("{not json"))).rejects.toThrow(
      BackupValidationError,
    );
    await expect(importBackupFromFile(fileOf("{not json"))).rejects.toThrow(
      /not valid JSON/i,
    );
  });

  it("rejects a JSON file that isn't a wendler-tracker backup", async () => {
    const file = fileOf(
      JSON.stringify({
        app: "some-other-app",
        data: validAppData,
        schemaVersion: SCHEMA_VERSION,
      }),
    );
    await expect(importBackupFromFile(file)).rejects.toThrow(
      /doesn't look like a wendler-tracker backup/i,
    );
  });

  it("rejects a backup from a newer schema version than this build supports", async () => {
    const file = fileOf(validBackupFile({ schemaVersion: SCHEMA_VERSION + 1 }));
    await expect(importBackupFromFile(file)).rejects.toThrow(
      /newer version of the app/i,
    );
  });

  it("rejects a backup from an older schema version with a message telling them to keep the file", async () => {
    const file = fileOf(validBackupFile({ schemaVersion: SCHEMA_VERSION - 1 }));
    await expect(importBackupFromFile(file)).rejects.toThrow(
      /older version of the app/i,
    );
    await expect(importBackupFromFile(file)).rejects.toThrow(
      /hold onto the file/i,
    );
  });

  it("rejects a backup whose data does not match the expected shape", async () => {
    const file = fileOf(
      validBackupFile({ data: { ...validAppData, lifts: "not an array" } }),
    );
    await expect(importBackupFromFile(file)).rejects.toThrow(/corrupted/i);
  });

  it("accepts a well-formed current-schema backup and hands the data to persist verbatim", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const file = fileOf(validBackupFile());

    await importBackupFromFile(file, persist);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(validAppData);
  });

  it("fills in an empty bodyweightEntries array for a pre-bodyweight-feature backup rather than rejecting it", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const dataWithoutBodyweight = omit(validAppData, "bodyweightEntries");
    const file = fileOf(validBackupFile({ data: dataWithoutBodyweight }));

    await importBackupFromFile(file, persist);

    expect(persist).toHaveBeenCalledWith({
      ...dataWithoutBodyweight,
      bodyweightEntries: [],
    });
  });
});
