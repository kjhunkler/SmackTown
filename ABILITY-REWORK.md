# Ability and trait rework

The Workshop uses a refundable 1,000 CR loadout in both battle and expedition. Buy a base ability first, then spend extra CR to specialize that same action slot. Equip one version per family. Switching versions credits the previous premium. Each of the four Traits gets a specialization at level 2.

## Checkpoints on main

- [x] Map the existing Workshop, profile validation, host simulation, renderer and test entry points.
- [ ] Ship the catalog and budget validation, all combat variants, the five base buffs, and trait effects. Test legacy builds, family limits, combat and credits.
- [ ] Ship Workshop purchases and refunds, named loadout summaries, accessible controls and accurate in-match buttons.
- [ ] Ship cast animations for all 16 base abilities and distinct upgraded effects. Verify projectile effects on remote clients and in expedition.
- [ ] Run the full Node suite and exercise the Workshop and multiplayer game in Chromium. Record results and release version here.

## Design decisions

- Fireball gets a bouncing shot and a larger explosion as alternative purchases. Use bounded floor/platform bounces and keep the caster's allies safe.
- Spring Trap, Grapple Hook, Spike Trap, Second Wind and Bubble Shield receive upgrades **and** stronger base kits.
- Traits means Power, Speed, Defense and Agility in this game's Workshop. The Augments tab is separate.
- Keep the current save keys, two ability buttons, finite cooldowns and player budget. Old builds should play immediately. Keep cast logic in the deterministic simulation and animation in the renderer.

## Resuming

Start with the first unchecked checkpoint and inspect `git log --oneline -6` and `git status --short --branch`. Ability definitions and build validation are in `js/profile.js`, combat in `js/game.js`, Workshop and HUD in `js/ui.js`, and canvas effects in `js/render.js`. Run each root `test-*.mjs` with Node. Browser verification follows `.claude/skills/verify/SKILL.md`.
