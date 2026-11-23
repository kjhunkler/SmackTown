# SmackTown 🥊

A pocket-sized, Smash-style 2D platform fighter that runs as an installable
PWA and connects phones **directly to each other** over WebRTC — no game
server. One player hosts a room, everyone else joins with a 4-letter code,
and if the host bails mid-fight the game hands off to the next player
without dropping the match.

## Play it

Serve the repo root over HTTPS (any static host works — GitHub Pages,
Netlify, `npx serve`…) and open it on your phone:

```sh
npx serve .          # or: python3 -m http.server 8000
```

> WebRTC + PWA features need a **secure context**: `https://` or `http://localhost`.

Add it to your home screen when the browser offers — it installs as a
fullscreen landscape app and keeps working offline (practice mode; multiplayer
naturally needs a connection).

The original theme moves from electric keys in the menus to deep kicks and a
reed lead in battle. [Listen to “Sugar on the Wire”](music/sugar-on-the-wire.mp3).

## How it works

| Piece | Where | What it does |
|---|---|---|
| Profile & credits | `js/profile.js` | Players allocate **1000 CR** across traits, up to two active abilities and up to five passive augments. Weapons are free. The host validates the full price of each equipped ability and trait specialization. |
| Fighter workshop | `js/ui.js` | Buy an ability, then choose a named upgrade in the same slot. Swapping credits the previous upgrade. Selling refunds the full equipped price. Power, Speed, Defense and Agility each unlock a specialization at level 2. |
| Weapons | `js/game.js` | The strong attack is the equipped weapon — all weapons are free, the pick is pure style. **Bare fists** keep the classic smash kit; the **sword** lunge-slashes in any aim direction — huge damage, light launch, and a much faster charge; **magic** casts knockback bursts whose range/power scale hard with charge time, fueled by a self-recharging mana pool; the **spear** thrusts at long range with a dead zone up close; the **boomerang** throws a returning blade (one in the air at a time — catch it to re-arm early); the **shield** rams with a hard lunge that blasts foes out of their spot — the wielder stops right in it, a position switch rather than a pass-through or rebound — and blunts damage while its charge is held. In expeditions, the blasted victim can slam into creeps during the rest of their flight; in PvP, impacted players no longer become a live hitbox. Neutral strong attacks don't exist — a neutral swipe is the side strike the way you face. |
| P2P + presence + handoff | `js/net.js` | PeerJS full-mesh rooms. Presence heartbeats every 2s drive the lobby's online/away/gone dots and ping readouts. The host is just the *authority role*: if it disconnects, the remaining player with the lowest join order claims hosthood (term-numbered claims resolve races), resumes the sim from the last snapshot, and re-registers the room code so new players can still join. |
| Simulation | `js/game.js` | 60 Hz host-authoritative sim. Percent-based damage → growing knockback, 3 stocks, blast zones, drop-through platforms, hitpause, respawn invulnerability, and a practice bot. |
| Touch controls | `js/input.js` | Left thumb: drag to move, flick up to jump, flick down to fast-fall/drop. Right thumb: tap = jab, swipe = strong (weapon) attack in that direction, hold to charge it. Two ability buttons with cooldown rings. Keyboard fallback for desktop (arrows/WASD + J/K/L). |
| Netcode | `js/main.js` | Clients send inputs (~30 Hz), host broadcasts snapshots (20 Hz), clients render 130 ms behind with interpolation. |
| Rendering | `js/render.js` | Canvas renderer with a Smash-style auto-framing camera, squash & stretch, particles and screen shake. |
| PWA | `sw.js`, `manifest.webmanifest` | Full precache, cache-first with background refresh, installable fullscreen landscape app. |

## PvP bots and teams

In a room’s Roster tab, the host can add up to six bots to a free-for-all or
switch Battle mode to Teams. New fighters join the smaller side. Tap a Red
or Blue button to move that fighter before the match. Bots are always ready,
so one person can start a room match with bot opponents or teammates.

In Teams, each fighter keeps their own stocks. Teammates and their summons
are immune to friendly fire. The last team with fighters standing wins.

## Signaling

Room discovery uses the free PeerJS cloud broker for the initial WebRTC
handshake only — all gameplay traffic is peer-to-peer data channels. To use
your own broker, run [peerjs-server](https://github.com/peers/peerjs-server)
and pass its host/port where `new Peer(...)` is created in `js/net.js`.

## Co-op expeditions

**Last Train** starts in Lantern Market. Stay to fight endless waves, or run
against an exit and gather the crew at the flashing arrow. Surviving enemies
follow you. Every sixth wave can bring a boss that locks travel until defeated.
At Undertow Works, jump above the water when the pressure rises.

Head right from the market through the alley, rooftops, parking lot, cistern,
factory and laboratory. Cross the Freight Line to reach Last Train. At its open
doors, hold down together for one second to extract. The right edge leads back
to Lantern Market. Reaching Last Train opens the market’s left exit for the
rest of the run. Sleeping teammates travel with the crew and late joiners
arrive beside a teammate in the current district.

Select a saved fighter on the menu and enter Expedition with that build.
The same **1000-CR cap** as battle applies to hosts, joining players, and
workshop swaps. All gear is available immediately; there are no loot boxes
or gradual gear unlocks. Defeated fighters keep their kit when revived.
CR earned from enemies tracks run performance and does not expand the build
budget. The expedition workshop can switch to any saved build within the cap.
