import { el, clear } from './components';
import { appState } from '@/state/appState';
import {
  ABILITIES,
  ABILITY_COST,
  AUGMENT_COST,
  AUGMENTS,
  MAX_ABILITY_SLOTS,
  MAX_AUGMENT_SLOTS,
  PRESET_COLORS,
  STATS,
  STAT_LEVEL_COST,
  STAT_MAX_LEVEL,
  TOTAL_CREDITS,
  creditsRemaining,
  isValidBuild,
  type AbilityId,
  type AugmentId,
  type FighterBuild,
  type StatId,
} from '@/builder/catalog';

export function renderBuilderScreen(root: HTMLElement, onConfirm: () => void) {
  const build: FighterBuild = structuredClone(appState.build);

  const screen = el('div', { class: 'screen' });
  const creditBar = el('div', { class: 'credit-bar' });
  const layout = el('div', { class: 'builder-layout' });
  const confirmBar = el('div', { class: 'confirm-bar' });
  screen.append(creditBar, layout, confirmBar);
  root.append(screen);

  function repaint() {
    const remaining = creditsRemaining(build);
    clear(creditBar);
    creditBar.append(
      el('div', {}, [el('strong', {}, ['Build Your Fighter'])]),
      el('div', { class: `credit-value ${remaining < 0 ? 'negative' : ''}` }, [`${remaining} / ${TOTAL_CREDITS} credits`]),
    );

    clear(layout);
    layout.append(renderStatsSection(), renderAbilitiesSection(), renderAugmentsSection(), renderColorSection());

    clear(confirmBar);
    const valid = isValidBuild(build);
    confirmBar.append(
      el('button', { class: 'ghost', onclick: () => { Object.assign(build, appState.build); build.stats = { ...appState.build.stats }; build.abilities = [...appState.build.abilities]; build.augments = [...appState.build.augments]; repaint(); } }, ['Reset']),
      el(
        'button',
        {
          class: 'primary',
          disabled: !valid,
          onclick: () => {
            if (!isValidBuild(build)) return;
            appState.setBuild(build);
            onConfirm();
          },
        },
        [valid ? 'Confirm Build' : 'Fix build to continue'],
      ),
    );
  }

  function renderStatsSection() {
    const section = el('div', {}, [el('div', { class: 'section-title' }, [el('h3', {}, ['Stats'])])]);
    for (const stat of STATS) {
      const level = build.stats[stat.id];
      const pips = el(
        'div',
        { class: 'pip-row' },
        Array.from({ length: STAT_MAX_LEVEL }, (_, i) => el('div', { class: `pip ${i < level ? 'filled' : ''}` })),
      );
      const canIncrease = level < STAT_MAX_LEVEL && creditsRemaining(build) >= STAT_LEVEL_COST;
      const canDecrease = level > 1;
      const row = el('div', { class: 'stat-row' }, [
        el('div', { class: 'stat-name' }, [stat.name, el('span', { class: 'desc' }, [stat.description])]),
        pips,
        el('div', { class: 'stepper' }, [
          el('button', { disabled: !canDecrease, onclick: () => updateStat(stat.id, -1) }, ['−']),
          el('span', {}, [String(level)]),
          el('button', { disabled: !canIncrease, onclick: () => updateStat(stat.id, 1) }, ['+']),
        ]),
      ]);
      section.append(row);
    }
    return section;
  }

  function updateStat(id: StatId, delta: number) {
    const next = build.stats[id] + delta;
    if (next < 1 || next > STAT_MAX_LEVEL) return;
    if (delta > 0 && creditsRemaining(build) < STAT_LEVEL_COST) return;
    build.stats[id] = next;
    repaint();
  }

  function renderAbilitiesSection() {
    const section = el('div', {}, [
      el('div', { class: 'section-title' }, [
        el('h3', {}, ['Abilities']),
        el('span', {}, [`${build.abilities.length}/${MAX_ABILITY_SLOTS} picked · ${ABILITY_COST}cr each`]),
      ]),
    ]);
    const grid = el('div', { class: 'pick-grid' });
    for (const ability of ABILITIES) {
      const selected = build.abilities.includes(ability.id);
      const full = build.abilities.length >= MAX_ABILITY_SLOTS;
      const affordable = creditsRemaining(build) >= ABILITY_COST;
      const disabled = !selected && (full || !affordable);
      grid.append(
        el(
          'div',
          {
            class: `pick-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`,
            onclick: () => toggleAbility(ability.id, disabled),
          },
          [
            el('div', {}, [el('span', { class: 'icon' }, [ability.icon]), el('span', { class: 'cost' }, [`${ABILITY_COST}cr`])]),
            el('div', { style: { fontWeight: '700', marginTop: '6px' } }, [ability.name]),
            el('div', { style: { fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' } }, [ability.description]),
          ],
        ),
      );
    }
    section.append(grid);
    return section;
  }

  function toggleAbility(id: AbilityId, disabled: boolean) {
    const selected = build.abilities.includes(id);
    if (!selected && disabled) return;
    build.abilities = selected ? build.abilities.filter((a) => a !== id) : [...build.abilities, id];
    repaint();
  }

  function renderAugmentsSection() {
    const section = el('div', {}, [
      el('div', { class: 'section-title' }, [
        el('h3', {}, ['Augments']),
        el('span', {}, [`${build.augments.length}/${MAX_AUGMENT_SLOTS} picked · ${AUGMENT_COST}cr each`]),
      ]),
    ]);
    const grid = el('div', { class: 'pick-grid' });
    for (const augment of AUGMENTS) {
      const selected = build.augments.includes(augment.id);
      const full = build.augments.length >= MAX_AUGMENT_SLOTS;
      const affordable = creditsRemaining(build) >= AUGMENT_COST;
      const disabled = !selected && (full || !affordable);
      grid.append(
        el(
          'div',
          {
            class: `pick-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`,
            onclick: () => toggleAugment(augment.id, disabled),
          },
          [
            el('div', {}, [el('span', { class: 'icon' }, [augment.icon]), el('span', { class: 'cost' }, [`${AUGMENT_COST}cr`])]),
            el('div', { style: { fontWeight: '700', marginTop: '6px' } }, [augment.name]),
            el('div', { style: { fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' } }, [augment.description]),
          ],
        ),
      );
    }
    section.append(grid);
    return section;
  }

  function toggleAugment(id: AugmentId, disabled: boolean) {
    const selected = build.augments.includes(id);
    if (!selected && disabled) return;
    build.augments = selected ? build.augments.filter((a) => a !== id) : [...build.augments, id];
    repaint();
  }

  function renderColorSection() {
    const section = el('div', {}, [el('div', { class: 'section-title' }, [el('h3', {}, ['Color'])])]);
    const grid = el('div', { class: 'color-grid' });
    for (const color of PRESET_COLORS) {
      grid.append(
        el('div', {
          class: `color-swatch ${build.color === color ? 'selected' : ''}`,
          style: { background: color },
          onclick: () => {
            build.color = color;
            repaint();
          },
        }),
      );
    }
    section.append(grid);
    return section;
  }

  repaint();
  return () => screen.remove();
}
