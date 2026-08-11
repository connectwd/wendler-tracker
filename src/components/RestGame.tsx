import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_GAME_CONFIG,
  initGameState,
  playerX,
  stepGame,
  type GameState,
} from "../lib/restGame";

interface RestGameProps {
  highScore: number;
  onNewHighScore: (score: number) => void;
}

/** Reads a CSS custom property from the document so the canvas re-skins itself for Serious vs Arcade mode without any game-specific theme code. */
function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function RestGame({ highScore, onNewHighScore }: RestGameProps) {
  const config = DEFAULT_GAME_CONFIG;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initGameState(config));
  const pendingFlapRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const bestRef = useRef(highScore);
  const [display, setDisplay] = useState<GameState>(stateRef.current);

  function flap() {
    if (stateRef.current.status === "crashed") {
      stateRef.current = initGameState(config);
      setDisplay(stateRef.current);
      return;
    }
    pendingFlapRef.current = true;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        flap();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function tick(time: number) {
      const last = lastTimeRef.current ?? time;
      const dtSeconds = (time - last) / 1000;
      lastTimeRef.current = time;

      const wasPlaying = stateRef.current.status === "playing";
      if (wasPlaying) {
        stateRef.current = stepGame(
          stateRef.current,
          dtSeconds,
          pendingFlapRef.current,
          config,
        );
        pendingFlapRef.current = false;
        if (
          stateRef.current.status === "crashed" &&
          stateRef.current.score > bestRef.current
        ) {
          bestRef.current = stateRef.current.score;
          onNewHighScore(stateRef.current.score);
        }
        setDisplay(stateRef.current);
      }

      draw(canvasRef.current, stateRef.current, config);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rest-game-wrap" data-testid="rest-game-wrap">
      <canvas
        ref={canvasRef}
        width={config.width}
        height={config.height}
        data-testid="rest-game-canvas"
        className="rest-game-canvas"
      />
      <button
        type="button"
        className="rest-game-input-layer"
        aria-label="Flap"
        onClick={flap}
        data-testid="rest-game-flap-btn"
      />
      <div className="rest-game-hud">
        <span data-testid="rest-game-score">Score {display.score}</span>
        <span data-testid="rest-game-best">
          Best {Math.max(display.score, bestRef.current)}
        </span>
      </div>
      {display.status === "crashed" && (
        <div className="rest-game-crashed" data-testid="rest-game-crashed">
          Tap to try again
        </div>
      )}
    </div>
  );
}

function draw(
  canvas: HTMLCanvasElement | null,
  state: GameState,
  config: typeof DEFAULT_GAME_CONFIG,
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = themeColor("--surface", "#1a1a1a");
  const player = themeColor("--plate-red", "#e33");
  const obstacle = themeColor("--plate-blue", "#36c");
  const ground = themeColor("--border", "#444");

  ctx.clearRect(0, 0, config.width, config.height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, config.width, config.height);

  ctx.fillStyle = obstacle;
  for (const o of state.obstacles) {
    const gapTop = o.gapY - config.gapHeight / 2;
    const gapBottom = o.gapY + config.gapHeight / 2;
    ctx.fillRect(o.x, 0, config.obstacleWidth, Math.max(gapTop, 0));
    ctx.fillRect(
      o.x,
      gapBottom,
      config.obstacleWidth,
      Math.max(config.height - gapBottom, 0),
    );
  }

  ctx.strokeStyle = ground;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, config.height - 1);
  ctx.lineTo(config.width, config.height - 1);
  ctx.stroke();

  ctx.fillStyle = player;
  ctx.beginPath();
  ctx.arc(playerX(config), state.playerY, config.playerRadius, 0, Math.PI * 2);
  ctx.fill();
}
