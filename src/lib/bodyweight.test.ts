import { describe, it, expect } from "vitest";
import {
  buildBodyweightEntry,
  sortedByDate,
  latestBodyweight,
  bodyweightAsOf,
  bodyweightTrendPoints,
  strengthToBodyweightRatioPoints,
  hasAnyRatioData,
} from "./bodyweight";
import type { BodyweightEntry, Workout, LiftConfig } from "../types";

function entry(date: string, weight: number): BodyweightEntry {
  return buildBodyweightEntry(date, weight);
}

function workout(
  date: string | null,
  liftId: string,
  e1rm: number | null,
): Workout {
  return {
    id: `${liftId}-${date}`,
    cycleId: "c1",
    liftId,
    week: 3,
    date,
    warmupSets: [],
    mainSets: [],
    bbsSets: [],
    accessories: [],
    estimatedOneRepMax: e1rm,
    status: e1rm !== null ? "completed" : "pending",
    bodyweight: null,
    notes: "",
  };
}

describe("buildBodyweightEntry", () => {
  it("uses the date as the id, so logging twice on the same date is an upsert", () => {
    const e = buildBodyweightEntry("2026-03-01", 88.5);
    expect(e).toEqual({ id: "2026-03-01", date: "2026-03-01", weight: 88.5 });
  });
});

describe("sortedByDate", () => {
  it("sorts oldest first regardless of input order", () => {
    const result = sortedByDate([
      entry("2026-03-03", 1),
      entry("2026-03-01", 2),
      entry("2026-03-02", 3),
    ]);
    expect(result.map((e) => e.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [entry("2026-03-03", 1), entry("2026-03-01", 2)];
    const originalOrder = input.map((e) => e.date);
    sortedByDate(input);
    expect(input.map((e) => e.date)).toEqual(originalOrder);
  });
});

describe("latestBodyweight", () => {
  it("returns null for an empty history", () => {
    expect(latestBodyweight([])).toBeNull();
  });

  it("returns the most recent entry regardless of input order", () => {
    const result = latestBodyweight([
      entry("2026-03-01", 90),
      entry("2026-03-15", 89),
      entry("2026-03-08", 89.5),
    ]);
    expect(result).toEqual(entry("2026-03-15", 89));
  });
});

describe("bodyweightAsOf", () => {
  const history = [
    entry("2026-01-01", 92),
    entry("2026-02-01", 90),
    entry("2026-03-01", 88),
  ];

  it("returns null when asked about a date before any entry exists", () => {
    expect(bodyweightAsOf(history, "2025-12-31")).toBeNull();
  });

  it("carries forward the most recent entry on or before the given date", () => {
    expect(bodyweightAsOf(history, "2026-02-15")).toBe(90);
  });

  it("matches exactly when the date has its own entry", () => {
    expect(bodyweightAsOf(history, "2026-02-01")).toBe(90);
  });

  it("uses the latest entry for a date after everything logged so far", () => {
    expect(bodyweightAsOf(history, "2026-06-01")).toBe(88);
  });
});

describe("bodyweightTrendPoints", () => {
  it("produces sequential x values in chronological order", () => {
    const points = bodyweightTrendPoints([
      entry("2026-03-08", 89.5),
      entry("2026-03-01", 90),
    ]);
    expect(points).toEqual([
      { x: 0, y: 90 },
      { x: 1, y: 89.5 },
    ]);
  });

  it("rounds to one decimal place", () => {
    const points = bodyweightTrendPoints([entry("2026-03-01", 89.966)]);
    expect(points[0].y).toBe(90);
  });
});

describe("strengthToBodyweightRatioPoints", () => {
  it("skips sessions logged before the first weigh-in", () => {
    const workouts = [workout("2026-01-01", "bench", 100)];
    const entries = [entry("2026-02-01", 90)];
    expect(strengthToBodyweightRatioPoints(workouts, entries, "bench")).toEqual(
      [],
    );
  });

  it("divides e1RM by the carried-forward bodyweight as of that session date", () => {
    const workouts = [workout("2026-02-15", "bench", 90)];
    const entries = [entry("2026-01-01", 90)];
    // 90 / 90 = 1
    expect(strengthToBodyweightRatioPoints(workouts, entries, "bench")).toEqual(
      [{ x: 0, y: 1 }],
    );
  });

  it("ignores other lifts and unlogged/skipped sessions", () => {
    const workouts = [
      workout("2026-02-01", "bench", 100),
      workout("2026-02-01", "squat", 150),
      workout("2026-02-08", "bench", null),
    ];
    const entries = [entry("2026-01-01", 100)];
    expect(strengthToBodyweightRatioPoints(workouts, entries, "bench")).toEqual(
      [{ x: 0, y: 1 }],
    );
  });

  it("orders points chronologically by workout date, not input order", () => {
    const workouts = [
      workout("2026-03-01", "bench", 102),
      workout("2026-02-01", "bench", 100),
    ];
    const entries = [entry("2026-01-01", 100)];
    const points = strengthToBodyweightRatioPoints(workouts, entries, "bench");
    expect(points).toEqual([
      { x: 0, y: 1 }, // Feb session
      { x: 1, y: 1.02 }, // Mar session
    ]);
  });
});

describe("hasAnyRatioData", () => {
  const lifts: LiftConfig[] = [
    { id: "bench", name: "Bench", dayOfWeek: 1, order: 1, cycleIncrement: 3 },
    { id: "squat", name: "Squat", dayOfWeek: 2, order: 2, cycleIncrement: 3 },
  ];

  it("is false with no bodyweight history at all", () => {
    const workouts = [workout("2026-02-01", "bench", 100)];
    expect(hasAnyRatioData(workouts, [], lifts)).toBe(false);
  });

  it("is true once at least one lift has a computable point", () => {
    const workouts = [
      workout("2026-02-01", "bench", 100),
      workout("2026-02-01", "squat", 150),
    ];
    const entries = [entry("2026-01-01", 100)];
    expect(hasAnyRatioData(workouts, entries, lifts)).toBe(true);
  });
});
