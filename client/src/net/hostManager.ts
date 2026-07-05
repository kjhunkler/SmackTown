/**
 * Deterministic host election for the P2P mesh: the lowest client id among
 * currently-connected peers (self included) is always the host. Every peer
 * runs this same rule locally, so when the host drops, everyone converges on
 * the same replacement without any central authority — a seamless handoff.
 */
export class HostManager {
  private selfId: string;
  private peerIds: Set<string> = new Set();
  private _hostId: string;
  private onChange: (hostId: string, isHost: boolean) => void;

  constructor(selfId: string, onChange: (hostId: string, isHost: boolean) => void) {
    this.selfId = selfId;
    this._hostId = selfId;
    this.onChange = onChange;
  }

  get hostId(): string {
    return this._hostId;
  }

  get isHost(): boolean {
    return this._hostId === this.selfId;
  }

  setRoster(peerIds: string[]) {
    this.peerIds = new Set(peerIds);
    this.peerIds.add(this.selfId);
    this.recompute();
  }

  addPeer(clientId: string) {
    this.peerIds.add(clientId);
    this.recompute();
  }

  removePeer(clientId: string) {
    this.peerIds.delete(clientId);
    this.recompute();
  }

  private recompute() {
    let lowest = this.selfId;
    for (const id of this.peerIds) {
      if (id < lowest) lowest = id;
    }
    if (lowest !== this._hostId) {
      this._hostId = lowest;
      this.onChange(this._hostId, this.isHost);
    }
  }
}
