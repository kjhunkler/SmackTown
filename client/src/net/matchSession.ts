import { MatchEngine, type MatchResult } from '@/game/engine';
import { Renderer } from '@/game/renderer';
import { TouchControls } from '@/game/input/touchControls';
import { WebRTCManager } from './webrtcManager';
import { HostManager } from './hostManager';
import { SNAPSHOT_MS } from '@/game/constants';
import type { EntitySnapshot, NetMessage } from './protocol';
import type { FighterBuild } from '@/builder/catalog';

export interface MatchSessionOptions {
  selfId: string;
  players: { clientId: string; username: string; build: FighterBuild }[];
  webrtc: WebRTCManager;
  canvas: HTMLCanvasElement;
  touchRoot: HTMLElement;
  abilityButtons: { el: HTMLElement; slot: 1 | 2 }[];
  startTime: number;
  onMatchEnd: (results: MatchResult[]) => void;
  onHostChanged?: (hostId: string, isHost: boolean) => void;
}

const REMOTE_LERP = 0.4;
const LOCAL_CORRECTION_THRESHOLD = 60;

export class MatchSession {
  private engine: MatchEngine;
  private renderer: Renderer;
  private touch: TouchControls;
  private webrtc: WebRTCManager;
  private host: HostManager;
  private selfId: string;
  private rafId = 0;
  private lastFrameTime = 0;
  private lastSnapshotSentAt = 0;
  private remoteTargets: Map<string, EntitySnapshot> = new Map();
  private abilityButtons: { el: HTMLElement; slot: 1 | 2 }[];
  private ended = false;
  private unsubscribeWebrtc: () => void;
  private onMatchEnd: (results: MatchResult[]) => void;
  private resizeHandler = () => this.renderer.resize();

  constructor(opts: MatchSessionOptions) {
    this.selfId = opts.selfId;
    this.engine = new MatchEngine(opts.players, opts.startTime);
    this.renderer = new Renderer(opts.canvas);
    this.renderer.resize();
    this.touch = new TouchControls(opts.touchRoot);
    this.abilityButtons = opts.abilityButtons;
    for (const btn of this.abilityButtons) this.touch.registerAbilityButton(btn.el, btn.slot);
    this.webrtc = opts.webrtc;
    this.onMatchEnd = opts.onMatchEnd;

    this.host = new HostManager(opts.selfId, (hostId, isHost) => {
      opts.onHostChanged?.(hostId, isHost);
    });
    this.host.setRoster(opts.players.map((p) => p.clientId).filter((id) => id !== opts.selfId));

    this.unsubscribeWebrtc = this.webrtc.on((ev) => {
      if (ev.type === 'peer-connected') this.host.addPeer(ev.clientId);
      else if (ev.type === 'peer-disconnected') this.host.removePeer(ev.clientId);
      else if (ev.type === 'message') this.handleMessage(ev.clientId, ev.message);
    });

    window.addEventListener('resize', this.resizeHandler);
  }

  start() {
    this.lastFrameTime = Date.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  // Engine timing runs on Date.now() (epoch ms) rather than the rAF/performance.now()
  // timestamp, because match start times are negotiated as epoch ms via the signaling
  // server — mixing time bases here would leave the match stuck in "countdown" forever.
  private loop = () => {
    const now = Date.now();
    const dtSec = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    const frame = this.touch.poll();
    this.engine.applyInput(this.selfId, frame);
    this.webrtc.broadcast({ t: 'input', frame });

    this.engine.tick(dtSec, now);
    this.renderer.pushEffects(this.engine.effects, now);

    for (const [clientId, target] of this.remoteTargets) {
      if (clientId === this.selfId) continue;
      const f = this.engine.fighters.get(clientId);
      if (!f) continue;
      f.x += (target.x - f.x) * REMOTE_LERP;
      f.y += (target.y - f.y) * REMOTE_LERP;
    }

    const fighters = [...this.engine.fighters.values()];
    this.renderer.draw(fighters, this.engine.projectiles, now, this.engine.timeRemainingMs(now), this.selfId);
    this.updateAbilityButtons(now);

    if (this.host.isHost && now - this.lastSnapshotSentAt > SNAPSHOT_MS) {
      this.lastSnapshotSentAt = now;
      const entities = this.engine.snapshot();
      this.webrtc.broadcast({ t: 'state', hostId: this.host.hostId, entities });
    }

    if (this.engine.phase === 'ended' && !this.ended) {
      this.ended = true;
      this.onMatchEnd(this.engine.results ?? []);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateAbilityButtons(now: number) {
    const self = this.engine.fighters.get(this.selfId);
    if (!self) return;
    for (const btn of this.abilityButtons) {
      const slot = self.abilitySlots[btn.slot - 1];
      const ready = !slot || now >= slot.cooldownUntil;
      btn.el.style.opacity = ready ? '1' : '0.4';
      btn.el.style.filter = ready ? '' : 'grayscale(1)';
    }
  }

  private handleMessage(fromId: string, message: NetMessage) {
    if (message.t === 'input') {
      this.engine.applyInput(fromId, message.frame);
    } else if (message.t === 'state') {
      // Only trust snapshots from whoever we currently believe is host.
      if (message.hostId !== this.host.hostId && fromId !== this.host.hostId) return;
      for (const entity of message.entities) {
        if (entity.clientId === this.selfId) {
          const f = this.engine.fighters.get(this.selfId);
          if (!f) continue;
          const drift = Math.hypot(entity.x - f.x, entity.y - f.y);
          if (drift > LOCAL_CORRECTION_THRESHOLD) {
            f.x = entity.x;
            f.y = entity.y;
          }
          f.damagePercent = entity.damagePercent;
          f.stocks = entity.stocks;
          f.hitstunUntil = entity.hitstunUntil;
        } else {
          this.remoteTargets.set(entity.clientId, entity);
          const f = this.engine.fighters.get(entity.clientId);
          if (f) {
            f.damagePercent = entity.damagePercent;
            f.stocks = entity.stocks;
            f.state = entity.state as typeof f.state;
            f.hitstunUntil = entity.hitstunUntil;
            f.facing = entity.facing;
          }
        }
      }
    }
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.touch.destroy();
    this.unsubscribeWebrtc();
    window.removeEventListener('resize', this.resizeHandler);
  }
}
