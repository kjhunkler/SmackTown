# Weapons, Abilities, and Augments Balance Audit

This audit covers the current PvP-facing fighter build system: one free weapon, up to two active abilities, and up to two passive augments from a 1000-credit budget. It also notes PvE expedition interactions where a perk behaves differently.

## Executive summary

The kit has strong identity: weapons are sidegrades, abilities are high-impact cooldown tools, and augments specialize builds without replacing stat investment. The main balance risks are:

1. **Free weapon power compression:** because all weapons are free, any weapon with superior safety plus kill power can dominate without a budget tradeoff.
2. **Low-cost mobility/tempo picks:** Dash Strike, Uppercut, and Anchor cost 200 credits while providing recovery, combo extension, or escape value comparable to pricier options.
3. **Stacked multiplicative damage:** Power, Glass Cannon, Berserker, Brawler/Sniper/Momentum, charge scaling, and Executioner can create burst spikes that may feel abrupt.
4. **Defensive sustain loops:** Shield charging, Bubble, Counter, Mend, Heavyweight, Bulwark, Vampiric, and Reaper can combine into slow, low-risk builds.
5. **Projectile overlap:** Fireball, Volley, Magic, Boomerang, and Sniper compete in ranged space; Fireball's fast cooldown and burn may crowd out Volley.

## Weapons

| Weapon | Current identity | Strengths | Risks | Balance recommendation |
| --- | --- | --- | --- | --- |
| Bare Fists | Baseline smash kit with tap combo and classic charged smashes | Reliable damage, launch, combo access, Brawler synergy | May be the safest all-purpose pick if other weapons carry too many drawbacks | Keep as benchmark; compare every weapon against unarmed time-to-KO and recovery safety. |
| Sword | Fast 0.5s charge, lunging 8-way blade, long/narrow hitbox | Very quick threat, strong mobility, precise reach | Fast charge plus lunge may make whiff-punishing difficult; low launch is the main limiter | Consider slightly longer recovery on whiff or a small damage cut if sword becomes the default dueling weapon. |
| Magic | Mana-gated projectile burst, charge scales damage/range/knockback, hover and recoil/rocket mobility | Strong zoning, recovery tricks, high knockback at low damage | Magic has both ranged pressure and mobility; overcharge can create large threat windows | Watch mana uptime; if oppressive, reduce mana regen before reducing burst identity. |
| Spear | Long stationary thrust with close dead zone; quake for grounded down aim | Best reach and highest single-hit damage when spaced | 17 damage plus range can be oppressive on wide stages; dead zone may be too binary | Keep the dead zone readable; consider +0.03s recovery or slightly lower thrust damage if spacing is too safe. |
| Boomerang | Returning projectile, one active blade, charge improves range and bite | Controls space while user recovers quickly; can hit outbound and return paths | High knockback and quick throw recovery can create low-commitment pressure | If dominant, reduce return speed or add a small post-throw vulnerability instead of lowering damage. |
| Shield | Body-ram lunge, position swap, charging damage reduction, launched victim becomes hazard | Strong displacement, recovery, anti-zoning, team-fight chaos | Combines defense, mobility, stage control, and collateral damage in one free weapon | Highest watch item: consider reducing charge damage reduction from 50% to 60-65% damage taken or trimming slam hazard damage. |

### Weapon priorities

1. **Shield** should be tested first because it carries the most roles at once: mitigation while charging, a strong lunge, position swap, high knockback, and slam collateral.
2. **Magic** should be tested for recovery/pathing abuse because down-cast rocket jump and hover can bypass normal punish windows.
3. **Sword** should be tested for neutral dominance: a very fast charge may make it the easiest weapon to confirm under latency.

## Abilities

| Ability | Cost / cooldown | Current effect | Balance read | Recommendation |
| --- | --- | --- | --- | --- |
| Fireball | 220 / 3.0s | Fast projectile with 6 direct damage plus 6 burn over 1.5s and flame splash | Strong value for shortest cooldown; burn pressures shields and retreats | Consider 3.5s cooldown or reducing burn to 2 ticks if Fireball crowds out Volley. |
| Dash Strike | 200 / 4.0s | Horizontal or up-angled lunge with active melee hitbox | Underpriced because it is engage, recovery, and attack in one | Raise to 220-230 credits or slightly increase cooldown. |
| Shockwave | 250 / 6.0s | Ground slam radial blast; aerial cast fastfalls into pending shock | Fair as high-impact area denial with commitment | Keep cost; ensure aerial startup remains punishable. |
| Uppercut | 200 / 4.0s | Vertical launch with very high knockback | Extremely high KO threat for a low-cost tool | Raise to 230-240 credits or reduce knockback slightly. |
| Counter | 240 / 5.0s | 0.6s parry stance | Healthy if punishable on bait | Keep; consider clearer whiff/endlag feedback before numeric nerfs. |
| Blink | 260 / 4.0s | 150-unit teleport with brief invulnerability | Expensive and versatile; likely fair | Keep at premium price. |
| Fire Volley | 250 / 5.0s | Three burning bolts in a fan | Good coverage but may be overshadowed by Fireball's 3s cycle | Differentiate by improving spread control or lowering cost to 240 if pick rate lags. |
| Gale Burst | 220 / 5.0s | Low damage radial shove | Utility is matchup-dependent | Likely fair; could lower cooldown to 4.5s if underpicked. |
| Bubble Shield | 240 / 6.0s | 1.5s invulnerability | Strong defensive reset | Keep; watch with Mend/Heavy/Bulwark sustain shells. |
| Mend | 260 / 7.0s | Heal 15% or reduce PvP percent by 15 | Clear defensive value with long cooldown and high cost | Keep; prevent stacking with excessive stall tools via mode rules if needed. |
| Grapple Hook | 240 / 4.5s | Projectile reel-in, pull scales with flight distance | High-skill combo starter; range-dependent reward is healthy | Keep; monitor ledge/corner confirms. |
| Spike Trap | 230 / 6.0s | 8 damage, launch, 1.5s stun, 6s armed trap | Long stun may enable guaranteed KOs from hidden/stacked placements | Consider shorter stun (1.2-1.3s) or clearer arming telegraph. |
| Second Wind / Anchor | 200 / 6.0s | Drop beacon, reactivate during cooldown to teleport back with brief invulnerability | Underpriced escape/recovery/position reset | Raise to 230-240 credits or reduce teleport invulnerability. |

