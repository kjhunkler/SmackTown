// Lobby voice chat: an opt-in mic channel carried over the existing PeerJS
// mesh as direct P2P media calls (audio never relays through the host).
// Protocol: toggling voice on broadcasts a roster flag; the *joiner* dials
// every member already flagged in-channel, and members in the channel answer
// any incoming call from a room member. If two joiners dial each other at
// once, the dial from the smaller peer ID survives on both sides.

const CALL_TIMEOUT = 8000;   // ms to wait on an unanswered dial before giving up

export class VoiceChat {
  constructor(net) {
    this.net = net;
    this.active = false;
    this.muted = false;
    this.mic = null;                 // local MediaStream
    this.calls = new Map();          // peerId -> MediaConnection
    this.audios = new Map();         // peerId -> hidden <audio> playing them
    this.onChange = null;            // UI refresh hook
    this._bound = false;             // peer 'call' listener attached once
    this._box = document.createElement('div');
    this._box.style.display = 'none';
    document.body.appendChild(this._box);
  }

  supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    if (this.active || !this.supported()) return this.active;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (_) {
      return false;                  // permission denied or no mic
    }
    this.active = true;
    this.muted = false;
    this._bindPeer();
    this.net.setVoice(true);
    for (const m of this.net.members.values()) {
      if (m.peerId !== this.net.myId && m.voice) this._dial(m.peerId);
    }
    this.onChange?.();
    return true;
  }

  stop() {
    if (!this.active && !this.mic) return;
    this.active = false;
    for (const pid of [...this.calls.keys()]) this._drop(pid);
    this.mic?.getTracks().forEach(t => t.stop());
    this.mic = null;
    this.muted = false;
    if (!this.net.closed) this.net.setVoice(false);
    this.onChange?.();
  }

  destroy() {
    this.stop();
    this._box.remove();
  }

  setMuted(m) {
    this.muted = !!m;
    this.mic?.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    this.onChange?.();
  }

  // A member toggled their channel flag: dial joiners, hang up on leavers.
  onPeerVoice(pid, on) {
    if (!on) { this._drop(pid); return; }
    if (this.active && pid !== this.net.myId && !this.calls.has(pid)) this._dial(pid);
  }

  // Roster changed: hang up calls to members who left the room entirely.
  prune() {
    for (const pid of [...this.calls.keys()]) {
      const m = this.net.members.get(pid);
      if (!m || m.status === 'gone') this._drop(pid);
    }
  }

  _bindPeer() {
    if (this._bound || !this.net.peer) return;
    this._bound = true;
    this.net.peer.on('call', call => {
      // only answer room members, and only while we're in the channel
      if (!this.active || !this.mic || !this.net.members.has(call.peer)) {
        try { call.close(); } catch (_) {}
        return;
      }
      const cur = this.calls.get(call.peer);
      if (cur && call.peer > this.net.myId) {
        // glare: we both dialed at once — the smaller peer ID's dial wins,
        // which is ours here, so reject theirs and keep waiting on ours
        try { call.close(); } catch (_) {}
        return;
      }
      if (cur) { this.calls.delete(call.peer); try { cur.close(); } catch (_) {} }
      this._adopt(call.peer, call);
      call.answer(this.mic);
    });
  }

  _dial(pid) {
    if (this.calls.has(pid) || !this.net.peer || !this.mic) return;
    const call = this.net.peer.call(pid, this.mic);
    if (!call) return;
    this._adopt(pid, call);
    setTimeout(() => {                       // unanswered: give up quietly
      if (this.calls.get(pid) === call && !this.audios.has(pid)) this._drop(pid);
    }, CALL_TIMEOUT);
  }

  _adopt(pid, call) {
    this.calls.set(pid, call);
    call.on('stream', stream => {
      if (this.calls.get(pid) !== call) return;
      let el = this.audios.get(pid);
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        this._box.appendChild(el);
        this.audios.set(pid, el);
      }
      el.srcObject = stream;
      el.play?.().catch(() => {});
    });
    const bye = () => { if (this.calls.get(pid) === call) this._drop(pid); };
    call.on('close', bye);
    call.on('error', bye);
  }

  _drop(pid) {
    const call = this.calls.get(pid);
    this.calls.delete(pid);
    try { call?.close(); } catch (_) {}
    const el = this.audios.get(pid);
    this.audios.delete(pid);
    if (el) { el.srcObject = null; el.remove(); }
  }
}
