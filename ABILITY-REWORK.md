# Ability and trait rework

The Workshop uses a refundable 1,000 CR loadout in both battle and expedition. Buy a base ability first, then spend extra CR to specialize that same action slot. Equip one version per family. Switching versions credits the previous premium. Each of the four Traits gets a specialization at level 2.

## Checkpoints on main

- [x] Map the existing Workshop, profile validation, host simulation, renderer and test entry points.
- [x] v231 adds 18 ability upgrades across 16 families and four level-2 trait specializations. All five base buffs are in the simulation. `test-specializations.mjs` covers prices, prerequisites, duplicate families, floor/platform bounces and all upgraded casts. The full Node suite passes.
- [x] v232 adds Workshop purchases, same-slot swaps, full refunds, trait prerequisites, named build summaries and HUD buttons. Two Chromium players confirmed purchases, saved-character reload, the remote lobby roster, Cinderskip replication and the live recall button. Planted beacons also survive host handoff.
- [x] v233 refreshes all 16 base casts and all 18 upgraded casts. Directional flames, hook chains, snapping traps, shield facets and recall trails use host events and projectile data.
- [x] All 29 root Node suites passed. Chromium rendered every cast and verified two-player PvP, a guest editing and casting in a live expedition, three-player host handoff, portrait and landscape Workshop layouts, offline Practice, and an offline expedition retune.

## Design decisions

- Fireball costs 220 CR. Cinderskip adds 100 CR for up to three reversing bounces and a 3.2s lifetime. Sunburst adds 120 CR for a larger shot, wider explosion and two extra burn ticks.
- Spring Trap and Spike Trap last 8s and catch targets in a wider radius. The spring launches harder, and the spikes hit harder. Their cooldowns are 4.8s and 5s.
- Grapple Hook travels faster, hits harder and recovers in 3.8s. Grapples reel in expedition enemies as well as opposing fighters. Second Wind allows a recall for up to 5s and protects the return for 0.65s. Bubble Shield protects for 1.8s on a 5.5s cooldown.
- At trait level 2, Power offers Haymaker (+14% knockback), Speed offers Sprinter (+12% run speed), Defense offers Stone Guard (12% less incoming damage), and Agility offers Air Step (+1 midair jump).
- Traits means Power, Speed, Defense and Agility in this game's Workshop. The Augments tab is separate.
- Keep the current save keys, two ability buttons, finite cooldowns and player budget. Old builds should play immediately. Keep cast logic in the deterministic simulation and animation in the renderer.

## Resuming

All planned checkpoints are complete. The plan was committed at `12d855d`, combat at `c15ff96`, and the Workshop at `d7c8765`. Look up the v233 checkpoint with `git log --oneline -- js/version.js`.

For future balance tuning, find prices and descriptions in `js/profile.js`, combat in `js/game.js`, Workshop and HUD in `js/ui.js`, and canvas effects in `js/ability-art.js` and `js/render.js`. Run `node test-specializations.mjs` for upgrade coverage and each root `test-*.mjs` for the full suite. Browser verification follows `.claude/skills/verify/SKILL.md`.
