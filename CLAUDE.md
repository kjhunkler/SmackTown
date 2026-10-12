# SmackTown — working agreements

## Delivery workflow (always)

- When a change is complete and verified, push it to `main` — don't wait to
  be asked. Develop on the working branch if one is designated, then
  fast-forward `main` to it and push both.
- Increment the version in `js/version.js` (e.g. `v127` → `v128`) with every
  shipped change. The service worker keys its cache on this string, so
  without a bump live players keep running stale code.

## Verifying changes

- Sim/game logic: the repo test suites are `node test-*.mjs` from the repo
  root — run them all before pushing.
- UI or multiplayer flows: use the `verify` skill
  (`.claude/skills/verify/SKILL.md`) — local PeerJS signaling server +
  Playwright against the preinstalled Chromium; `window.__smack()` exposes
  `{session, net, profile}` for assertions.

## Architecture notes worth knowing

- Static PWA, no build step. `js/game.js` is the deterministic,
  host-authoritative sim shared by host, client prediction, and host
  handoff — sim behavior must stay a pure function of inputs + seed, and
  gameplay changes belong there, never in the renderer.
- Builds/credits: battle and co-op expedition player builds share the 1000-CR
  `sanitizeBuild` cap. Expedition CR is score only; kits survive death.
