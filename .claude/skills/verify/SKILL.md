---
name: verify
description: Build/launch/drive recipe for verifying SmackTown multiplayer flows end-to-end in a sandboxed environment.
---

# Verifying SmackTown

Static PWA, no build step. Multiplayer signals through the public PeerJS
cloud (`0.peerjs.com`), which sandboxed environments usually block — run a
local signaling server and shim the client instead.

## Launch

```bash
npm i -g peer                                   # once
node -e "require('peer').PeerServer({port:9000,host:'127.0.0.1',path:'/'})" &
http-server -p 8080 -s &                        # serve the repo root
```

Note: bind the peer server to `127.0.0.1` explicitly — the `peerjs` CLI
binds `::` and dies with EAFNOSUPPORT in IPv6-less containers.

## Drive (Playwright, preinstalled Chromium)

- One browser, one **context per player** (isolated localStorage + peer).
- Route `**/vendor/peerjs.min.js` and append a shim that wraps
  `window.Peer` to force `{host:'127.0.0.1', port:9000, path:'/',
  secure:false, config:{iceServers:[]}}`. Empty iceServers is fine —
  same-machine WebRTC uses host candidates.
- Route `**/sw.js` to an empty body so the service worker can't serve
  stale files between runs.
- Skip login by seeding `localStorage['smacktown.profile.v1']` (see
  js/profile.js for the shape) and `smacktown.helped=1` in addInitScript.
- `window.__smack()` exposes `{session, net, profile, presence}` for
  state assertions (e.g. host-side fighter list, presence roster).

## Flows worth driving

- Host + join by code (menu Join/Host button; blank code hosts).
- Presence invite from the online list (needs ~5–30 s for the town hub
  roster to converge; be generous with timeouts).
- Ready-up auto-start countdown; mid-game join by code (HUD tile count).
- Lobby in landscape: context viewport 844×390.

Gotcha: bump the `sw.js` cache version whenever shipping asset changes.
