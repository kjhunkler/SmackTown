import { defaultBuild, isValidBuild, type FighterBuild } from '@/builder/catalog';
import { loadBuildRaw, loadIdentity, saveBuildRaw, saveIdentity, type StoredIdentity } from './storage';
import { SignalingClient, signalingUrl } from '@/net/signalingClient';

class AppState {
  identity: StoredIdentity | null = loadIdentity();
  build: FighterBuild;
  signaling: SignalingClient | null = null;

  constructor() {
    const raw = loadBuildRaw();
    this.build = raw && isValidBuild(raw as FighterBuild) ? (raw as FighterBuild) : defaultBuild();
  }

  setIdentity(identity: StoredIdentity) {
    this.identity = identity;
    saveIdentity(identity);
  }

  setBuild(build: FighterBuild) {
    this.build = build;
    saveBuildRaw(build);
  }

  ensureSignaling(): SignalingClient {
    if (!this.signaling) {
      this.signaling = new SignalingClient(signalingUrl());
    }
    return this.signaling;
  }
}

export const appState = new AppState();
