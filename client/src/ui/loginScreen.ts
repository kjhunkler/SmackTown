import { el } from './components';
import { appState } from '@/state/appState';
import { generateClientId } from '@/state/storage';

const USERNAME_RE = /^[A-Za-z0-9 _-]{2,16}$/;

export function renderLoginScreen(root: HTMLElement, onDone: () => void) {
  const errorText = el('div', { class: 'error-text' });
  const input = el('input', {
    type: 'text',
    placeholder: 'Pick a username',
    maxlength: '16',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const submit = () => {
    const value = input.value.trim();
    if (!USERNAME_RE.test(value)) {
      errorText.textContent = '2-16 characters: letters, numbers, spaces, - or _';
      return;
    }
    appState.setIdentity({ clientId: generateClientId(), username: value });
    onDone();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  const screen = el('div', { class: 'screen center-screen' }, [
    el('div', { class: 'brand' }, ['SmackTown']),
    el('div', { class: 'subtitle' }, ['Enter the arena. Pick a name — you can’t change it later.']),
    el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', minWidth: '280px' } }, [
      input,
      errorText,
      el('button', { class: 'primary', onclick: submit }, ['Continue']),
    ]),
  ]);

  root.append(screen);
  input.focus();
  return () => screen.remove();
}
