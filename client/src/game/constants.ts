export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // authoritative snapshots per second sent by host
export const SNAPSHOT_MS = 1000 / SNAPSHOT_RATE;

export const GRAVITY = 1450; // px/s^2
export const FAST_FALL_MULT = 2.1;
export const MAX_FALL_SPEED = 950;
export const GROUND_FRICTION = 0.84;
export const AIR_DRAG = 0.965;

export const BASE_MOVE_SPEED = 260; // px/s
export const BASE_DASH_SPEED = 460;
export const BASE_JUMP_VELOCITY = -640;
export const BASE_AIR_JUMP_VELOCITY = -560;

export const FIGHTER_RADIUS = 26;
export const STOCK_COUNT = 3;
export const MATCH_TIME_MS = 3 * 60 * 1000;

export const BLAST_ZONE = {
  left: -160,
  right: WORLD_WIDTH + 160,
  top: -220,
  bottom: WORLD_HEIGHT + 200,
};

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  solid: boolean; // solid = collide from all sides; false = one-way (land on top only)
}

export const STAGE_PLATFORMS: Platform[] = [
  { x: 80, y: 460, width: 800, height: 40, solid: true }, // main ground
  { x: 130, y: 330, width: 200, height: 18, solid: false }, // left floater
  { x: 630, y: 330, width: 200, height: 18, solid: false }, // right floater
  { x: 380, y: 220, width: 200, height: 18, solid: false }, // top center floater
];

export const SPAWN_POINTS = [
  { x: 260, y: 380 },
  { x: 700, y: 380 },
  { x: 480, y: 180 },
  { x: 480, y: 420 },
];
