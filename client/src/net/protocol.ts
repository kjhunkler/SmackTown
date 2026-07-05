// Shared message shapes for the signaling/presence server (server/index.js) and
// for the peer-to-peer WebRTC data channel protocol used during matches.

import type { FighterBuild } from '@/builder/catalog';

export interface PresenceUser {
  clientId: string;
  username: string;
  status: 'online' | 'in-room';
}

export interface RoomMember {
  clientId: string;
  username: string;
  ready: boolean;
  build: FighterBuild | null;
}

export interface RoomState {
  roomId: string;
  code: string;
  members: RoomMember[];
}

// ---- Client -> Server ----
export type ClientToServer =
  | { t: 'register'; clientId: string; username: string }
  | { t: 'presence:subscribe' }
  | { t: 'room:create' }
  | { t: 'room:join'; code: string }
  | { t: 'room:leave' }
  | { t: 'room:invite'; targetClientId: string }
  | { t: 'room:ready'; ready: boolean; build: FighterBuild }
  | { t: 'signal'; to: string; data: unknown };

// ---- Server -> Client ----
export type ServerToClient =
  | { t: 'registered'; clientId: string }
  | { t: 'presence:update'; users: PresenceUser[] }
  | { t: 'room:update'; room: RoomState }
  | { t: 'room:invited'; fromClientId: string; fromUsername: string; code: string }
  | { t: 'room:error'; message: string }
  | { t: 'room:closed' }
  | {
      t: 'match:start';
      roomId: string;
      players: { clientId: string; username: string; build: FighterBuild }[];
      startAt: number;
    }
  | { t: 'signal'; from: string; data: unknown };

// ---- WebRTC data channel messages (peer <-> peer, during a match) ----
export interface InputFrame {
  moveX: number; // -1..1
  jump: boolean;
  fastFall: boolean;
  shield: boolean;
  attack: 'none' | 'jab' | 'smash-up' | 'smash-side' | 'smash-down';
  ability: 0 | 1 | 2; // 0 = none, 1/2 = ability slot
  seq: number;
}

export interface EntitySnapshot {
  clientId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  damagePercent: number;
  stocks: number;
  state: string;
  hitstunUntil: number;
}

export type NetMessage =
  | { t: 'input'; frame: InputFrame }
  | { t: 'state'; hostId: string; entities: EntitySnapshot[] };

export interface HitEffect {
  x: number;
  y: number;
  kind: 'hit' | 'ko' | 'block';
}
