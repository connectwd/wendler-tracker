/**
 * "Bar Hop" - the single-input game shown during a rest timer. A weight
 * plate flies through gaps between scrolling barbell obstacles. Tap/click/
 * space to flap upward; gravity pulls it back down the rest of the time.
 *
 * This module is the deterministic simulation step only - no canvas, no
 * DOM, no timers, so it can be unit tested directly. `RestGame.tsx` drives
 * it from a requestAnimationFrame loop and draws the result.
 */

export interface Obstacle {
  /** Left edge of the obstacle pair, in game-space px. Moves toward 0 over time. */
  x: number;
  /** Vertical center of the gap the player needs to fly through. */
  gapY: number;
  /** Whether the player has already flown past this one (scored once, not re-scored on later frames). */
  scored: boolean;
}

export type GameStatus = 'playing' | 'crashed';

export interface GameState {
  playerY: number;
  velocity: number;
  obstacles: Obstacle[];
  score: number;
  status: GameStatus;
  distanceSinceSpawn: number;
}

export interface GameConfig {
  width: number;
  height: number;
  gravity: number; // px/s^2
  flapVelocity: number; // px/s, negative = upward
  obstacleSpeed: number; // px/s
  gapHeight: number;
  obstacleSpacing: number; // horizontal px between obstacle spawns
  playerRadius: number;
  obstacleWidth: number;
  /** Hard cap on a single step's dt - a backgrounded tab resuming after minutes away would otherwise teleport the player straight through a wall. */
  maxStepSeconds: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  width: 300,
  height: 300,
  gravity: 900,
  flapVelocity: -260,
  obstacleSpeed: 130,
  gapHeight: 100,
  obstacleSpacing: 170,
  playerRadius: 10,
  obstacleWidth: 34,
  maxStepSeconds: 0.1,
};

export function initGameState(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  return {
    playerY: config.height / 2,
    velocity: 0,
    obstacles: [],
    score: 0,
    status: 'playing',
    distanceSinceSpawn: 0,
  };
}

/** The player's fixed horizontal position - obstacles move, the player only moves vertically. */
export function playerX(config: GameConfig): number {
  return config.width * 0.25;
}

/**
 * Advances the simulation by `dtSeconds`. `flap` is whether the single
 * input fired since the last step. `random` is injectable so tests (and
 * only tests) can make gap placement deterministic; the real game leaves
 * it as `Math.random`.
 *
 * Once `status` is `'crashed'`, further calls are no-ops until the caller
 * makes a fresh `initGameState()` - this function never resets itself.
 */
export function stepGame(
  state: GameState,
  dtSeconds: number,
  flap: boolean,
  config: GameConfig = DEFAULT_GAME_CONFIG,
  random: () => number = Math.random
): GameState {
  if (state.status === 'crashed') return state;

  const dt = Math.min(Math.max(dtSeconds, 0), config.maxStepSeconds);

  const velocity = flap ? config.flapVelocity : state.velocity + config.gravity * dt;
  const playerY = state.playerY + velocity * dt;

  let obstacles = state.obstacles
    .map((o) => ({ ...o, x: o.x - config.obstacleSpeed * dt }))
    .filter((o) => o.x + config.obstacleWidth > 0);

  let distanceSinceSpawn = state.distanceSinceSpawn + config.obstacleSpeed * dt;
  if (distanceSinceSpawn >= config.obstacleSpacing) {
    distanceSinceSpawn -= config.obstacleSpacing;
    const margin = config.gapHeight / 2 + 20;
    const span = Math.max(config.height - margin * 2, 0);
    const gapY = margin + random() * span;
    obstacles = [...obstacles, { x: config.width, gapY, scored: false }];
  }

  const px = playerX(config);
  let score = state.score;
  obstacles = obstacles.map((o) => {
    if (!o.scored && o.x + config.obstacleWidth < px) {
      score += 1;
      return { ...o, scored: true };
    }
    return o;
  });

  const hitGround = playerY + config.playerRadius >= config.height;
  const hitCeiling = playerY - config.playerRadius <= 0;
  const hitObstacle = obstacles.some((o) => {
    const withinX = px + config.playerRadius > o.x && px - config.playerRadius < o.x + config.obstacleWidth;
    if (!withinX) return false;
    const gapTop = o.gapY - config.gapHeight / 2;
    const gapBottom = o.gapY + config.gapHeight / 2;
    return playerY - config.playerRadius < gapTop || playerY + config.playerRadius > gapBottom;
  });

  const crashed = hitGround || hitCeiling || hitObstacle;

  return {
    playerY: crashed ? state.playerY : playerY,
    velocity: crashed ? 0 : velocity,
    obstacles,
    score,
    status: crashed ? 'crashed' : 'playing',
    distanceSinceSpawn,
  };
}