### Ability priorities

1. **Dash Strike, Uppercut, and Anchor** are the likely underpriced tier at 200 credits.
2. **Fireball vs Volley** needs role separation: Fireball currently has very high uptime and burn value, while Volley is costlier and slower.
3. **Trap** should be checked for guaranteed follow-ups, because 1.5s of stun is much longer than standard hitstun caps.

## Augments

| Augment | Cost | Current effect | Balance read | Recommendation |
| --- | --- | --- | --- | --- |
| Vampiric | 170 | Heal 12% of damage dealt; 4% in expeditions | Strong sustain, especially with high-damage spear/uppercut-style hits | Keep cost; monitor with Glass Cannon and Power. |
| Thorns | 160 | Melee attackers take 4% recoil | Good deterrent, simple counterplay through projectiles | Fair; may be underwhelming versus ranged metas. |
| Featherweight | 140 | +1 midair jump, +8% knockback taken | Cheap, high mobility, real defensive downside | Fair; watch with Acrobat for air-jump loops. |
| Heavyweight | 160 | -15% knockback taken, -5% run speed | Efficient survivability | Fair but strong with Defense/Bulwark/Bubble. |
| Berserker | 170 | +20% damage at 80%+; low HP in expeditions | Comeback damage can stack multiplicatively | Keep; consider lowering to +15% if burst deaths feel sudden. |
| Glass Cannon | 170 | +18% damage/knockback dealt, +18% knockback taken | Strong, readable risk/reward | Fair; currently implemented as +20% offense despite description saying +18%. Fix mismatch. |
| Quick Hands | 180 | Ability cooldowns recover 20% faster | Extremely high value for two-ability builds | Consider 190-200 credits or 15% faster cooldowns if ability spam dominates. |
| Acrobat | 150 | Hit refreshes air jumps | High ceiling with multi-hit/tap/projectile confirms | Watch for infinite chase loops; may need once-per-airtime limit. |
| Sniper | 160 | Projectiles deal +20% damage | Good with Magic/Fireball/Volley/Boomerang | Fair; verify whether weapon projectiles should count consistently. |
| Momentum | 150 | Fast-moving melee hits deal +15% | Encourages active play; can stack with dash/lunge weapons | Fair; watch sword/shield lunge synergy. |
| Brawler | 160 | Tap kit deals +25% damage | Strong but scoped away from weapons | Fair; valuable for unarmed/tap specialists. |
| Bulwark | 150 | Duck guard wears 40% slower | Strong defensive layer at low price | Consider 160-170 if guard-heavy play slows matches. |
| Executioner | 160 | +20% knockback at 100%+; PvE low-HP damage | Finish enhancer, not neutral power | Fair. |
| Reaper | 170 | KO heal 50%; PvE 2% per creep | Swingy in free-for-all or PvE sustain | Watch snowballing in multi-player; lower PvP heal to 35-40% if needed. |

### Augment priorities

1. **Fix Glass Cannon description/implementation mismatch.** The UI promises +18%, but derived stats apply a 1.2 multiplier.
2. **Quick Hands** is probably the most efficient augment when paired with two premium abilities.
3. **Bulwark + Heavyweight + Defense** should be tested for timeout/stall risk.
4. **Acrobat + Featherweight** should be tested for air-combo escape and chase loops.

## Suggested balance changes to test first

These are intentionally conservative and easy to A/B test:

1. **Increase low-cost utility ability prices:** Dash Strike 200→220, Uppercut 200→230, Anchor 200→230.
2. **Fix Glass Cannon mismatch:** either update the description to +20% or lower the implementation to 1.18. Prefer lowering implementation to match the displayed contract.
3. **Add a Shield watchlist nerf:** test shield charge damage taken at 0.60 instead of 0.50, or reduce slam hazard damage from 8 to 6.
4. **Differentiate Fireball and Volley:** Fireball cooldown 3.0→3.5, or Volley cost 250→240 / cooldown 5.0→4.5.
5. **Cap Acrobat loops:** if playtests show repeated air-jump resets from multi-hit moves, make Acrobat refresh at most once before landing.
6. **Raise Quick Hands cost or reduce magnitude:** 180→200 credits, or cooldown multiplier 0.80→0.85.

## Playtest metrics to collect

- Weapon pick rate and win rate by stage.
- Average damage per minute by weapon and by ability pair.
- Time-to-KO at 0, 60, and 100 percent for each weapon.
- Ability casts per minute and damage/KO conversion per cast.
- Average match duration for defensive builds using Heavyweight, Bulwark, Bubble, Mend, Vampiric, or Reaper.
- KO attribution from trap stun, shield slam collateral, and magic overcharge.
- Recovery success rate by weapon after being launched offstage.
