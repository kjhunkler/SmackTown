const IDENTITY_KEY = 'smacktown:identity';
const BUILD_KEY = 'smacktown:build';

export interface StoredIdentity {
  clientId: string;
  username: string;
}

export function generateClientId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function loadIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.clientId === 'string' && typeof parsed.username === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: StoredIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function loadBuildRaw(): unknown | null {
  try {
    const raw = localStorage.getItem(BUILD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBuildRaw(build: unknown) {
  localStorage.setItem(BUILD_KEY, JSON.stringify(build));
}
