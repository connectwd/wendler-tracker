import { describe, it, expect } from "vitest";
import {
  stepGame,
  initGameState,
  playerX,
  type GameConfig,
  type GameState,
} from "./restGame";

// gravity: 0 by default so playerY only moves when a test explicitly wants
// it to - keeps obstacle/scoring/spawn tests free of incidental vertical
// crashes from unrelated gravity math.
const BASE: GameConfig = {
  width: 200,
  height: 200,
  gravity: 0,
  flapVelocity: -60,
  obstacleSpeed: 50,
  gapHeight: 60,
  obstacleSpacing: 100,
  playerRadius: 10,
  obstacleWidth: 20,
  maxStepSeconds: 1,
};

describe("initGameState", () => {
  it("starts the player vertically centered, no obstacles, score 0, playing", () => {
    const state = initGameState(BASE);
    expect(state).toEqual({
      playerY: 100,
      velocity: 0,
      obstacles: [],
      score: 0,
      status: "playing",
      distanceSinceSpawn: 0,
    });
  });
});

describe("stepGame - gravity and flapping", () => {
  it("accelerates the player downward over time when not flapping", () => {
    const config = { ...BASE, gravity: 100 };
    const result = stepGame(initGameState(config), 0.1, false, config);
    expect(result.velocity).toBe(10);
    expect(result.playerY).toBeCloseTo(101);
  });

  it("flapping sets velocity to flapVelocity immediately, overriding any existing velocity", () => {
    const config = { ...BASE, gravity: 100 };
    const state: GameState = { ...initGameState(config), velocity: 20 };
    const result = stepGame(state, 0.1, true, config);
    expect(result.velocity).toBe(-60);
    expect(result.playerY).toBeCloseTo(94);
  });

  it("clamps an unusually large dt (e.g. a backgrounded tab resuming) to maxStepSeconds", () => {
    const config = { ...BASE, maxStepSeconds: 0.5 };
    const result = stepGame(initGameState(config), 10, true, config);
    // Without the clamp this would be 100 - 60*10 = -500 (instant ceiling crash).
    expect(result.playerY).toBeCloseTo(70);
    expect(result.status).toBe("playing");
  });
});

describe("stepGame - crashing", () => {
  it("crashes on hitting the ground, freezing position/velocity at the pre-crash state", () => {
    const config = { ...BASE, gravity: 1000 };
    const result = stepGame(initGameState(config), 1, false, config);
    expect(result.status).toBe("crashed");
    expect(result.playerY).toBe(100);
    expect(result.velocity).toBe(0);
  });

  it("crashes on hitting the ceiling", () => {
    const state: GameState = { ...initGameState(BASE), playerY: 15 };
    const result = stepGame(state, 1, true, BASE);
    expect(result.status).toBe("crashed");
    expect(result.playerY).toBe(15);
  });

  it("further steps on a crashed state are no-ops", () => {
    const crashedState: GameState = {
      ...initGameState(BASE),
      status: "crashed",
      playerY: 77,
      score: 4,
    };
    const result = stepGame(crashedState, 5, true, BASE);
    expect(result).toBe(crashedState);
  });
});

describe("stepGame - obstacle collision", () => {
  const px = playerX(BASE); // 50

  it("does not crash when the player is within the gap", () => {
    const state: GameState = {
      ...initGameState(BASE),
      obstacles: [{ x: 45, gapY: 100, scored: true }], // gap centered on the player's own y
    };
    const result = stepGame(state, 0, false, BASE);
    expect(result.status).toBe("playing");
  });

  it("crashes when the player overlaps the obstacle outside the gap", () => {
    const state: GameState = {
      ...initGameState(BASE),
      obstacles: [{ x: 45, gapY: 0, scored: true }], // gap far from the player's y
    };
    const result = stepGame(state, 0, false, BASE);
    expect(result.status).toBe("crashed");
  });

  it("does not collide with an obstacle outside the player's x range", () => {
    const state: GameState = {
      ...initGameState(BASE),
      obstacles: [{ x: px + 100, gapY: 0, scored: true }],
    };
    const result = stepGame(state, 0, false, BASE);
    expect(result.status).toBe("playing");
  });
});

describe("stepGame - obstacle movement and spawning", () => {
  it("moves obstacles left and removes them once fully off-screen", () => {
    const state: GameState = {
      ...initGameState(BASE),
      obstacles: [{ x: 5, gapY: 100, scored: true }],
    };
    const result = stepGame(state, 1, false, BASE);
    expect(result.obstacles).toEqual([]);
  });

  it("spawns a new obstacle once distanceSinceSpawn passes obstacleSpacing, using the injected random for a deterministic gap", () => {
    const config = { ...BASE, obstacleSpacing: 40 };
    const result = stepGame(
      initGameState(config),
      1,
      false,
      config,
      () => 0.25,
    );
    expect(result.obstacles).toHaveLength(1);
    expect(result.obstacles[0]).toEqual({
      x: config.width,
      gapY: 75,
      scored: false,
    });
    expect(result.distanceSinceSpawn).toBe(10);
  });

  it("does not spawn before distanceSinceSpawn reaches obstacleSpacing", () => {
    const config = { ...BASE, obstacleSpacing: 1000 };
    const result = stepGame(initGameState(config), 1, false, config);
    expect(result.obstacles).toEqual([]);
  });
});

describe("stepGame - scoring", () => {
  it("scores exactly once when an obstacle's trailing edge crosses the player, not again on later frames", () => {
    const config = { ...BASE, obstacleWidth: 20, obstacleSpeed: 5 };
    const px = playerX(config); // 50
    let state: GameState = {
      ...initGameState(config),
      obstacles: [{ x: 32, gapY: 100, scored: false }],
    };
    expect(32 + 20).toBeGreaterThanOrEqual(px); // sanity: starts ahead of the player

    state = stepGame(state, 1, false, config); // x: 32 -> 27, trailing edge 47 < 50: crosses now
    expect(state.score).toBe(1);
    expect(state.obstacles[0].scored).toBe(true);

    state = stepGame(state, 1, false, config); // still on screen, already scored
    expect(state.score).toBe(1);
  });
});
