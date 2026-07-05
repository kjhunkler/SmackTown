# SmackTown

A mobile-first, installable PWA fighting game. Build a fighter with a shared
credit budget, brawl 2-4 players in real time over direct peer-to-peer
connections, and play entirely with swipes and taps.

## How it works

- **P2P gameplay, no game server.** Once a match starts, players connect
  directly to each other over WebRTC data channels (full mesh). A small
  Node/`ws` server (`server/`) only handles presence (who's online), lobbies/
  invites, and relaying WebRTC offer/answer/ICE signaling — it never sees
  gameplay traffic.
- **Deterministic host with seamless handoff.** Every peer independently runs
  the same match simulation from the same input stream. The peer with the
  lowest client ID is always the "host" and periodically broadcasts an
  authoritative snapshot that the others reconcile against. If the host
  disconnects, every remaining peer recomputes the same replacement instantly
  (lowest remaining id) — since everyone was already simulating the full
  match, the new host just keeps going with no stall or resync.
- **Character builder with a shared credit pool.** Every player gets the same
  100 credits (`client/src/builder/catalog.ts`) to spend across 5 stats
  (Power, Defense, Speed, Weight, Jump), up to 2 active Abilities, and up to 2
  passive Augments, plus a free color pick. There is no way to buy more power
  than anyone else — only different trade-offs.
- **Touch-first controls.** Left half of the screen: swipe to move/dash,
  swipe up to jump. Right half: tap to jab, swipe for a directional smash,
  hold to shield. Two dedicated buttons trigger your chosen abilities.

## Project layout

```
client/   Vite + TypeScript PWA (game, builder, lobby UI, WebRTC/net code)
server/   Node ws server: presence, lobbies/invites, WebRTC signaling relay
scripts/  gen-icons.js — procedurally generates the PWA app icons (no deps)
```

## Running it locally

```bash
# 1. Signaling/presence server
cd server
npm install
npm start          # ws://localhost:8787

# 2. Client (separate terminal)
cd client
npm install
npm run dev         # http://localhost:5173
```

Open the dev URL on two devices/tabs on the same network (or two browser
profiles) to test matchmaking and a live match. The client auto-connects to
`ws://<hostname>:8787`; set `VITE_SIGNALING_URL` (see `client/.env.example`)
to point at a deployed signaling server instead.

## Building for production

```bash
cd client
npm run build        # outputs client/dist — a fully static, installable PWA
```

Deploy `client/dist` to any static host (Netlify, Vercel, GitHub Pages, etc.).
Deploy `server/` anywhere that supports a persistent Node process and
WebSockets (Render, Fly.io, a small VPS, ...) — it cannot run as a
short-lived serverless function since it holds open connections.

## Notes / limitations

- WebRTC connectivity uses public STUN servers only (no TURN), so peers
  behind very restrictive/symmetric NATs may fail to connect directly. Fine
  for typical home/mobile networks; add a TURN server in
  `client/src/net/webrtcManager.ts` for broader coverage.
- Identity is a locally-stored username + random client ID — there's no
  password/account system, matching the game's "pick a name and play" scope.
