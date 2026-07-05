import type { SignalingClient } from './signalingClient';
import type { NetMessage } from './protocol';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerLink {
  clientId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  connected: boolean;
}

export type PeerEvent =
  | { type: 'peer-connected'; clientId: string }
  | { type: 'peer-disconnected'; clientId: string }
  | { type: 'message'; clientId: string; message: NetMessage };

type PeerListener = (ev: PeerEvent) => void;

/**
 * Manages a full-mesh set of WebRTC data-channel connections to every other
 * player in the current match, negotiated through the signaling server.
 */
export class WebRTCManager {
  private links: Map<string, PeerLink> = new Map();
  private listeners: PeerListener[] = [];
  private selfId: string;
  private signaling: SignalingClient;
  private unsubscribeSignal: () => void;

  constructor(selfId: string, signaling: SignalingClient) {
    this.selfId = selfId;
    this.signaling = signaling;
    this.unsubscribeSignal = signaling.on('signal', (msg: { from: string; data: any }) => {
      this.handleSignal(msg.from, msg.data);
    });
  }

  on(cb: PeerListener) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(ev: PeerEvent) {
    for (const cb of this.listeners) cb(ev);
  }

  connectedPeerIds(): string[] {
    return [...this.links.values()].filter((l) => l.connected).map((l) => l.clientId);
  }

  /** Connects to every peer in the roster. The lexicographically-lower id initiates the offer to avoid glare. */
  connectToPeers(peerIds: string[]) {
    for (const peerId of peerIds) {
      if (peerId === this.selfId || this.links.has(peerId)) continue;
      const iAmInitiator = this.selfId < peerId;
      this.createLink(peerId, iAmInitiator);
    }
  }

  private createLink(peerId: string, initiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: PeerLink = { clientId: peerId, pc, channel: null, connected: false };
    this.links.set(peerId, link);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.send({ t: 'signal', to: peerId, data: { kind: 'ice', candidate: ev.candidate.toJSON() } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        this.dropLink(peerId);
      }
    };

    if (initiator) {
      const channel = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
      this.wireChannel(peerId, link, channel);
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.signaling.send({ t: 'signal', to: peerId, data: { kind: 'offer', sdp: pc.localDescription } });
      };
    } else {
      pc.ondatachannel = (ev) => {
        this.wireChannel(peerId, link, ev.channel);
      };
    }
  }

  private wireChannel(peerId: string, link: PeerLink, channel: RTCDataChannel) {
    link.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      link.connected = true;
      this.emit({ type: 'peer-connected', clientId: peerId });
    };
    channel.onclose = () => this.dropLink(peerId);
    channel.onerror = () => this.dropLink(peerId);
    channel.onmessage = (ev) => {
      try {
        const message = JSON.parse(ev.data) as NetMessage;
        this.emit({ type: 'message', clientId: peerId, message });
      } catch {
        // ignore malformed payloads
      }
    };
  }

  private dropLink(peerId: string) {
    const link = this.links.get(peerId);
    if (!link) return;
    const wasConnected = link.connected;
    try {
      link.channel?.close();
      link.pc.close();
    } catch {
      // already closed
    }
    this.links.delete(peerId);
    if (wasConnected) this.emit({ type: 'peer-disconnected', clientId: peerId });
  }

  private async handleSignal(from: string, data: any) {
    let link = this.links.get(from);
    if (!link) {
      // Remote initiated — we didn't have a link yet (e.g. race at match start).
      this.createLink(from, false);
      link = this.links.get(from)!;
    }
    const pc = link.pc;
    if (data.kind === 'offer') {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.send({ t: 'signal', to: from, data: { kind: 'answer', sdp: pc.localDescription } });
    } else if (data.kind === 'answer') {
      await pc.setRemoteDescription(data.sdp);
    } else if (data.kind === 'ice') {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        // benign if candidate arrives before remote description
      }
    }
  }

  broadcast(message: NetMessage) {
    const payload = JSON.stringify(message);
    for (const link of this.links.values()) {
      if (link.connected && link.channel && link.channel.readyState === 'open') {
        link.channel.send(payload);
      }
    }
  }

  sendTo(peerId: string, message: NetMessage) {
    const link = this.links.get(peerId);
    if (link?.connected && link.channel?.readyState === 'open') {
      link.channel.send(JSON.stringify(message));
    }
  }

  destroy() {
    this.unsubscribeSignal();
    for (const peerId of [...this.links.keys()]) this.dropLink(peerId);
  }
}
